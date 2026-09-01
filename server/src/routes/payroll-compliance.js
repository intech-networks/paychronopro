import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requirePermission } from '../auth/authorization.js';
import { isIsoDate, isPositiveInteger } from '../validation.js';
import { calculateAnnualizedTax, calculatePhilippineWithholding } from '../payroll/tax.js';
import {
  allocateStatutoryContributions,
  calculateStatutoryContributions,
  classifyBenefits,
  deMinimisLimits2026
} from '../payroll/compliance.js';
import { validatePayrollRunInput } from '../payroll/run-validation.js';
import { canTransitionPayrollRun, payrollRunStatuses } from '../payroll/run-status.js';
import { isPayrollPeriodShapeValid } from '../payroll/period-validation.js';
import { validatePayrollRunPreviews } from '../payroll/run-preview-validation.js';
import { config } from '../config.js';

export const payrollComplianceRouter = Router();
const maximumMoneyValue = 999_999_999_999.99;
const benefitCategories = new Set([...Object.keys(deMinimisLimits2026), 'overtime_meal']);

function validPayrollAmount(value) {
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && amount >= 0 && amount <= maximumMoneyValue
    && Math.abs(amount * 100 - cents) <= 1e-7;
}

function parseBenefits(body) {
  const benefits = body.benefits == null ? [] : body.benefits;
  const yearToDateByCategory = body.yearToDateByCategory == null ? {} : body.yearToDateByCategory;
  if (!Array.isArray(benefits) || benefits.length > 100) {
    return { error:'Benefits must be a list with no more than 100 entries.' };
  }
  if (!yearToDateByCategory || typeof yearToDateByCategory !== 'object'
    || Array.isArray(yearToDateByCategory)) {
    return { error:'Year-to-date benefit totals must be an object.' };
  }
  if (benefits.some((benefit) => !benefit || typeof benefit !== 'object'
    || Array.isArray(benefit) || !benefitCategories.has(String(benefit.category || ''))
    || !validPayrollAmount(benefit.amount)
    || (benefit.qualifiedDays !== undefined
      && (!Number.isInteger(Number(benefit.qualifiedDays))
        || Number(benefit.qualifiedDays) < 1 || Number(benefit.qualifiedDays) > 366)))) {
    return { error:'Enter valid benefit categories, amounts, and qualified days.' };
  }
  if (Object.entries(yearToDateByCategory).some(([category, amount]) =>
    !benefitCategories.has(category) || !validPayrollAmount(amount))) {
    return { error:'Enter valid year-to-date benefit categories and amounts.' };
  }
  return { value:{ benefits, yearToDateByCategory } };
}

payrollComplianceRouter.get(
  '/runs',
  ...requirePermission('payroll_setup', 'view'),
  async (request, response, next) => {
    try {
      const status = String(request.query.status || '');
      if (status && !payrollRunStatuses.includes(status)) {
        return response.status(400).json({ error:'Select a valid payroll run status.' });
      }
      const result = await pool.query(
        `SELECT run.id, run.period_start AS "periodStart", run.period_end AS "periodEnd",
                run.pay_date AS "payDate", run.status, run.created_at AS "createdAt",
                COUNT(item.id)::integer AS "employeeCount",
                COALESCE(SUM(item.gross_compensation),0) AS "grossCompensation",
                COALESCE(SUM(item.net_pay),0) AS "netPay"
         FROM payroll_runs run
         LEFT JOIN payroll_run_items item ON item.run_id=run.id
         WHERE ($1='' OR run.status=$1)
         GROUP BY run.id
         ORDER BY run.pay_date DESC, run.id DESC
         LIMIT 200`,
        [status]
      );
      return response.json({ runs:result.rows });
    } catch (error) {
      return next(error);
    }
  }
);

payrollComplianceRouter.post(
  '/employees/:employeeId/compliance-preview',
  ...requirePermission('payroll_setup', 'view'),
  async (request, response, next) => {
    try {
      if (!isPositiveInteger(request.params.employeeId)) {
        return response.status(400).json({ error:'A valid employee is required.' });
      }

      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return response.status(400).json({ error:'Enter a valid payroll calculation request.' });
      }
      const date = String(body.payDate || new Date().toISOString().slice(0, 10));
      const numericFields = [
        'monthlyBasicSalary',
        'regularCompensation',
        'supplementaryCompensation',
        'otherNonTaxableCompensation',
        'yearToDateTaxableCompensation',
        'yearToDateTaxWithheld',
        'managerialFringeBenefits',
        'thirteenthMonthAndOtherBenefits',
        'yearToDateThirteenthAndOther',
        'minimumDailyWage'
      ];
      const hasInvalidAmount = numericFields.some((field) => body[field] !== undefined
        && !validPayrollAmount(body[field]));
      if (!isIsoDate(date) || hasInvalidAmount) {
        return response.status(400).json({
          error:'Enter a valid pay date and non-negative payroll amounts.'
        });
      }
      const parsedBenefits = parseBenefits(body);
      if (parsedBenefits.error) return response.status(400).json({ error:parsedBenefits.error });

      const profileResult = await pool.query(
        `SELECT pay_basis AS "payBasis", pay_frequency AS "payFrequency",
                base_rate AS "baseRate", tax_status AS "taxStatus",
                monthly_contribution_base AS "monthlyContributionBase",
                is_minimum_wage_earner AS "isMinimumWageEarner",
                minimum_wage_region AS "minimumWageRegion",
                minimum_daily_wage AS "minimumDailyWage",
                employee_classification AS "employeeClassification",
                auto_calculate_contributions AS "autoCalculateContributions",
                contribution_deduction_schedule AS "contributionDeductionSchedule",
                sss_employee_share AS "sssEmployeeShare",
                philhealth_employee_share AS "philhealthEmployeeShare",
                pagibig_employee_share AS "pagibigEmployeeShare",
                union_dues AS "unionDues"
         FROM employee_payroll_profiles
         WHERE employee_id=$1`,
        [request.params.employeeId]
      );
      if (!profileResult.rowCount) {
        return response.status(404).json({ error:'Save the employee payroll setup first.' });
      }

      const profile = profileResult.rows[0];
      if (profile.isMinimumWageEarner
        && (!(Number(profile.minimumDailyWage) > 0) || !String(profile.minimumWageRegion || '').trim())) {
        return response.status(409).json({
          error:'Set the applicable wage region and minimum daily wage before applying minimum-wage tax treatment.'
        });
      }
      const suppliedRegular = body.regularCompensation;
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
         ORDER BY effective_from DESC
         LIMIT 2`,
        [tableFrequency, date]
      );
      if (configuration.rowCount !== 1) {
        return response.status(409).json({
          error:configuration.rowCount
            ? 'Multiple active tax configurations match.'
            : 'No active tax configuration matches.'
        });
      }

      const brackets = (await pool.query(
        `SELECT lower_bound AS "lowerBound", upper_bound AS "upperBound",
                base_tax AS "baseTax", rate_percent AS "ratePercent"
         FROM tax_brackets
         WHERE configuration_id=$1
         ORDER BY lower_bound`,
        [configuration.rows[0].id]
      )).rows;

      const monthlyBasicInput = body.monthlyBasicSalary;
      const monthlyBasic = Number(monthlyBasicInput === undefined
        || String(monthlyBasicInput).trim() === ''
        ? (profile.monthlyContributionBase || profile.baseRate) : monthlyBasicInput);
      if (!(monthlyBasic > 0)) {
        return response.status(409).json({
          error:'Set the employee monthly statutory contribution base before calculating compliance.'
        });
      }
      const monthlyContributions = calculateStatutoryContributions(monthlyBasic, { payDate:date });
      const allocated = allocateStatutoryContributions(monthlyContributions, {
        frequency:profile.payFrequency,
        payDate:date,
        schedule:profile.contributionDeductionSchedule
      });
      const contributions = profile.autoCalculateContributions
        ? allocated
        : {
          ...allocated,
          sssEmployee:Number(profile.sssEmployeeShare),
          philhealthEmployee:Number(profile.philhealthEmployeeShare),
          pagibigEmployee:Number(profile.pagibigEmployeeShare),
          totalEmployee:Number(profile.sssEmployeeShare)
            + Number(profile.philhealthEmployeeShare)
            + Number(profile.pagibigEmployeeShare),
          totalContribution:allocated.totalEmployer + Number(profile.sssEmployeeShare)
            + Number(profile.philhealthEmployeeShare) + Number(profile.pagibigEmployeeShare),
          allocation:{ ...allocated.allocation, employeeMethod:'manual' }
        };

      let regular = profile.payBasis === 'monthly' ? Number(profile.baseRate) : Number(suppliedRegular);
      if (profile.payBasis === 'monthly' && profile.payFrequency === 'semi_monthly') regular /= 2;
      if (profile.payBasis === 'monthly' && profile.payFrequency === 'weekly') regular = regular * 12 / 52;
      if (profile.payBasis === 'monthly' && profile.payFrequency === 'biweekly') regular = regular * 12 / 26;

      const recurringEarningResult = await pool.query(
        `SELECT amount, calculation, is_taxable AS "isTaxable",
                benefit_category AS "benefitCategory"
         FROM employee_payroll_components
         WHERE employee_id=$1 AND component_type='earning' AND is_active=TRUE`,
        [request.params.employeeId]
      );
      const recurringEarningValue = (earning) => earning.calculation === 'percentage'
        ? regular * Number(earning.amount) / 100
        : Number(earning.amount);
      const recurringCategorized = recurringEarningResult.rows.filter((earning) =>
        earning.benefitCategory && earning.benefitCategory !== 'thirteenth_month');
      const recurringThirteenth = recurringEarningResult.rows.filter((earning) =>
        earning.benefitCategory === 'thirteenth_month');
      const benefits = classifyBenefits({
        ...body,
        benefits:[
          ...parsedBenefits.value.benefits,
          ...recurringCategorized.map((earning) => ({
            category:earning.benefitCategory,
            amount:recurringEarningValue(earning),
            qualifiedDays:earning.benefitCategory === 'overtime_meal'
              ? Number(body.qualifiedDays || 1) : undefined
          }))
        ],
        yearToDateByCategory:parsedBenefits.value.yearToDateByCategory,
        thirteenthMonthAndOtherBenefits:Number(body.thirteenthMonthAndOtherBenefits || 0)
          + recurringThirteenth.reduce((sum, earning) => sum + recurringEarningValue(earning), 0)
      });
      const recurringTaxable = recurringEarningResult.rows.filter((earning) =>
        !earning.benefitCategory && earning.isTaxable)
        .reduce((sum, earning) => sum + recurringEarningValue(earning), 0);
      const recurringNonTaxable = recurringEarningResult.rows.filter((earning) =>
        !earning.benefitCategory && !earning.isTaxable)
        .reduce((sum, earning) => sum + recurringEarningValue(earning), 0);
      const nonTaxable = Number(body.otherNonTaxableCompensation || 0)
        + benefits.totalNonTaxable + recurringNonTaxable;
      const mandatory = contributions.totalEmployee + Number(profile.unionDues || 0);
      const result = calculatePhilippineWithholding({
        regularCompensation:regular,
        supplementaryCompensation:Number(body.supplementaryCompensation || 0)
          + benefits.totalTaxable + recurringTaxable + nonTaxable,
        nonTaxableCompensation:nonTaxable,
        mandatoryContributions:mandatory,
        exemptionAmount:configuration.rows[0].exemptionAmount,
        taxStatus:profile.taxStatus,
        isMinimumWageEarner:profile.isMinimumWageEarner,
        frequency:profile.payFrequency,
        brackets
      });
      const annualizedTax = calculateAnnualizedTax(
        Number(body.yearToDateTaxableCompensation || 0) + result.taxableIncome
      );

      return response.json({
        ...result,
        configuration:configuration.rows[0],
        contributions,
        benefits,
        recurringEarnings:{ taxable:recurringTaxable, nonTaxable:recurringNonTaxable },
        annualizedTax,
        yearEndBalance:Math.round((annualizedTax
          - Number(body.yearToDateTaxWithheld || 0) - result.tax) * 100) / 100,
        fringeBenefitTaxRequired:profile.employeeClassification === 'managerial'
          && Number(body.managerialFringeBenefits || 0) > 0
      });
    } catch (error) {
      return next(error);
    }
  }
);

payrollComplianceRouter.post(
  '/runs',
  ...requirePermission('payroll_setup', 'create'),
  async (request, response, next) => {
    const parsed = validatePayrollRunInput(request.body);
    if (parsed.error) return response.status(400).json({ error:parsed.error });

    const previewValidation = validatePayrollRunPreviews(
      parsed.value.items,
      config.sessionSecret
    );
    if (previewValidation.error) {
      return response.status(previewValidation.status).json({ error:previewValidation.error });
    }

    const client = await pool.connect();
    let transactionStarted = false;
    try {
      const { periodStart, periodEnd, payDate, items } = parsed.value;
      await client.query('BEGIN');
      transactionStarted = true;
      const employeeIds = items.map((item) => item.employeeId);
      const employees = await client.query(
        `SELECT employee.id::text AS id, profile.pay_frequency AS "payFrequency"
         FROM employee_profiles employee
         LEFT JOIN employee_payroll_profiles profile ON profile.employee_id=employee.id
         WHERE employee.id=ANY($1::bigint[])`,
        [employeeIds]
      );
      if (employees.rowCount !== employeeIds.length) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return response.status(400).json({ error:'One or more payroll employees no longer exist.' });
      }
      if (employees.rows.some((employee) => !employee.payFrequency)) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return response.status(400).json({
          error:'Save the payroll setup for every employee before creating a payroll run.'
        });
      }
      if (employees.rows.some((employee) => !isPayrollPeriodShapeValid({
        frequency:employee.payFrequency,
        periodStart,
        periodEnd
      }))) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return response.status(400).json({
          error:'The payroll period does not match one or more employee pay frequencies.'
        });
      }

      const run = await client.query(
        `INSERT INTO payroll_runs(period_start, period_end, pay_date, created_by)
         VALUES($1,$2,$3,$4)
         RETURNING id, status`,
        [periodStart, periodEnd, payDate, request.user.id]
      );
      for (const item of items) {
        await client.query(
          `INSERT INTO payroll_run_items(
             run_id, employee_id, gross_compensation, taxable_compensation,
             non_taxable_compensation, sss_employee, sss_employer, sss_ec_employer,
             philhealth_employee, philhealth_employer, pagibig_employee, pagibig_employer,
             union_dues, tax_withheld, tax_refund, net_pay, calculation
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            run.rows[0].id,
            item.employeeId,
            item.grossCompensation,
            item.taxableIncome,
            item.nonTaxableCompensation,
            item.sssEmployee,
            item.sssEmployer,
            item.sssEcEmployer,
            item.philhealthEmployee,
            item.philhealthEmployer,
            item.pagibigEmployee,
            item.pagibigEmployer,
            item.unionDues,
            item.tax,
            item.taxRefund,
            item.netPay,
            JSON.stringify(item.calculation)
          ]
        );
      }
      await client.query('COMMIT');
      transactionStarted = false;
      return response.status(201).json({ run:run.rows[0] });
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK');
      return next(error);
    } finally {
      client.release();
    }
  }
);

payrollComplianceRouter.put(
  '/runs/:runId/status',
  ...requirePermission('payroll_setup', 'update'),
  async (request, response, next) => {
    if (!isPositiveInteger(request.params.runId)) {
      return response.status(400).json({ error:'A valid payroll run is required.' });
    }
    const nextStatus = String(request.body?.status || '');
    if (!['finalized', 'void'].includes(nextStatus)) {
      return response.status(400).json({ error:'A payroll run can only be finalized or voided.' });
    }

    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      await client.query("SELECT pg_advisory_xact_lock(hashtext('paytimepro:payroll-run-finalization'))");
      const current = await client.query(
        `SELECT id, status, period_start AS "periodStart", period_end AS "periodEnd"
         FROM payroll_runs
         WHERE id=$1
         FOR UPDATE`,
        [request.params.runId]
      );
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return response.status(404).json({ error:'Payroll run not found.' });
      }
      if (!canTransitionPayrollRun(current.rows[0].status, nextStatus)) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return response.status(409).json({
          error:`A ${current.rows[0].status} payroll run cannot be changed to ${nextStatus}.`
        });
      }

      if (nextStatus === 'finalized' && current.rows[0].status !== 'finalized') {
        const conflict = await client.query(
          `SELECT existing.id
           FROM payroll_runs existing
           JOIN payroll_run_items existing_item ON existing_item.run_id=existing.id
           JOIN payroll_run_items current_item ON current_item.run_id=$1
             AND current_item.employee_id=existing_item.employee_id
           WHERE existing.id<>$1 AND existing.status='finalized'
             AND daterange(existing.period_start, existing.period_end, '[]')
               && daterange($2::date, $3::date, '[]')
           LIMIT 1`,
          [request.params.runId, current.rows[0].periodStart, current.rows[0].periodEnd]
        );
        if (conflict.rowCount) {
          await client.query('ROLLBACK');
          transactionStarted = false;
          return response.status(409).json({
            error:'Another finalized payroll run already covers one or more employees in this period.'
          });
        }
      }

      if (nextStatus === 'void' && current.rows[0].status === 'finalized') {
        const disbursed = await client.query(
          `SELECT id FROM payroll_run_items
           WHERE run_id=$1 AND disbursement_status IN ('processing','paid')
           LIMIT 1`,
          [request.params.runId]
        );
        if (disbursed.rowCount) {
          await client.query('ROLLBACK');
          transactionStarted = false;
          return response.status(409).json({
            error:'A payroll run with processing or paid disbursements cannot be voided.'
          });
        }
      }

      const updated = await client.query(
        'UPDATE payroll_runs SET status=$2 WHERE id=$1 RETURNING id, status',
        [request.params.runId, nextStatus]
      );
      await client.query('COMMIT');
      transactionStarted = false;
      return response.json({ run:updated.rows[0] });
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK');
      return next(error);
    } finally {
      client.release();
    }
  }
);

payrollComplianceRouter.get(
  '/reports/statutory-contributions',
  ...requirePermission('payroll_setup', 'view'),
  async (request, response, next) => {
    try {
      const month = String(request.query.month || '');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return response.status(400).json({ error:'Month must use YYYY-MM.' });
      }
      const result = await pool.query(
        `SELECT COUNT(DISTINCT item.employee_id)::integer AS "employeeCount",
                COALESCE(SUM(item.sss_employee),0) AS "sssEmployee",
                COALESCE(SUM(item.sss_employer),0) AS "sssEmployer",
                COALESCE(SUM(item.sss_ec_employer),0) AS "sssEcEmployer",
                COALESCE(SUM(item.philhealth_employee),0) AS "philhealthEmployee",
                COALESCE(SUM(item.philhealth_employer),0) AS "philhealthEmployer",
                COALESCE(SUM(item.pagibig_employee),0) AS "pagibigEmployee",
                COALESCE(SUM(item.pagibig_employer),0) AS "pagibigEmployer"
         FROM payroll_run_items item
         JOIN payroll_runs run ON run.id=item.run_id
         WHERE run.status='finalized' AND TO_CHAR(run.pay_date,'YYYY-MM')=$1`,
        [month]
      );
      return response.json({ month, ...result.rows[0] });
    } catch (error) {
      return next(error);
    }
  }
);

payrollComplianceRouter.get(
  '/reports/1601c',
  ...requirePermission('payroll_setup', 'view'),
  async (request, response, next) => {
    try {
      const month = String(request.query.month || '');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return response.status(400).json({ error:'Month must use YYYY-MM.' });
      }
      const result = await pool.query(
        `SELECT COALESCE(SUM(gross_compensation),0) AS "totalCompensation",
                COALESCE(SUM(non_taxable_compensation),0) AS "nonTaxableCompensation",
                COALESCE(SUM(taxable_compensation),0) AS "taxableCompensation",
                COALESCE(SUM(tax_withheld),0) AS "taxWithheld",
                COALESCE(SUM(tax_refund),0) AS "taxRefund",
                COALESCE(SUM(tax_withheld-tax_refund),0) AS "netTaxWithheld"
         FROM payroll_run_items item
         JOIN payroll_runs run ON run.id=item.run_id
         WHERE run.status='finalized' AND TO_CHAR(run.pay_date,'YYYY-MM')=$1`,
        [month]
      );
      return response.json({ month, ...result.rows[0] });
    } catch (error) {
      return next(error);
    }
  }
);

payrollComplianceRouter.get(
  '/reports/2316/:employeeId',
  ...requirePermission('payroll_setup', 'view'),
  async (request, response, next) => {
    try {
      const year = Number(request.query.year || new Date().getFullYear());
      if (!isPositiveInteger(request.params.employeeId)
        || !Number.isInteger(year) || year < 2000 || year > 9999) {
        return response.status(400).json({ error:'Enter a valid employee and report year.' });
      }
      const result = await pool.query(
        `SELECT employee.employee_number AS "employeeNumber",
                employee.first_name AS "firstName", employee.last_name AS "lastName",
                COALESCE(SUM(item.gross_compensation),0) AS "grossCompensation",
                COALESCE(SUM(item.non_taxable_compensation),0) AS "nonTaxableCompensation",
                COALESCE(SUM(item.taxable_compensation),0) AS "taxableCompensation",
                COALESCE(SUM(item.tax_withheld),0) AS "taxWithheld",
                COALESCE(SUM(item.tax_refund),0) AS "taxRefund",
                COALESCE(SUM(item.tax_withheld-item.tax_refund),0) AS "netTaxWithheld"
         FROM employee_profiles employee
         LEFT JOIN (
           payroll_run_items item
           JOIN payroll_runs run ON run.id=item.run_id
             AND run.status='finalized'
             AND EXTRACT(YEAR FROM run.pay_date)=$2
         ) ON item.employee_id=employee.id
         WHERE employee.id=$1
         GROUP BY employee.id`,
        [request.params.employeeId, year]
      );
      if (!result.rowCount) return response.status(404).json({ error:'Employee not found.' });
      return response.json({ year, employee:result.rows[0] });
    } catch (error) {
      return next(error);
    }
  }
);
