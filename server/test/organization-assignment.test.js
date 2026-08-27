import test from 'node:test';
import assert from 'node:assert/strict';
import { deactivateEmployeeOrganization } from '../src/organization/assignment-service.js';

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

test('deactivating an employee closes assignments and clears active routing references', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql:compactSql(sql), parameters });
      return { rows:[], rowCount:0 };
    }
  };

  await deactivateEmployeeOrganization(client, '42');

  assert.equal(calls.length, 7);
  for (const call of calls) assert.deepEqual(call.parameters, ['42']);
  assert.match(calls[0].sql, /FROM organization_assignments assignment/);
  assert.match(calls[1].sql, /DELETE FROM organization_assignment_managers/);
  assert.match(calls[2].sql, /UPDATE organization_assignments assignment SET manager_employee_id=/);
  assert.match(calls[3].sql, /DELETE FROM organization_assignments WHERE employee_id=\$1 AND effective_from>=CURRENT_DATE/);
  assert.match(calls[4].sql, /SET effective_to=CURRENT_DATE-1/);
  assert.match(calls[5].sql, /UPDATE employee_leave_requests SET approver_employee_id=NULL/);
  assert.match(calls[6].sql, /UPDATE employee_profiles SET department='', job_title=''/);
});

test('deactivation rejects an invalid employee identifier before querying', async () => {
  const client = { query:() => assert.fail('The database must not be queried for an invalid employee ID.') };
  await assert.rejects(
    deactivateEmployeeOrganization(client, 'not-an-id'),
    /Select a valid employee\./
  );
});
