import bcrypt from 'bcryptjs';
import { pool } from '../src/db/pool.js';

const applyChanges = process.argv.includes('--apply');
const temporaryPassword = 'Employee123!';
const oldSampleEmails = [
  'maria.santos@paytimepro.local',
  'daniel.reyes@paytimepro.local',
  'angela.cruz@paytimepro.local',
  'miguel.garcia@paytimepro.local',
  'sofia.mendoza@paytimepro.local'
];

const employees = [
  ['000001', 'Liam', 'Villanueva', 'Liam', 'liam.villanueva@paytimepro.local', '+63 917 210 1001', 'Operations Manager', 'Operations', '2021-02-15'],
  ['000002', 'Camille', 'Navarro', 'Camille', 'camille.navarro@paytimepro.local', '+63 917 210 1002', 'Senior Accountant', 'Finance', '2021-07-05'],
  ['000003', 'Paolo', 'Aquino', 'Pao', 'paolo.aquino@paytimepro.local', '+63 917 210 1003', 'Software Engineer', 'Engineering', '2022-01-10'],
  ['000004', 'Isabella', 'Ramos', 'Bella', 'isabella.ramos@paytimepro.local', '+63 917 210 1004', 'People Operations Specialist', 'People', '2022-05-23'],
  ['000005', 'Gabriel', 'Castillo', 'Gab', 'gabriel.castillo@paytimepro.local', '+63 917 210 1005', 'Customer Success Manager', 'Customer Success', '2022-09-12'],
  ['000006', 'Alyssa', 'Domingo', 'Aly', 'alyssa.domingo@paytimepro.local', '+63 917 210 1006', 'Product Designer', 'Product', '2023-01-16'],
  ['000007', 'Nathan', 'Flores', 'Nate', 'nathan.flores@paytimepro.local', '+63 917 210 1007', 'Payroll Specialist', 'Finance', '2023-04-03'],
  ['000008', 'Bianca', 'Mercado', 'Bianca', 'bianca.mercado@paytimepro.local', '+63 917 210 1008', 'Marketing Coordinator', 'Marketing', '2023-08-21'],
  ['000009', 'Enzo', 'Bautista', 'Enzo', 'enzo.bautista@paytimepro.local', '+63 917 210 1009', 'Quality Assurance Engineer', 'Engineering', '2024-02-05'],
  ['000010', 'Mikaela', 'Torres', 'Mika', 'mikaela.torres@paytimepro.local', '+63 917 210 1010', 'Sales Executive', 'Sales', '2024-06-17']
].map(([employeeNumber, firstName, lastName, preferredName, email, phone, jobTitle, , hireDate]) => ({
  employeeNumber, firstName, lastName, preferredName, email, phone, jobTitle, hireDate
}));

const replacementEmails = employees.map((employee) => employee.email);
const emergencyContacts = {
  '000001': ['Sofia Villanueva', 'Spouse', '+63 917 310 1001', '+63 2 8100 1001'],
  '000002': ['Ramon Navarro', 'Father', '+63 917 310 1002', '+63 2 8100 1002'],
  '000003': ['Elena Aquino', 'Mother', '+63 917 310 1003', '+63 2 8100 1003'],
  '000004': ['Marco Ramos', 'Brother', '+63 917 310 1004', '+63 2 8100 1004'],
  '000005': ['Teresa Castillo', 'Spouse', '+63 917 310 1005', '+63 2 8100 1005'],
  '000006': ['Carlo Domingo', 'Brother', '+63 917 310 1006', '+63 2 8100 1006'],
  '000007': ['Grace Flores', 'Spouse', '+63 917 310 1007', '+63 2 8100 1007'],
  '000008': ['Miguel Mercado', 'Father', '+63 917 310 1008', '+63 2 8100 1008'],
  '000009': ['Carmen Bautista', 'Mother', '+63 917 310 1009', '+63 2 8100 1009'],
  '000010': ['Rafael Torres', 'Brother', '+63 917 310 1010', '+63 2 8100 1010']
};
const recognizedEmails = [...oldSampleEmails, ...replacementEmails];
const client = await pool.connect();

try {
  await client.query('BEGIN');
  const existing = await client.query(
    `SELECT ep.id, ep.employee_number AS "employeeNumber", ep.email, ep.user_id AS "userId",
            COALESCE(u.is_system, FALSE) AS "isSystem"
     FROM employee_profiles ep
     LEFT JOIN users u ON u.id = ep.user_id
     WHERE LOWER(ep.email) = ANY($1::text[])
     ORDER BY ep.id
     FOR UPDATE OF ep`,
    [recognizedEmails]
  );

  if (existing.rows.some((employee) => employee.isSystem)) {
    throw new Error('Safety check failed: a recognized sample email belongs to a protected system user.');
  }
  if (![5, 10].includes(existing.rowCount)) {
    throw new Error(`Safety check failed: expected 5 old or 10 replacement samples, found ${existing.rowCount}.`);
  }

  const numberConflicts = await client.query(
    `SELECT employee_number, email FROM employee_profiles
     WHERE employee_number = ANY($1::text[])
       AND LOWER(email) <> ALL($2::text[])`,
    [employees.map((employee) => employee.employeeNumber), recognizedEmails]
  );
  if (numberConflicts.rowCount) {
    throw new Error(`Safety check failed: replacement employee IDs are already used by ${numberConflicts.rows.map((row) => row.email).join(', ')}.`);
  }

  console.log('Sample profiles selected for replacement:');
  for (const employee of existing.rows) console.log(`- ${employee.employeeNumber}: ${employee.email}`);
  if (!applyChanges) {
    console.log('\nDry run only. Re-run with --apply to replace these profiles with 10 samples.');
    await client.query('ROLLBACK');
    process.exitCode = 2;
  } else {
    const roleResult = await client.query("SELECT id FROM roles WHERE name = 'Employee'");
    if (!roleResult.rows[0]) throw new Error('The Employee role does not exist.');
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const userIds = existing.rows.map((employee) => employee.userId).filter(Boolean);
    await client.query('DELETE FROM employee_profiles WHERE id = ANY($1::bigint[])', [existing.rows.map((employee) => employee.id)]);
    if (userIds.length) await client.query('DELETE FROM users WHERE id = ANY($1::bigint[]) AND is_system = FALSE', [userIds]);

    for (const employee of employees) {
      const displayName = `${employee.firstName} ${employee.lastName}`;
      const emergency = emergencyContacts[employee.employeeNumber];
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, display_name, role, role_id)
         VALUES ($1, $2, $3, 'user', $4) RETURNING id`,
        [employee.email, passwordHash, displayName, roleResult.rows[0].id]
      );
      await client.query(
        `INSERT INTO employee_profiles
         (user_id, employee_number, first_name, last_name, preferred_name, email, phone,
          job_title, hire_date, emergency_contact_name,
          emergency_contact_relationship, emergency_contact_phone,
          emergency_contact_alternate_phone, employment_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active')`,
        [userResult.rows[0].id, employee.employeeNumber, employee.firstName, employee.lastName,
          employee.preferredName, employee.email, employee.phone, employee.jobTitle,
          employee.hireDate, ...emergency]
      );
    }
    await client.query('COMMIT');
    console.log(`\nCreated ${employees.length} complete active sample employee profiles.`);
  }
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
