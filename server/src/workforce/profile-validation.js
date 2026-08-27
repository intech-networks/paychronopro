import { isEmail, isIsoDate } from '../validation.js';

export const employeeProfilePictureMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const maximumEmployeeProfilePictureBytes = 2 * 1024 * 1024;

const genderValues = new Set(['', 'female', 'male', 'non_binary', 'prefer_not_to_say']);
const civilStatusValues = new Set(['', 'single', 'married', 'widowed', 'separated', 'annulled', 'prefer_not_to_say']);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function cleanSingleLineText(value) {
  return cleanText(value).replace(/\s+/g, ' ');
}

function isPhoneNumber(value) {
  if (!value) return true;
  if (!/^[+()\-\s.\d]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 20;
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

function decodeProfilePicture(base64Value, mimeType) {
  const base64 = cleanText(base64Value);
  const maximumBase64Length = Math.ceil(maximumEmployeeProfilePictureBytes * 4 / 3) + 4;
  const validBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

  if (!base64 || base64.length > maximumBase64Length || !validBase64.test(base64)) return null;
  const data = Buffer.from(base64, 'base64');
  if (!data.length || data.length > maximumEmployeeProfilePictureBytes || data.toString('base64') !== base64) return null;
  return imageMatchesMimeType(data, mimeType) ? data : null;
}

function parseProfilePicture(body) {
  const clear = body.clearProfilePicture === true;
  const hasPictureFields = hasOwn(body, 'profilePictureBase64') || hasOwn(body, 'profilePictureMimeType');
  const rawBase64 = cleanText(body.profilePictureBase64);
  const rawMimeType = cleanText(body.profilePictureMimeType).toLowerCase();

  if (clear && hasPictureFields && (rawBase64 || rawMimeType)) {
    return { error:'Choose a new profile picture or remove the current one, not both.' };
  }
  if (clear) return { value:{ action:'clear', data:null, mimeType:null } };
  if (!hasPictureFields) return { value:{ action:'keep', data:null, mimeType:null } };
  if (!employeeProfilePictureMimeTypes.includes(rawMimeType)) {
    return { error:'Profile picture must be a PNG, JPEG, or WebP image.' };
  }
  const data = decodeProfilePicture(rawBase64, rawMimeType);
  if (!data) {
    return { error:'Profile picture must be a valid PNG, JPEG, or WebP image no larger than 2 MB.' };
  }
  return { value:{ action:'replace', data, mimeType:rawMimeType } };
}

export function parseEmployeeProfileInput(body) {
  if (!isRecord(body)) return { error:'Employee profile data must be a JSON object.' };

  const profilePicture = parseProfilePicture(body);
  if (profilePicture.error) return profilePicture;

  const profile = {
    firstName: cleanSingleLineText(body.firstName),
    middleName: cleanSingleLineText(body.middleName),
    lastName: cleanSingleLineText(body.lastName),
    suffix: cleanSingleLineText(body.suffix),
    preferredName: cleanSingleLineText(body.preferredName),
    email: cleanSingleLineText(body.email).toLowerCase(),
    phone: cleanSingleLineText(body.phone),
    address: cleanText(body.address),
    dateOfBirth: cleanText(body.dateOfBirth) || null,
    gender: cleanText(body.gender).toLowerCase(),
    civilStatus: cleanText(body.civilStatus).toLowerCase(),
    hireDate: cleanText(body.hireDate) || null,
    emergencyContactName: cleanSingleLineText(body.emergencyContactName),
    emergencyContactRelationship: cleanSingleLineText(body.emergencyContactRelationship),
    emergencyContactPhone: cleanSingleLineText(body.emergencyContactPhone),
    emergencyContactAlternatePhone: cleanSingleLineText(body.emergencyContactAlternatePhone),
    employmentStatus: cleanText(body.employmentStatus || 'active').toLowerCase(),
    profilePicture: profilePicture.value
  };

  if (!profile.firstName || !profile.lastName || !profile.email) {
    return { error:'First name, last name, and email address are required.' };
  }
  if (!isEmail(profile.email)) return { error:'Enter a valid email address.' };
  if (!profile.hireDate || !isIsoDate(profile.hireDate)) return { error:'Enter a valid date hired.' };
  if (profile.dateOfBirth && (!isIsoDate(profile.dateOfBirth) || profile.dateOfBirth > new Date().toISOString().slice(0, 10))) {
    return { error:'Enter a valid date of birth that is not in the future.' };
  }
  if (!genderValues.has(profile.gender)) return { error:'Select a valid gender.' };
  if (!civilStatusValues.has(profile.civilStatus)) return { error:'Select a valid civil status.' };
  if (!['active', 'inactive'].includes(profile.employmentStatus)) return { error:'Invalid employment status.' };
  if (!isPhoneNumber(profile.phone) || !isPhoneNumber(profile.emergencyContactPhone) || !isPhoneNumber(profile.emergencyContactAlternatePhone)) {
    return { error:'Enter valid contact numbers using 7 to 20 digits.' };
  }

  const textLimits = [
    [profile.firstName, 100], [profile.middleName, 100], [profile.lastName, 100], [profile.suffix, 30],
    [profile.preferredName, 100], [profile.email, 254], [profile.phone, 40], [profile.address, 600],
    [profile.emergencyContactName, 200], [profile.emergencyContactRelationship, 100],
    [profile.emergencyContactPhone, 40], [profile.emergencyContactAlternatePhone, 40]
  ];
  if (textLimits.some(([value, maximum]) => value.length > maximum)) {
    return { error:'One or more employee profile fields are too long.' };
  }

  return { value:profile };
}
