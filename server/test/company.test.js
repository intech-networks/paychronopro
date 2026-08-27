import assert from 'node:assert/strict';
import test from 'node:test';
import { maximumCompanyLogoBytes, validateCompanyProfileInput } from '../src/company/validation.js';

const transparentPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg==';

test('validates and normalizes a company profile', () => {
  const result = validateCompanyProfileInput({
    companyName:'  PayTimePro   Philippines  ',
    companyAddress:'  123 Main Street\nManila  ',
    contactNumber:'  +63 2 1234 5678  ',
    emailAddress:'  INFO@PAYTIMEPRO.TEST  ',
    website:' https://paytimepro.test ',
    description:'  Workforce and payroll administration.  '
  });

  assert.deepEqual(result.value, {
    companyName:'PayTimePro Philippines',
    companyAddress:'123 Main Street\nManila',
    contactNumber:'+63 2 1234 5678',
    emailAddress:'info@paytimepro.test',
    website:'https://paytimepro.test',
    description:'Workforce and payroll administration.',
    clearLogo:false,
    logo:null
  });
});

test('rejects invalid company profile input', () => {
  assert.equal(validateCompanyProfileInput(null).error, 'Company profile data must be a JSON object.');
  assert.equal(validateCompanyProfileInput({ companyName:'' }).error, 'Please enter the company name.');
  assert.equal(validateCompanyProfileInput({
    companyName:'PayTimePro', emailAddress:'not-an-email'
  }).error, 'Please enter a valid company email address.');
  assert.equal(validateCompanyProfileInput({
    companyName:'PayTimePro', website:'paytimepro.test'
  }).error, 'Website must be a valid http:// or https:// address.');
});

test('accepts a valid company logo and rejects invalid logo input', () => {
  const valid = validateCompanyProfileInput({
    companyName:'PayTimePro',
    logoBase64:transparentPng,
    logoMimeType:'image/png'
  });
  assert.equal(valid.value.logo.mimeType, 'image/png');
  assert.equal(valid.value.logo.data.toString('base64'), transparentPng);

  assert.equal(validateCompanyProfileInput({
    companyName:'PayTimePro',
    logoBase64:Buffer.alloc(maximumCompanyLogoBytes + 1).toString('base64'),
    logoMimeType:'image/png'
  }).error, 'Logo must be a valid PNG, JPEG, or WebP image no larger than 2 MB.');
  assert.equal(validateCompanyProfileInput({
    companyName:'PayTimePro',
    logoBase64:transparentPng,
    logoMimeType:'image/jpeg'
  }).error, 'Logo must be a valid PNG, JPEG, or WebP image no larger than 2 MB.');
});
