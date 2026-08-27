import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireOneOfPermissions, requirePermission } from '../auth/authorization.js';
import { isIsoDate, isPositiveInteger } from '../validation.js';
import { calculateAnnualizedTax, calculatePhilippineWithholding } from '../payroll/tax.js';
import { allocateStatutoryContributions, calculateStatutoryContributions, classifyBenefits } from '../payroll/compliance.js';
import {
  currentDepartmentSql,
  currentJobTitleSql,
  currentOrganizationJoin
} from '../organization/current-organization-query.js';
import { ensureOrganizationSchema } from './organization.js';

export const payrollRouter = Router();
const payBases = new Set(['monthly','daily','hourly']);
const payFrequencies = new Set(['weekly','biweekly','semi_monthly','monthly']);
const taxStatuses = new Set(['taxable','exempt']);
const calculations = new Set(['fixed','percentage']);
const contributionSchedules = new Set(['split_evenly','first_cutoff','second_cutoff']);
const maximumMoneyValue = 999_999_999_999.99;

function validMoney(value) {
  return Number.isFinite(value) && value >= 0 && value <= maximumMoneyValue
    && Math.abs(value * 100 - Math.round(value * 100)) <= 1e-7;
}

payrollRouter.get('/employees', ...requireOneOfPermissions([['payroll_setup','view'], ['payout_view','view']]), async (request,response,next) => {
  try {
    await ensureOrganizationSchema();
    const search=String(request.query.search||'').trim(); const pattern=`%${search}%`;
    const result=await pool.query(
      `SELECT employee.id, employee.employee_number AS "employeeNumber",
              employee.first_name AS "firstName", employee.last_name AS "lastName",
              ${currentJobTitleSql} AS "jobTitle", ${currentDepartmentSql} AS department,
              employee.employment_status AS "employmentStatus",
              profile.base_rate AS "baseRate", profile.pay_basis AS "payBasis",
              profile.pay_frequency AS "payFrequency"
       FROM employee_profiles employee
       ${currentOrganizationJoin}
       LEFT JOIN employee_payroll_profiles profile ON profile.employee_id=employee.id
       WHERE ($1='' OR employee.employee_number ILIKE $2 OR employee.first_name ILIKE $2
          OR employee.last_name ILIKE $2 OR ${currentJobTitleSql} ILIKE $2 OR ${currentDepartmentSql} ILIKE $2)
       ORDER BY employee.employment_status='active' DESC, employee.last_name, employee.first_name
       LIMIT 200`,
      [search,pattern]
    );
    return response.json({employees:result.rows});
  } catch(error){return next(error);}
});

payrollRouter.get('/employees/:employeeId', ...requirePermission('payroll_setup','view'), async (request,response,next) => {
  try {
    if(!isPositiveInteger(request.params.employeeId))return response.status(400).json({error:'A valid employee is required.'});
    await ensureOrganizationSchema();
    const [employee,profile,components]=await Promise.all([
      pool.query(
        `SELECT employee.id, employee.employee_number AS "employeeNumber",
                employee.first_name AS "firstName", employee.last_name AS "lastName",
                ${currentJobTitleSql} AS "jobTitle", ${currentDepartmentSql} AS department,
                employee.employment_status AS "employmentStatus"
         FROM employee_profiles employee
         ${currentOrganizationJoin}
         WHERE employee.id=$1`,
        [request.params.employeeId]
      ),
      pool.query(`SELECT pay_basis AS "payBasis", pay_frequency AS "payFrequency", base_rate AS "baseRate", standard_hours_per_day AS "standardHoursPerDay", tax_status AS "taxStatus", effective_date AS "effectiveDate", is_minimum_wage_earner AS "isMinimumWageEarner", auto_calculate_contributions AS "autoCalculateContributions", contribution_deduction_schedule AS "contributionDeductionSchedule", employee_classification AS "employeeClassification", sss_employee_share AS "sssEmployeeShare", philhealth_employee_share AS "philhealthEmployeeShare", pagibig_employee_share AS "pagibigEmployeeShare", union_dues AS "unionDues", notes FROM employee_payroll_profiles WHERE employee_id=$1`,[request.params.employeeId]),
      pool.query(`SELECT id, component_type AS "type", name, amount, calculation, is_taxable AS "isTaxable", is_active AS "isActive" FROM employee_payroll_components WHERE employee_id=$1 ORDER BY component_type,name,id`,[request.params.employeeId])
    ]);
    if(!employee.rowCount)return response.status(404).json({error:'Employee not found.'});
    return response.json({employee:employee.rows[0],profile:profile.rows[0]||null,components:components.rows});
  } catch(error){return next(error);}
});

payrollRouter.put('/employees/:employeeId', ...requirePermission('payroll_setup','update'), async (request,response,next) => {
  const client=await pool.connect();
  try {
    const employeeId=String(request.params.employeeId); const body=request.body||{};
    const baseRate=Number(body.baseRate), hours=Number(body.standardHoursPerDay); const components=Array.isArray(body.components)?body.components:[]; const contributions=['sssEmployeeShare','philhealthEmployeeShare','pagibigEmployeeShare','unionDues'].map(key=>Number(body[key]||0));
    const effectiveDate=String(body.effectiveDate||'');
    const notes=String(body.notes||'').trim();
    if(!isPositiveInteger(employeeId)||!payBases.has(body.payBasis)||!payFrequencies.has(body.payFrequency)||!taxStatuses.has(body.taxStatus)||!contributionSchedules.has(body.contributionDeductionSchedule||'split_evenly')||!validMoney(baseRate)||!Number.isFinite(hours)||hours<=0||hours>24||Math.abs(hours*100-Math.round(hours*100))>1e-7||(effectiveDate&&!isIsoDate(effectiveDate))||notes.length>5000||contributions.some(value=>!validMoney(value)))return response.status(400).json({error:'Enter valid payroll settings.'});
    if(components.length>200||components.some((item)=>!['earning','deduction'].includes(item.type)||!String(item.name||'').trim()||String(item.name).trim().length>100||!calculations.has(item.calculation)||!validMoney(Number(item.amount))||(item.calculation==='percentage'&&Number(item.amount)>100)))return response.status(400).json({error:'Enter valid earnings and deductions.'});
    await client.query('BEGIN');
    const saved=await client.query(`INSERT INTO employee_payroll_profiles (employee_id,pay_basis,pay_frequency,base_rate,standard_hours_per_day,tax_status,effective_date,is_minimum_wage_earner,auto_calculate_contributions,contribution_deduction_schedule,sss_employee_share,philhealth_employee_share,pagibig_employee_share,union_dues,notes,updated_by) SELECT id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16 FROM employee_profiles WHERE id=$1 ON CONFLICT(employee_id) DO UPDATE SET pay_basis=EXCLUDED.pay_basis,pay_frequency=EXCLUDED.pay_frequency,base_rate=EXCLUDED.base_rate,standard_hours_per_day=EXCLUDED.standard_hours_per_day,tax_status=EXCLUDED.tax_status,effective_date=EXCLUDED.effective_date,is_minimum_wage_earner=EXCLUDED.is_minimum_wage_earner,auto_calculate_contributions=EXCLUDED.auto_calculate_contributions,contribution_deduction_schedule=EXCLUDED.contribution_deduction_schedule,sss_employee_share=EXCLUDED.sss_employee_share,philhealth_employee_share=EXCLUDED.philhealth_employee_share,pagibig_employee_share=EXCLUDED.pagibig_employee_share,union_dues=EXCLUDED.union_dues,notes=EXCLUDED.notes,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING employee_id`,[employeeId,body.payBasis,body.payFrequency,baseRate,hours,body.taxStatus,effectiveDate||null,Boolean(body.isMinimumWageEarner),body.autoCalculateContributions!==false,body.contributionDeductionSchedule||'split_evenly',...contributions,notes,request.user.id]);
    if(!saved.rowCount){await client.query('ROLLBACK');return response.status(404).json({error:'Employee not found.'});}
    await client.query('DELETE FROM employee_payroll_components WHERE employee_id=$1',[employeeId]);
    for(const item of components)await client.query(`INSERT INTO employee_payroll_components(employee_id,component_type,name,amount,calculation,is_taxable,is_active) VALUES($1,$2,$3,$4,$5,$6,$7)`,[employeeId,item.type,String(item.name).trim(),Number(item.amount),item.calculation,Boolean(item.isTaxable),item.isActive!==false]);
    await client.query('COMMIT'); return response.json({message:'Payroll setup saved.'});
  } catch(error){await client.query('ROLLBACK');return next(error);} finally{client.release();}
});

payrollRouter.post('/employees/:employeeId/tax-preview', ...requirePermission('payroll_setup', 'view'), async (request, response, next) => {
  try {
    if (!isPositiveInteger(request.params.employeeId)) return response.status(400).json({ error:'A valid employee is required.' });
    const date = String(request.body?.payDate || new Date().toISOString().slice(0, 10));
    const numericFields = ['regularCompensation', 'supplementaryCompensation', 'otherNonTaxableCompensation', 'yearToDateTaxableCompensation', 'yearToDateTaxWithheld'];
    if (!isIsoDate(date) || numericFields.some((field) => request.body?.[field] !== undefined
      && (!Number.isFinite(Number(request.body[field])) || Number(request.body[field]) < 0))) {
      return response.status(400).json({ error:'Enter a valid pay date and non-negative payroll amounts.' });
    }
    const profileResult = await pool.query(
      `SELECT pay_basis AS "payBasis", pay_frequency AS "payFrequency", base_rate AS "baseRate",
              tax_status AS "taxStatus", is_minimum_wage_earner AS "isMinimumWageEarner",
              auto_calculate_contributions AS "autoCalculateContributions",
              contribution_deduction_schedule AS "contributionDeductionSchedule",
              sss_employee_share AS "sssEmployeeShare", philhealth_employee_share AS "philhealthEmployeeShare",
              pagibig_employee_share AS "pagibigEmployeeShare", union_dues AS "unionDues"
       FROM employee_payroll_profiles WHERE employee_id=$1`,
      [request.params.employeeId]
    );
    if (!profileResult.rowCount) return response.status(404).json({ error:'Save the employee payroll setup first.' });
    const profile = profileResult.rows[0];
    const suppliedRegular = request.body?.regularCompensation;
    if (profile.payBasis !== 'monthly'
      && (suppliedRegular === undefined || String(suppliedRegular).trim() === '')) {
      return response.status(400).json({
        error:'Enter the employee regular compensation for this pay period.'
      });
    }
    const tableFrequency = profile.payFrequency === 'biweekly' ? 'weekly' : profile.payFrequency;
    const configuration = await pool.query(
      `SELECT id, name, exemption_amount::double precision AS "exemptionAmount"
       FROM tax_configurations
       WHERE pay_frequency=$1 AND is_active=TRUE AND effective_from<=$2::date
         AND (effective_to IS NULL OR effective_to>=$2::date)
       ORDER BY effective_from DESC LIMIT 2`,
      [tableFrequency, date]
    );
    if (configuration.rowCount !== 1) {
      return response.status(409).json({
        error:configuration.rowCount
          ? 'Multiple active tax configurations match this pay date.'
          : 'No active tax configuration matches this pay date and frequency.'
      });
    }
    const bracketResult = await pool.query(
      `SELECT lower_bound AS "lowerBound", upper_bound AS "upperBound",
              base_tax AS "baseTax", rate_percent AS "ratePercent"
       FROM tax_brackets WHERE configuration_id=$1 ORDER BY lower_bound`,
      [configuration.rows[0].id]
    );
    let regular = profile.payBasis === 'monthly' ? Number(profile.baseRate) : Number(suppliedRegular);
    if (profile.payBasis === 'monthly' && profile.payFrequency === 'semi_monthly') regular /= 2;
    if (profile.payBasis === 'monthly' && profile.payFrequency === 'weekly') regular = regular * 12 / 52;
    if (profile.payBasis === 'monthly' && profile.payFrequency === 'biweekly') regular = regular * 12 / 26;
    const earnings = await pool.query(
      `SELECT amount, calculation, is_taxable AS "isTaxable"
       FROM employee_payroll_components
       WHERE employee_id=$1 AND component_type='earning' AND is_active=TRUE`,
      [request.params.employeeId]
    );
    const taxableEarnings = earnings.rows.filter((item) => item.isTaxable).reduce((sum, item) =>
      sum + (item.calculation === 'percentage' ? regular * Number(item.amount) / 100 : Number(item.amount)), 0);
    const nonTaxable = earnings.rows.filter((item) => !item.isTaxable).reduce((sum, item) =>
      sum + (item.calculation === 'percentage' ? regular * Number(item.amount) / 100 : Number(item.amount)), 0)
      + Number(request.body?.otherNonTaxableCompensation || 0);
    const monthlyContributions = calculateStatutoryContributions(profile.baseRate);
    const allocated = allocateStatutoryContributions(monthlyContributions, {
      frequency:profile.payFrequency,
      payDate:date,
      schedule:profile.contributionDeductionSchedule
    });
    const contributions = profile.autoCalculateContributions && profile.payBasis === 'monthly'
      ? allocated
      : {
        sssEmployee:Number(profile.sssEmployeeShare),
        philhealthEmployee:Number(profile.philhealthEmployeeShare),
        pagibigEmployee:Number(profile.pagibigEmployeeShare),
        totalEmployee:Number(profile.sssEmployeeShare) + Number(profile.philhealthEmployeeShare) + Number(profile.pagibigEmployeeShare),
        allocation:{ frequency:profile.payFrequency, schedule:'manual', payDate:date }
      };
    const mandatory = contributions.totalEmployee + Number(profile.unionDues);
    const result = calculatePhilippineWithholding({
      regularCompensation:regular,
      supplementaryCompensation:taxableEarnings + nonTaxable
        + Number(request.body?.supplementaryCompensation || 0),
      nonTaxableCompensation:nonTaxable,
      mandatoryContributions:mandatory,
      exemptionAmount:configuration.rows[0].exemptionAmount,
      taxStatus:profile.taxStatus,
      isMinimumWageEarner:profile.isMinimumWageEarner,
      frequency:profile.payFrequency,
      brackets:bracketResult.rows
    });
    const annualTax = calculateAnnualizedTax(Number(request.body?.yearToDateTaxableCompensation || 0) + result.taxableIncome);
    return response.json({
      ...result,
      configuration:configuration.rows[0],
      contributions,
      annualizedTax:annualTax,
      yearEndBalance:Math.round((annualTax - Number(request.body?.yearToDateTaxWithheld || 0) - result.tax) * 100) / 100
    });
  } catch (error) {
    return next(error);
  }
});
