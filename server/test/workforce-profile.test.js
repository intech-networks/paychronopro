import assert from 'node:assert/strict';
import test from 'node:test';
import { maximumEmployeeProfilePictureBytes, parseEmployeeProfileInput } from '../src/workforce/profile-validation.js';

const transparentPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg==';

test('normalizes the complete employee profile input', () => {
  const result = parseEmployeeProfileInput({
    firstName:'  Maria  ', middleName:'  Santos ', lastName:'  Reyes ', suffix:' Jr. ', preferredName:'  Mai ',
    email:' MARIA.REYES@PAYTIMEPRO.TEST ', phone:' +63 (912) 345-6789 ',
    address:'  123 Main Street\nManila  ', dateOfBirth:'1994-06-15', gender:'female', civilStatus:'single',
    hireDate:'2024-01-10', emergencyContactName:' Ana Reyes ', emergencyContactRelationship:' Parent ',
    emergencyContactPhone:'+63 917 111 2222', emergencyContactAlternatePhone:'', employmentStatus:'active'
  });

  assert.deepEqual(result.value, {
    firstName:'Maria', middleName:'Santos', lastName:'Reyes', suffix:'Jr.', preferredName:'Mai',
    email:'maria.reyes@paytimepro.test', phone:'+63 (912) 345-6789', address:'123 Main Street\nManila',
    dateOfBirth:'1994-06-15', gender:'female', civilStatus:'single', hireDate:'2024-01-10',
    emergencyContactName:'Ana Reyes', emergencyContactRelationship:'Parent',
    emergencyContactPhone:'+63 917 111 2222', emergencyContactAlternatePhone:'', employmentStatus:'active',
    profilePicture:{ action:'keep', data:null, mimeType:null }
  });
});

test('rejects malformed employee profile values safely', () => {
  assert.equal(parseEmployeeProfileInput(null).error, 'Employee profile data must be a JSON object.');
  assert.equal(parseEmployeeProfileInput({ firstName:'Maria', lastName:'Reyes', email:'bad-email', hireDate:'2024-01-01' }).error, 'Enter a valid email address.');
  assert.equal(parseEmployeeProfileInput({ firstName:'Maria', lastName:'Reyes', email:'maria@example.test', hireDate:'' }).error, 'Enter a valid date hired.');
  assert.equal(parseEmployeeProfileInput({ firstName:'Maria', lastName:'Reyes', email:'maria@example.test', hireDate:'2024-01-01', phone:'not a phone' }).error, 'Enter valid contact numbers using 7 to 20 digits.');
  assert.equal(parseEmployeeProfileInput({ firstName:'Maria', lastName:'Reyes', email:'maria@example.test', hireDate:'2024-01-01', gender:'unknown' }).error, 'Select a valid gender.');
});

test('accepts a valid profile picture and rejects spoofed, oversized, and conflicting image input', () => {
  const valid = parseEmployeeProfileInput({
    firstName:'Maria', lastName:'Reyes', email:'maria@example.test', hireDate:'2024-01-01',
    profilePictureBase64:transparentPng, profilePictureMimeType:'image/png'
  });
  assert.equal(valid.value.profilePicture.action, 'replace');
  assert.equal(valid.value.profilePicture.mimeType, 'image/png');
  assert.equal(valid.value.profilePicture.data.toString('base64'), transparentPng);

  assert.equal(parseEmployeeProfileInput({
    firstName:'Maria', lastName:'Reyes', email:'maria@example.test', hireDate:'2024-01-01',
    profilePictureBase64:transparentPng, profilePictureMimeType:'image/jpeg'
  }).error, 'Profile picture must be a valid PNG, JPEG, or WebP image no larger than 2 MB.');

  const tooLarge = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(maximumEmployeeProfilePictureBytes)]).toString('base64');
  assert.equal(parseEmployeeProfileInput({
    firstName:'Maria', lastName:'Reyes', email:'maria@example.test', hireDate:'2024-01-01',
    profilePictureBase64:tooLarge, profilePictureMimeType:'image/png'
  }).error, 'Profile picture must be a valid PNG, JPEG, or WebP image no larger than 2 MB.');

  assert.equal(parseEmployeeProfileInput({
    firstName:'Maria', lastName:'Reyes', email:'maria@example.test', hireDate:'2024-01-01',
    clearProfilePicture:true, profilePictureBase64:transparentPng, profilePictureMimeType:'image/png'
  }).error, 'Choose a new profile picture or remove the current one, not both.');
});
