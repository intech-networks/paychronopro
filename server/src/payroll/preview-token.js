import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const defaultLifetimeMilliseconds = 30 * 60 * 1000;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function previewDigest(preview) {
  const { payrollRunToken:_token, ...unsignedPreview } = preview || {};
  return createHash('sha256').update(canonicalJson(unsignedPreview)).digest('base64url');
}

function signature(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createPayrollPreviewToken(
  preview,
  secret,
  { now = Date.now(), lifetimeMilliseconds = defaultLifetimeMilliseconds } = {}
) {
  const payload = {
    version:1,
    issuedAt:now,
    expiresAt:now + lifetimeMilliseconds,
    previewDigest:previewDigest(preview)
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${signature(encodedPayload, secret)}`;
}

export function verifyPayrollPreviewToken(token, preview, secret, { now = Date.now() } = {}) {
  if (typeof token !== 'string' || token.length > 4096) return false;
  const [encodedPayload, suppliedSignature, extra] = token.split('.');
  if (!encodedPayload || !suppliedSignature || extra) return false;

  const expectedSignature = signature(encodedPayload, secret);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (suppliedBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return payload.version === 1
      && Number.isSafeInteger(payload.issuedAt)
      && Number.isSafeInteger(payload.expiresAt)
      && payload.issuedAt <= now + 60000
      && payload.expiresAt >= now
      && payload.previewDigest === previewDigest(preview);
  } catch {
    return false;
  }
}
