const round = (value) => Math.round(Number(value) * 100) / 100;

export const deMinimisLimits2026 = {
  medical_dependents:4000,
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
  { sss = true, philhealth = true, pagibig = true, payDate } = {}
) {
  const salary = Math.max(0, Number(monthlyBasicSalary || 0));
  const applicableDate = String(payDate || new Date().toISOString().slice(0, 10));
  if (applicableDate < '2025-01-01') {
    throw new RangeError('Automatic statutory contributions are supported from January 2025 onward.');
  }
  if (salary === 0) {
    return {
      sssEmployee:0,
      sssEmployer:0,
      sssEcEmployer:0,
      philhealthEmployee:0,
      philhealthEmployer:0,
      pagibigEmployee:0,
      pagibigEmployer:0,
      totalEmployee:0,
      totalEmployer:0,
      totalContribution:0,
      bases:{ sssMsc:0, philhealth:0, pagibig:0 },
      effectiveRules:{ sss:'2025-01-01', philhealth:'2025-01-01', pagibig:'2024-02-01' }
    };
  }

  const msc = Math.min(35000, Math.max(5000, Math.floor((salary + 250) / 500) * 500));
  const sssEmployee = sss ? round(msc * 0.05) : 0;
  const sssEmployer = sss ? round(msc * 0.10) : 0;
  const sssEcEmployer = sss ? (msc <= 14500 ? 10 : 30) : 0;
  const philhealthBase = Math.min(100000, Math.max(10000, salary));
  const philhealthEmployee = philhealth ? round(philhealthBase * 0.025) : 0;
  const philhealthEmployer = philhealth ? round(philhealthBase * 0.025) : 0;
  const pagibigBase = Math.min(10000, salary);
  const pagibigRate = salary <= 1500 ? 0.01 : 0.02;
  const pagibigEmployee = pagibig ? round(pagibigBase * pagibigRate) : 0;
  const pagibigEmployer = pagibig ? round(pagibigBase * 0.02) : 0;
  const totalEmployee = round(sssEmployee + philhealthEmployee + pagibigEmployee);
  const totalEmployer = round(
    sssEmployer + sssEcEmployer + philhealthEmployer + pagibigEmployer
  );

  return {
    sssEmployee,
    sssEmployer,
    sssEcEmployer,
    philhealthEmployee,
    philhealthEmployer,
    pagibigEmployee,
    pagibigEmployer,
    totalEmployee,
    totalEmployer,
    totalContribution:round(totalEmployee + totalEmployer),
    bases:{ sssMsc:msc, philhealth:philhealthBase, pagibig:pagibigBase },
    effectiveRules:{ sss:'2025-01-01', philhealth:'2025-01-01', pagibig:'2024-02-01' }
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
  const day = Number(String(payDate).slice(8, 10));
  if (frequency === 'semi_monthly') {
    const firstCutoff = day <= 15;
    if (schedule === 'first_cutoff') factor = firstCutoff ? 1 : 0;
    else if (schedule === 'second_cutoff') factor = firstCutoff ? 0 : 1;
    else factor = 0.5;
  }
  if (frequency === 'weekly' || frequency === 'biweekly') {
    // Statutory obligations are monthly. For non-monthly payrolls, deduct the
    // complete monthly amount once in the selected half of the month.
    factor = schedule === 'first_cutoff' ? (day <= 15 ? 1 : 0) : (day > 15 ? 1 : 0);
  }

  const allocated = {
    sssEmployee:round(monthlyContributions.sssEmployee * factor),
    sssEmployer:round(monthlyContributions.sssEmployer * factor),
    sssEcEmployer:round(monthlyContributions.sssEcEmployer * factor),
    philhealthEmployee:round(monthlyContributions.philhealthEmployee * factor),
    philhealthEmployer:round(monthlyContributions.philhealthEmployer * factor),
    pagibigEmployee:round(monthlyContributions.pagibigEmployee * factor),
    pagibigEmployer:round(monthlyContributions.pagibigEmployer * factor)
  };
  const totalEmployee = round(
    allocated.sssEmployee + allocated.philhealthEmployee + allocated.pagibigEmployee
  );
  const totalEmployer = round(
    allocated.sssEmployer + allocated.sssEcEmployer
      + allocated.philhealthEmployer + allocated.pagibigEmployer
  );
  return {
    ...allocated,
    totalEmployee,
    totalEmployer,
    totalContribution:round(totalEmployee + totalEmployer),
    monthly:monthlyContributions,
    allocation:{ frequency, schedule, factor, payDate }
  };
}

export function reconcileMonthlyStatutoryContributions(
  monthlyContributions,
  previouslyRecorded = {},
  {
    frequency = 'monthly',
    payDate = new Date().toISOString().slice(0, 10),
    schedule = 'split_evenly'
  } = {}
) {
  const day = Number(String(payDate).slice(8, 10));
  let cumulativeFactor = 1;
  if (frequency === 'semi_monthly' && schedule === 'split_evenly') {
    cumulativeFactor = day <= 15 ? 0.5 : 1;
  } else if (schedule === 'second_cutoff' || frequency === 'weekly' || frequency === 'biweekly') {
    cumulativeFactor = day <= 15 ? 0 : 1;
  }

  const fields = [
    'sssEmployee', 'sssEmployer', 'sssEcEmployer',
    'philhealthEmployee', 'philhealthEmployer',
    'pagibigEmployee', 'pagibigEmployer'
  ];
  const reconciled = Object.fromEntries(fields.map((field) => [
    field,
    round(Math.max(
      0,
      Number(monthlyContributions[field] || 0) * cumulativeFactor
        - Number(previouslyRecorded[field] || 0)
    ))
  ]));
  const totalEmployee = round(
    reconciled.sssEmployee + reconciled.philhealthEmployee + reconciled.pagibigEmployee
  );
  const totalEmployer = round(
    reconciled.sssEmployer + reconciled.sssEcEmployer
      + reconciled.philhealthEmployer + reconciled.pagibigEmployer
  );
  return {
    ...reconciled,
    totalEmployee,
    totalEmployer,
    totalContribution:round(totalEmployee + totalEmployer),
    monthly:monthlyContributions,
    previouslyRecorded,
    allocation:{ frequency, schedule, cumulativeFactor, payDate, method:'monthly_balance' }
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
