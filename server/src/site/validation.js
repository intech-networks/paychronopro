import { isEmail } from '../validation.js';
import {
  companyLogoMimeTypes,
  decodeBase64Image,
  maximumCompanyLogoBytes
} from '../company/validation.js';

export const siteFaviconMimeTypes = ['image/png', 'image/x-icon'];
export const maximumSiteFaviconBytes = 512 * 1024;
const minimumContrastRatio = 4.5;
const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;

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

function colorRgb(value) {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function relativeLuminance(value) {
  return colorRgb(value).map((channel) => channel / 255).map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + .05) / (darker + .05);
}

function hasUsableForeground(color) {
  return Math.max(contrastRatio(color, '#FFFFFF'), contrastRatio(color, '#17314D')) >= minimumContrastRatio;
}

function validateColor(value, label) {
  const color = cleanText(value).toUpperCase();
  return hexColorPattern.test(color)
    ? { value:color }
    : { error:`${label} must be a 6-digit hex color such as #17314D.` };
}

export function validateSiteSettingsInput(body = {}) {
  if (!isRequestBody(body)) return { error:'Site settings data must be a JSON object.' };

  const siteName = cleanSingleLineText(body.siteName);
  const tagline = cleanSingleLineText(body.tagline);
  const supportEmail = cleanSingleLineText(body.supportEmail).toLowerCase();
  const footerText = cleanSingleLineText(body.footerText);
  const primaryColorResult = validateColor(body.primaryColor, 'Primary color');
  const secondaryColorResult = validateColor(body.secondaryColor, 'Secondary color');
  const accentColorResult = validateColor(body.accentColor, 'Highlight/accent color');
  const clearLogo = body.clearLogo === true;
  const logoFieldsIncluded = hasOwn(body, 'logoBase64') || hasOwn(body, 'logoMimeType');
  const clearFavicon = body.clearFavicon === true;
  const faviconFieldsIncluded = hasOwn(body, 'faviconBase64') || hasOwn(body, 'faviconMimeType');

  if (!siteName) return { error:'Please enter a site name.' };
  if (siteName.length > 80) return { error:'Site name must be 80 characters or fewer.' };
  if (tagline.length > 160) return { error:'Tagline must be 160 characters or fewer.' };
  if (supportEmail && !isEmail(supportEmail)) return { error:'Please enter a valid support email address.' };
  if (supportEmail.length > 254) return { error:'Support email must be 254 characters or fewer.' };
  if (footerText.length > 120) return { error:'Footer text must be 120 characters or fewer.' };
  if (primaryColorResult.error) return primaryColorResult;
  if (secondaryColorResult.error) return secondaryColorResult;
  if (accentColorResult.error) return accentColorResult;
  if (!hasUsableForeground(primaryColorResult.value)) return { error:'Primary color has insufficient contrast. Choose a darker or lighter color.' };
  if (!hasUsableForeground(secondaryColorResult.value)) return { error:'Secondary color has insufficient contrast. Choose a darker or lighter color.' };
  if (!hasUsableForeground(accentColorResult.value)) return { error:'Highlight/accent color has insufficient contrast. Choose a darker or lighter color.' };

  if (clearLogo && logoFieldsIncluded && (cleanText(body.logoBase64) || cleanText(body.logoMimeType))) {
    return { error:'Choose a new logo or remove the current logo, not both.' };
  }

  let logo = null;
  if (logoFieldsIncluded && !clearLogo) {
    const mimeType = cleanText(body.logoMimeType).toLowerCase();
    if (!companyLogoMimeTypes.includes(mimeType)) return { error:'Logo must be a PNG, JPEG, or WebP image.' };
    const data = decodeBase64Image(body.logoBase64, mimeType);
    if (!data) return { error:`Logo must be a valid PNG, JPEG, or WebP image no larger than ${maximumCompanyLogoBytes / 1024 / 1024} MB.` };
    logo = { data, mimeType };
  }

  if (clearFavicon && faviconFieldsIncluded && (cleanText(body.faviconBase64) || cleanText(body.faviconMimeType))) {
    return { error:'Choose a new favicon or remove the current favicon, not both.' };
  }

  let favicon = null;
  if (faviconFieldsIncluded && !clearFavicon) {
    const mimeType = cleanText(body.faviconMimeType).toLowerCase();
    if (!siteFaviconMimeTypes.includes(mimeType)) return { error:'Favicon must be a PNG or ICO image.' };
    const data = decodeBase64Image(body.faviconBase64, mimeType, maximumSiteFaviconBytes);
    if (!data) return { error:'Favicon must be a valid PNG or ICO image no larger than 512 KB.' };
    favicon = { data, mimeType };
  }

  return {
    value: {
      siteName,
      tagline,
      supportEmail,
      footerText,
      primaryColor:primaryColorResult.value,
      secondaryColor:secondaryColorResult.value,
      accentColor:accentColorResult.value,
      clearLogo,
      logo,
      clearFavicon,
      favicon
    }
  };
}
