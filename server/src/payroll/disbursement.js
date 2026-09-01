export const disbursementStatuses = ['pending', 'processing', 'paid', 'failed'];
export const disbursementMethods = ['bank_transfer', 'cash', 'check', 'e_wallet'];

const statusTransitions = {
  pending:new Set(['pending', 'processing', 'paid', 'failed']),
  processing:new Set(['pending', 'processing', 'paid', 'failed']),
  failed:new Set(['pending', 'processing', 'paid', 'failed']),
  paid:new Set(['paid'])
};

export function canTransitionDisbursement(currentStatus, nextStatus) {
  return Boolean(statusTransitions[currentStatus]?.has(nextStatus));
}

export function validateDisbursementUpdate(body, currentStatus = 'pending') {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error:'Enter valid disbursement details.' };
  }
  const status = String(body.status || '');
  const method = String(body.method || '');
  const reference = String(body.reference || '').trim();
  const notes = String(body.notes || '').trim();
  if (!disbursementStatuses.includes(status)) {
    return { error:'Select a valid disbursement status.' };
  }
  if (!canTransitionDisbursement(currentStatus, status)) {
    return { error:'A paid disbursement cannot be reopened. Create a documented correction outside this record.' };
  }
  if (method && !disbursementMethods.includes(method)) {
    return { error:'Select a valid disbursement method.' };
  }
  if (['processing', 'paid'].includes(status) && !method) {
    return { error:'Select a disbursement method before processing or marking payment as paid.' };
  }
  if (status === 'paid' && !reference) {
    return { error:'Enter a payment or receipt reference before marking payment as paid.' };
  }
  if (reference.length > 100 || notes.length > 500) {
    return { error:'Keep the payment reference within 100 characters and notes within 500 characters.' };
  }
  return { value:{ status, method:method || null, reference:reference || null, notes:notes || null } };
}
