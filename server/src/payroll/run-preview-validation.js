import { verifyPayrollPreviewToken } from './preview-token.js';

export function validatePayrollRunPreviews(items, secret, options) {
  const invalidPreview = items.find((item) => !verifyPayrollPreviewToken(
    item.calculation?.payrollRunToken,
    item.calculation,
    secret,
    options
  ));
  if (invalidPreview) {
    return {
      status:400,
      error:'Recalculate each employee payout before creating the payroll run.'
    };
  }
  if (items.some((item) => item.calculation?.attendance?.requiresReview)) {
    return {
      status:409,
      error:'Resolve incomplete or unapproved attendance before creating the payroll run.'
    };
  }
  return { status:200 };
}
