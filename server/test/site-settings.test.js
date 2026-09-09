import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSiteSettingsInput } from '../src/site/validation.js';

const transparentPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg==';

test('validates and normalizes site identity and colors', () => {
  const result = validateSiteSettingsInput({
    siteName:'  Acme Payroll  ',
    tagline:'  Payroll, made clear.  ',
    supportEmail:' SUPPORT@ACME.TEST ',
    footerText:'  Secure access  ',
    primaryColor:'#123abc',
    secondaryColor:'#345E96',
    accentColor:'#fedcba'
  });

  assert.deepEqual(result.value, {
    siteName:'Acme Payroll',
    tagline:'Payroll, made clear.',
    supportEmail:'support@acme.test',
    footerText:'Secure access',
    primaryColor:'#123ABC',
    secondaryColor:'#345E96',
    accentColor:'#FEDCBA',
    clearLogo:false,
    logo:null,
    clearFavicon:false,
    favicon:null
  });
});

test('rejects invalid site settings values', () => {
  assert.equal(validateSiteSettingsInput(null).error, 'Site settings data must be a JSON object.');
  assert.equal(validateSiteSettingsInput({ siteName:'', primaryColor:'#17314D', secondaryColor:'#3F5872', accentColor:'#9A6D4A' }).error, 'Please enter a site name.');
  assert.equal(validateSiteSettingsInput({ siteName:'PayTimePro', supportEmail:'not-an-email', primaryColor:'#17314D', secondaryColor:'#3F5872', accentColor:'#9A6D4A' }).error, 'Please enter a valid support email address.');
  assert.equal(validateSiteSettingsInput({ siteName:'PayTimePro', primaryColor:'#12345', secondaryColor:'#3F5872', accentColor:'#9A6D4A' }).error, 'Primary color must be a 6-digit hex color such as #17314D.');
});

test('accepts a valid site logo and prevents conflicting logo actions', () => {
  const valid = validateSiteSettingsInput({
    siteName:'PayTimePro',
    primaryColor:'#17314D', secondaryColor:'#3F5872', accentColor:'#9A6D4A',
    logoBase64:transparentPng, logoMimeType:'image/png'
  });
  assert.equal(valid.value.logo.mimeType, 'image/png');
  assert.equal(valid.value.logo.data.toString('base64'), transparentPng);
  assert.equal(validateSiteSettingsInput({
    siteName:'PayTimePro', primaryColor:'#17314D', secondaryColor:'#3F5872', accentColor:'#9A6D4A',
    clearLogo:true, logoBase64:transparentPng, logoMimeType:'image/png'
  }).error, 'Choose a new logo or remove the current logo, not both.');
});

test('accepts a valid favicon and rejects unreadable or conflicting favicon actions', () => {
  const valid = validateSiteSettingsInput({
    siteName:'PayTimePro',
    primaryColor:'#17314D', secondaryColor:'#3F5872', accentColor:'#9A6D4A',
    faviconBase64:transparentPng, faviconMimeType:'image/png'
  });
  assert.equal(valid.value.favicon.mimeType, 'image/png');
  assert.equal(valid.value.favicon.data.toString('base64'), transparentPng);
  assert.equal(validateSiteSettingsInput({
    siteName:'PayTimePro', primaryColor:'#17314D', secondaryColor:'#3F5872', accentColor:'#9A6D4A',
    clearFavicon:true, faviconBase64:transparentPng, faviconMimeType:'image/png'
  }).error, 'Choose a new favicon or remove the current favicon, not both.');
  assert.equal(validateSiteSettingsInput({
    siteName:'PayTimePro', primaryColor:'#17314D', secondaryColor:'#3F5872', accentColor:'#9A6D4A',
    faviconBase64:'not-an-image', faviconMimeType:'image/png'
  }).error, 'Favicon must be a valid PNG or ICO image no larger than 512 KB.');
});

test('rejects colors that cannot provide readable foreground text', () => {
  assert.equal(validateSiteSettingsInput({
    siteName:'PayTimePro', primaryColor:'#888888', secondaryColor:'#3F5872', accentColor:'#9A6D4A'
  }).error, 'Primary color has insufficient contrast. Choose a darker or lighter color.');
});
