import { Router } from 'express';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { requirePermission } from '../auth/authorization.js';
import { isIsoDate, isPositiveInteger } from '../validation.js';
import { allocateStatutoryContributions, calculateStatutoryContributions } from '../payroll/compliance.js';
import { calculatePhilippineWithholding } from '../payroll/tax.js';
import { calculateHolidayPayAdjustment } from '../payroll/holiday-pay.js';
import {
  calculateOrdinaryWorkAdjustment,
  isFuturePayoutPeriodEnd,
  isStatutoryPremiumTaxable
} from '../payroll/payout-adjustments.js';
import { isPayrollPeriodShapeValid } from '../payroll/period-validation.js';
import { createPayrollPreviewToken } from '../payroll/preview-token.js';
import { holidayOccurrencesByDate } from '../calendar/service.js';

export const payoutRouter = Router();

const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const round = (value) => Math.round(Number(value) * 100) / 100;

function clockMinutes(value) {
  const [hour, minute] = String(value).slice(0, 5).split(':').map(Number);
  return hour * 60 + minute;
}

function workedMinutesFromPunches(punches, standardMinutes, scheduledBreakMinutes) {
  let workedMinutes = 0;
  for (let index = 0; index + 1 < punches.length; index += 2) {
    const duration = (Date.parse(punches[index + 1].timestamp)
      - Date.parse(punches[index].timestamp)) / 60000;
    if (Number.isFinite(duration) && duration > 0) workedMinutes += duration;
  }
  // A two-punch shift spans any unpaid break implied by the configured shift.
  if (punches.length === 2 && workedMinutes > standardMinutes && scheduledBreakMinutes > 0) {
    workedMinutes = Math.max(0, workedMinutes - scheduledBreakMinutes);
  }
  return Math.round(workedMinutes);
}

payoutRouter.post(
  '/employees/:employeeId/payout-preview',
  ...requirePermission('payout_view', 'view'),
  async (request, response, next) => {
    try {
      const employeeId = String(request.params.employeeId);
      const body = request.body || {};
      const periodStart = String(body.periodStart || '');
      const periodEnd = String(body.periodEnd || '');
      const payDate = String(body.payDate || '');
      const spanDays = (Date.parse(`${periodEnd}T00:00:00Z`)
        - Date.parse(`${periodStart}T00:00:00Z`)) / 86400000 + 1;
      const payDelayDays = (Date.parse(`${payDate}T00:00:00Z`)
        - Date.parse(`${periodEnd}T00:00:00Z`)) / 86400000;
      if (!isPositiveInteger(employeeId) || !periodStart || !periodEnd || !payDate
        || !isIsoDate(periodStart) || !isIsoDate(periodEnd) || !isIsoDate(payDate)
        || periodStart > periodEnd || payDate < periodEnd
        || !Number.isFinite(spanDays) || spanDays > 31
        || !Number.isFinite(payDelayDays) || payDelayDays > 31) {
        return response.status(400).json({
          error:'Enter a valid employee, pay period of up to 31 days, and pay date within 31 days after the period end.'
        });
      }
      if (isFuturePayoutPeriodEnd(periodEnd)) {
        return response.status(400).json({
          error:'The payroll period cannot end in the future because attendance is not yet complete.'
        });
      }

      const profileResult = await pool.query(
        `SELECT employee.employee_number AS "employeeNumber",
                employee.first_name AS "firstName", employee.last_name AS "lastName",
                profile.pay_basis AS "payBasis", profile.pay_frequency AS "payFrequency",
                profile.base_rate AS "baseRate",
                profile.standard_hours_per_day AS "standardHoursPerDay",
                profile.tax_status AS "taxStatus",
                profile.is_minimum_wage_earner AS "isMinimumWageEarner",
                profile.auto_calculate_contributions AS "autoCalculateContributions",
                profile.contribution_deduction_schedule AS "contributionDeductionSchedule",
                profile.sss_employee_share AS "sssEmployeeShare",
                profile.philhealth_employee_share AS "philhealthEmployeeShare",
                profile.pagibig_employee_share AS "pagibigEmployeeShare",
                profile.union_dues AS "unionDues",
                COALESCE(TO_CHAR(shift.start_time,'HH24:MI'),'08:00') AS "startTime",
                COALESCE(TO_CHAR(shift.end_time,'HH24:MI'),'17:00') AS "endTime",
                COALESCE(
                  shift.work_days,
                  ARRAY['monday','tuesday','wednesday','thursday','friday']::text[]
                ) AS "workDays"
         FROM employee_profiles employee
         JOIN employee_payroll_profiles profile ON profile.employee_id=employee.id
         LEFT JOIN employee_shift_assignments shift ON shift.employee_id=employee.id
         WHERE employee.id=$1`,
        [employeeId]
      );
      if (!profileResult.rowCount) {
        return response.status(404).json({ error:'Employee payroll setup was not found.' });
      }

      const profile = profileResult.rows[0];
      if (!isPayrollPeriodShapeValid({ frequency:profile.payFrequency, periodStart, periodEnd })) {
        return response.status(400).json({
          error:`The selected dates do not match the employee's ${String(profile.payFrequency).replace('_', ' ')} pay frequency.`
        });
      }

      const [entriesResult, componentsResult, holidaysByDate] = await Promise.all([
        pool.query(
          `SELECT DISTINCT attendance.entry->>'timestamp' AS timestamp,
                  TO_CHAR(
                    (attendance.entry->>'timestamp')::timestamptz AT TIME ZONE 'Asia/Manila',
                    'YYYY-MM-DD'
                  ) AS date,
                  TO_CHAR(
                    (attendance.entry->>'timestamp')::timestamptz AT TIME ZONE 'Asia/Manila',
                    'HH24:MI'
                  ) AS "localTime"
           FROM scheduler_backups backup
           CROSS JOIN LATERAL jsonb_array_elements(backup.attendance) attendance(entry)
           WHERE CASE
             WHEN attendance.entry->>'userId'~'^[0-9]+$' AND $1~'^[0-9]+$'
               THEN (attendance.entry->>'userId')::numeric=$1::numeric
             ELSE attendance.entry->>'userId'=$1
           END
             AND ((attendance.entry->>'timestamp')::timestamptz AT TIME ZONE 'Asia/Manila')::date
               BETWEEN $2::date AND $3::date
           ORDER BY timestamp`,
          [profile.employeeNumber, periodStart, periodEnd]
        ),
        pool.query(
          `SELECT component_type AS type, name, amount, calculation,
                  is_taxable AS "isTaxable"
           FROM employee_payroll_components
           WHERE employee_id=$1 AND is_active=TRUE
           ORDER BY type, name`,
          [employeeId]
        ),
        holidayOccurrencesByDate({ startDate:periodStart, endDate:periodEnd })
      ]);

      const entriesByDate = new Map();
      for (const entry of entriesResult.rows) {
        const entries = entriesByDate.get(entry.date) || [];
        const previous = entries.at(-1);
        if (!previous || Date.parse(entry.timestamp) - Date.parse(previous.timestamp) > 300000) {
          entries.push(entry);
        }
        entriesByDate.set(entry.date, entries);
      }

      const scheduledDates = [];
      for (let date = new Date(`${periodStart}T00:00:00Z`);
        date <= new Date(`${periodEnd}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + 1)) {
        if (profile.workDays.includes(dayNames[date.getUTCDay()])) {
          scheduledDates.push(date.toISOString().slice(0, 10));
        }
      }
      const scheduledDateSet = new Set(scheduledDates);
      const workedRestDates = [...entriesByDate.keys()].filter((date) =>
        !scheduledDateSet.has(date));
      const attendanceDates = [...scheduledDates, ...workedRestDates].sort();

      let periodBase = Number(profile.baseRate);
      if (profile.payBasis === 'monthly' && profile.payFrequency === 'semi_monthly') periodBase /= 2;
      if (profile.payBasis === 'monthly' && profile.payFrequency === 'weekly') periodBase = periodBase * 12 / 52;
      if (profile.payBasis === 'monthly' && profile.payFrequency === 'biweekly') periodBase = periodBase * 12 / 26;
      if (profile.payBasis === 'daily') periodBase = Number(profile.baseRate) * scheduledDates.length;
      if (profile.payBasis === 'hourly') {
        periodBase = Number(profile.baseRate) * Number(profile.standardHoursPerDay) * scheduledDates.length;
      }

      const standardMinutes = Number(profile.standardHoursPerDay) * 60;
      const scheduledBreakMinutes = Math.max(0, clockMinutes(profile.endTime)
        - clockMinutes(profile.startTime) - standardMinutes);
      const dayRate = scheduledDates.length ? periodBase / scheduledDates.length : 0;
      const minuteRate = standardMinutes ? dayRate / standardMinutes : 0;
      const attendanceWarnings = [];
      const attendanceDays = attendanceDates.map((date) => {
        const punches = entriesByDate.get(date) || [];
        const holiday = holidaysByDate.get(date)?.[0] || null;
        const isScheduledDay = scheduledDateSet.has(date);
        const incompletePunches = punches.length % 2 === 1;
        if (incompletePunches) attendanceWarnings.push(`${date} has an incomplete punch pair.`);

        const workedMinutes = workedMinutesFromPunches(
          punches,
          standardMinutes,
          scheduledBreakMinutes
        );
        let absent = isScheduledDay && punches.length === 0;
        let lateMinutes = 0;
        let breakExcessMinutes = 0;
        let undertimeMinutes = 0;
        let penaltyMinutes = 0;
        let deduction = 0;
        let holidayPay = null;
        let ordinaryWorkPay = null;

        if (holiday) {
          const adjustment = calculateHolidayPayAdjustment({
            dayRate,
            workedMinutes,
            standardMinutes,
            isScheduledDay,
            holidayType:holiday.type
          });
          holidayPay = adjustment;
          absent = false;
          deduction = adjustment.baseDeduction;
        } else if (isScheduledDay) {
          if (incompletePunches) {
            penaltyMinutes = standardMinutes;
          } else if (absent) {
            penaltyMinutes = standardMinutes;
          } else {
            lateMinutes = Math.max(0, clockMinutes(punches[0].localTime)
              - clockMinutes(profile.startTime));
            if (punches.length >= 3) {
              breakExcessMinutes = Math.max(0, clockMinutes(punches[2].localTime)
                - clockMinutes(punches[1].localTime) - scheduledBreakMinutes);
            }
            if (punches.length >= 2) {
              undertimeMinutes = Math.max(0, clockMinutes(profile.endTime)
                - clockMinutes(punches.at(-1).localTime));
            }
            penaltyMinutes = Math.min(
              standardMinutes,
              lateMinutes + breakExcessMinutes + undertimeMinutes
            );
          }
          deduction = round(penaltyMinutes * minuteRate);
        }

        if (!holiday) {
          // The overtime-request module currently exposes the employee schedule,
          // but it has no persisted approval workflow to authorize payable minutes.
          ordinaryWorkPay = calculateOrdinaryWorkAdjustment({
            dayRate,
            workedMinutes,
            standardMinutes,
            isScheduledDay,
            approvedMinutes:0
          });
          if (ordinaryWorkPay.approvalRequired) {
            const unapprovedMinutes = ordinaryWorkPay.breakdown.unapprovedMinutes;
            attendanceWarnings.push(isScheduledDay
              ? `${date} has ${unapprovedMinutes} minutes of overtime without an approved overtime record; no overtime pay was included.`
              : `${date} has ${unapprovedMinutes} minutes of non-holiday rest-day work without an approved overtime record; no rest-day pay was included.`);
          }
        }

        return {
          date,
          punches:punches.map((item) => item.timestamp),
          incompletePunches,
          workedMinutes,
          holiday:holiday ? { id:holiday.id, title:holiday.title, type:holiday.type } : null,
          holidayPay,
          ordinaryWorkPay,
          absent,
          lateMinutes,
          breakExcessMinutes,
          undertimeMinutes,
          penaltyMinutes,
          deduction:round(deduction)
        };
      });

      const attendanceDeduction = round(attendanceDays.reduce((sum, day) => sum + day.deduction, 0));
      const adjustedBase = Math.max(0, round(periodBase - attendanceDeduction));
      const componentValue = (item) => round(item.calculation === 'percentage'
        ? adjustedBase * Number(item.amount) / 100
        : Number(item.amount));
      const recurringEarnings = componentsResult.rows.filter((item) => item.type === 'earning')
        .map((item) => ({ ...item, value:componentValue(item) }));
      const holidayEarnings = attendanceDays.filter((day) => day.holidayPay?.additionalPay > 0)
        .map((day) => ({
          type:'earning',
          name:`${day.holiday.title} holiday pay (${day.date})`,
          calculation:'holiday',
          isTaxable:['regular', 'special_non_working'].includes(day.holiday.type)
            ? isStatutoryPremiumTaxable(profile.isMinimumWageEarner)
            : true,
          value:day.holidayPay.additionalPay
        }));
      const ordinaryWorkEarnings = attendanceDays.filter((day) =>
        day.ordinaryWorkPay?.additionalPay > 0).map((day) => ({
        type:'earning',
        name:scheduledDateSet.has(day.date)
          ? `Approved overtime pay (${day.date})`
          : `Approved rest-day pay (${day.date})`,
        calculation:scheduledDateSet.has(day.date) ? 'overtime' : 'rest_day',
        isTaxable:isStatutoryPremiumTaxable(profile.isMinimumWageEarner),
        value:day.ordinaryWorkPay.additionalPay
      }));
      const earnings = [...recurringEarnings, ...holidayEarnings, ...ordinaryWorkEarnings];
      const deductions = componentsResult.rows.filter((item) => item.type === 'deduction')
        .map((item) => ({ ...item, value:componentValue(item) }));
      const taxableEarnings = round(earnings.filter((item) => item.isTaxable)
        .reduce((sum, item) => sum + item.value, 0));
      const nonTaxableEarnings = round(earnings.filter((item) => !item.isTaxable)
        .reduce((sum, item) => sum + item.value, 0));
      const recurringDeductions = round(deductions.reduce((sum, item) => sum + item.value, 0));

      const monthly = calculateStatutoryContributions(profile.baseRate);
      const automatic = allocateStatutoryContributions(monthly, {
        frequency:profile.payFrequency,
        payDate,
        schedule:profile.contributionDeductionSchedule
      });
      const contributions = profile.autoCalculateContributions && profile.payBasis === 'monthly'
        ? automatic
        : {
          sssEmployee:Number(profile.sssEmployeeShare),
          philhealthEmployee:Number(profile.philhealthEmployeeShare),
          pagibigEmployee:Number(profile.pagibigEmployeeShare),
          totalEmployee:round(Number(profile.sssEmployeeShare)
            + Number(profile.philhealthEmployeeShare) + Number(profile.pagibigEmployeeShare)),
          allocation:{ frequency:profile.payFrequency, schedule:'manual', payDate }
        };

      const tableFrequency = profile.payFrequency === 'biweekly' ? 'weekly' : profile.payFrequency;
      const taxConfiguration = await pool.query(
        `SELECT id, name, exemption_amount::double precision AS "exemptionAmount"
         FROM tax_configurations
         WHERE pay_frequency=$1 AND is_active=TRUE AND effective_from<=$2::date
           AND (effective_to IS NULL OR effective_to>=$2::date)
         ORDER BY effective_from DESC
         LIMIT 2`,
        [tableFrequency, payDate]
      );
      if (taxConfiguration.rowCount !== 1) {
        return response.status(409).json({
          error:taxConfiguration.rowCount
            ? 'Multiple active tax configurations match this payout.'
            : 'No active tax configuration matches this payout.'
        });
      }
      const brackets = (await pool.query(
        `SELECT lower_bound AS "lowerBound", upper_bound AS "upperBound",
                base_tax AS "baseTax", rate_percent AS "ratePercent"
         FROM tax_brackets
         WHERE configuration_id=$1
         ORDER BY lower_bound`,
        [taxConfiguration.rows[0].id]
      )).rows;
      const taxResult = calculatePhilippineWithholding({
        regularCompensation:adjustedBase,
        supplementaryCompensation:taxableEarnings + nonTaxableEarnings,
        nonTaxableCompensation:nonTaxableEarnings,
        mandatoryContributions:contributions.totalEmployee + Number(profile.unionDues),
        exemptionAmount:taxConfiguration.rows[0].exemptionAmount,
        taxStatus:profile.taxStatus,
        isMinimumWageEarner:profile.isMinimumWageEarner,
        frequency:profile.payFrequency,
        brackets
      });

      const grossPay = round(periodBase + taxableEarnings + nonTaxableEarnings);
      const totalDeductions = round(attendanceDeduction + contributions.totalEmployee
        + Number(profile.unionDues) + recurringDeductions + taxResult.tax);
      const netPay = round(grossPay - totalDeductions);
      if (netPay < 0) {
        return response.status(422).json({
          error:'Configured deductions exceed this employee payout. Review attendance, recurring deductions, and contribution settings.'
        });
      }

      const hasHoliday = attendanceDays.some((day) => day.holiday);
      const preview = {
        employeeId:String(employeeId),
        employee:{
          employeeNumber:profile.employeeNumber,
          name:`${profile.firstName} ${profile.lastName}`
        },
        period:{ periodStart, periodEnd, payDate, payFrequency:profile.payFrequency },
        salary:{
          configuredBase:Number(profile.baseRate),
          periodBase:round(periodBase),
          adjustedBase,
          attendanceDeduction
        },
        attendance:{
          scheduledDays:scheduledDates.length,
          days:attendanceDays,
          totalPenaltyMinutes:attendanceDays.reduce((sum, day) => sum + day.penaltyMinutes, 0),
          warnings:attendanceWarnings,
          requiresReview:attendanceWarnings.length > 0
        },
        earnings,
        deductions,
        contributions,
        unionDues:Number(profile.unionDues),
        tax:{
          amount:taxResult.tax,
          taxableIncome:taxResult.taxableIncome,
          configuration:taxConfiguration.rows[0]
        },
        grossPay,
        totalDeductions,
        netPay,
        holidayPayAssumptions:hasHoliday ? [
          'Regular-holiday no-work eligibility is assumed; verify the employee met the preceding-workday or paid-leave requirement.',
          'Company and other holiday types are treated as paid scheduled days without a statutory premium.'
        ] : []
      };
      preview.payrollRunToken = createPayrollPreviewToken(preview, config.sessionSecret);
      return response.json(preview);
    } catch (error) {
      return next(error);
    }
  }
);
