const round = (value) => Math.round(Number(value) * 100) / 100;

export const deMinimisLimits2026 = {
  medical_dependents:3996,
  rice:30000,
  uniform:8000,
  medical_assistance:12000,
  laundry:4800,
  achievement_award:12000,
  christmas_gifts:6000,
  cba_productivity:12000
};

export function calculateStatutoryContributions(
  monthlyBasicSalary,
  { sss = true, philhealth = true, pagibig = true } = {}
) {
  const salary = Math.max(0, Number(monthlyBasicSalary || 0));
  if (salary === 0) {
    return {
      sssEmployee:0,
      philhealthEmployee:0,
      pagibigEmployee:0,
      totalEmployee:0,
      bases:{ sssMsc:0, philhealth:0, pagibig:0 }
    };
  }

  const msc = Math.min(35000, Math.max(5000, Math.floor((salary + 250) / 500) * 500));
  const sssEmployee = sss ? round(msc * 0.05) : 0;
  const philhealthBase = Math.min(100000, Math.max(10000, salary));
  const philhealthEmployee = philhealth ? round(philhealthBase * 0.025) : 0;
  const pagibigBase = Math.min(10000, salary);
  const pagibigRate = salary <= 1500 ? 0.01 : 0.02;
  const pagibigEmployee = pagibig ? round(pagibigBase * pagibigRate) : 0;

  return {
    sssEmployee,
    philhealthEmployee,
    pagibigEmployee,
    totalEmployee:round(sssEmployee + philhealthEmployee + pagibigEmployee),
    bases:{ sssMsc:msc, philhealth:philhealthBase, pagibig:pagibigBase }
  };
}

export function allocateStatutoryContributions(
  monthlyContributions,
  {
    frequency = 'monthly',
    payDate = new Date().toISOString().slice(0, 10),
    schedule = 'split_evenly'
  } = {}
) {
  let factor = 1;
  if (frequency === 'semi_monthly') {
    const firstCutoff = Number(String(payDate).slice(8, 10)) <= 15;
    if (schedule === 'first_cutoff') factor = firstCutoff ? 1 : 0;
    else if (schedule === 'second_cutoff') factor = firstCutoff ? 0 : 1;
    else factor = 0.5;
  }
  if (frequency === 'weekly') factor = 12 / 52;
  if (frequency === 'biweekly') factor = 12 / 26;

  const allocated = {
    sssEmployee:round(monthlyContributions.sssEmployee * factor),
    philhealthEmployee:round(monthlyContributions.philhealthEmployee * factor),
    pagibigEmployee:round(monthlyContributions.pagibigEmployee * factor)
  };
  return {
    ...allocated,
    totalEmployee:round(
      allocated.sssEmployee + allocated.philhealthEmployee + allocated.pagibigEmployee
    ),
    monthly:monthlyContributions,
    allocation:{ frequency, schedule, factor, payDate }
  };
}

export function classifyBenefits({
  benefits = [],
  yearToDateByCategory = {},
  thirteenthMonthAndOtherBenefits = 0,
  yearToDateThirteenthAndOther = 0,
  minimumDailyWage = 0
} = {}) {
  let deMinimisNonTaxable = 0;
  let deMinimisTaxable = 0;
  const requestUsageByCategory = {};

  const details = benefits.map((item) => {
    const amount = Math.max(0, Number(item.amount || 0));
    const yearToDateUsed = Math.max(0, Number(yearToDateByCategory[item.category] || 0));
    const requestUsed = Math.max(0, Number(requestUsageByCategory[item.category] || 0));
    let limit = deMinimisLimits2026[item.category] ?? 0;
    if (item.category === 'overtime_meal') {
      limit = Math.max(0, Number(minimumDailyWage || 0))
        * 0.30 * Number(item.qualifiedDays || 1);
    }

    // Annual category limits are shared by every matching entry in this request.
    // Overtime meals carry a per-entry qualified-day limit instead.
    const usedForLimit = item.category === 'overtime_meal'
      ? yearToDateUsed
      : yearToDateUsed + requestUsed;
    const available = Math.max(0, limit - usedForLimit);
    const nonTaxable = Math.min(amount, available);
    const taxable = amount - nonTaxable;
    if (item.category !== 'overtime_meal') {
      requestUsageByCategory[item.category] = requestUsed + nonTaxable;
    }
    deMinimisNonTaxable += nonTaxable;
    deMinimisTaxable += taxable;

    return {
      ...item,
      amount,
      limit,
      yearToDateUsed,
      currentRequestUsed:requestUsed,
      nonTaxable:round(nonTaxable),
      taxable:round(taxable)
    };
  });

  const benefitAmount = Math.max(0, Number(thirteenthMonthAndOtherBenefits || 0));
  const benefitUsed = Math.max(0, Number(yearToDateThirteenthAndOther || 0));
  const benefitNonTaxable = Math.min(benefitAmount, Math.max(0, 90000 - benefitUsed));
  return {
    details,
    deMinimisNonTaxable:round(deMinimisNonTaxable),
    deMinimisTaxable:round(deMinimisTaxable),
    thirteenthMonthNonTaxable:round(benefitNonTaxable),
    thirteenthMonthTaxable:round(benefitAmount - benefitNonTaxable),
    totalNonTaxable:round(deMinimisNonTaxable + benefitNonTaxable),
    totalTaxable:round(deMinimisTaxable + benefitAmount - benefitNonTaxable)
  };
}
