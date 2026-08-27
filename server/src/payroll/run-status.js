export const payrollRunStatuses = ['draft', 'finalized', 'void'];

export function canTransitionPayrollRun(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  if (currentStatus === 'draft') return nextStatus === 'finalized' || nextStatus === 'void';
  if (currentStatus === 'finalized') return nextStatus === 'void';
  return false;
}
