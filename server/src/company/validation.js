import { isEmail } from '../validation.js';

export const companyLogoMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const maximumCompanyLogoBytes = 2 * 1024 * 1024;

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isRequestBody(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function cleanSingleLineText(value) {
  return cleanText(value).replace(/\s+/g, ' ');
}

function isWebsite(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function imageMatchesMimeType(buffer, mimeType) {
  if (mimeType === 'image/png') {
    return buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

function decodeBase64Image(value, mimeType) {
  const base64 = cleanText(value);
  const maximumBase64Length = Math.ceil(maximumCompanyLogoBytes * 4 / 3) + 4;
  const validBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

  if (!base64 || base64.length > maximumBase64Length || !validBase64.test(base64)) return null;
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > maximumCompanyLogoBytes || buffer.toString('base64') !== base64) return null;
  return imageMatchesMimeType(buffer, mimeType) ? buffer : null;
}

export function validateCompanyProfileInput(body = {}) {
  if (!isRequestBody(body)) return { error:'Company profile data must be a JSON object.' };

  const companyName = cleanSingleLineText(body.companyName);
  const companyAddress = cleanText(body.companyAddress);
  const contactNumber = cleanSingleLineText(body.contactNumber);
  const emailAddress = cleanSingleLineText(body.emailAddress).toLowerCase();
  const website = cleanSingleLineText(body.website);
  const description = cleanText(body.description);
  const clearLogo = body.clearLogo === true;
  const logoFieldsIncluded = hasOwn(body, 'logoBase64') || hasOwn(body, 'logoMimeType');

  if (!companyName) return { error:'Please enter the company name.' };
  if (companyName.length > 160) return { error:'Company name must be 160 characters or fewer.' };
  if (companyAddress.length > 600) return { error:'Company address must be 600 characters or fewer.' };
  if (contactNumber.length > 60) return { error:'Contact number must be 60 characters or fewer.' };
  if (emailAddress && !isEmail(emailAddress)) return { error:'Please enter a valid company email address.' };
  if (website && !isWebsite(website)) return { error:'Website must be a valid http:// or https:// address.' };
  if (website.length > 255) return { error:'Website must be 255 characters or fewer.' };
  if (description.length > 2000) return { error:'Company description must be 2,000 characters or fewer.' };

  if (clearLogo && logoFieldsIncluded && (cleanText(body.logoBase64) || cleanText(body.logoMimeType))) {
    return { error:'Choose a new logo or remove the current logo, not both.' };
  }

  let logo = null;
  if (logoFieldsIncluded && !clearLogo) {
    const mimeType = cleanText(body.logoMimeType).toLowerCase();
    if (!companyLogoMimeTypes.includes(mimeType)) return { error:'Logo must be a PNG, JPEG, or WebP image.' };
    const data = decodeBase64Image(body.logoBase64, mimeType);
    if (!data) return { error:'Logo must be a valid PNG, JPEG, or WebP image no larger than 2 MB.' };
    logo = { data, mimeType };
  }

  return {
    value: {
      companyName,
      companyAddress,
      contactNumber,
      emailAddress,
      website,
      description,
      clearLogo,
      logo
    }
  };
}
