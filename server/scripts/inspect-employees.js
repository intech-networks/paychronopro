import { pool } from '../src/db/pool.js';

try {
  const result = await pool.query(
    `SELECT ep.id, ep.employee_number, ep.first_name, ep.last_name, ep.preferred_name,
            ep.email, ep.phone, ep.job_title, ep.department, ep.hire_date,
            ep.emergency_contact_name, ep.emergency_contact_relationship,
            ep.emergency_contact_phone, ep.emergency_contact_alternate_phone,
            ep.employment_status, ep.user_id, u.is_system, r.name AS role,
            (SELECT COUNT(*)::INTEGER FROM employee_documents d WHERE d.employee_id = ep.id) AS document_count
     FROM employee_profiles ep
     LEFT JOIN users u ON u.id = ep.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     ORDER BY ep.id`
  );
  console.log(JSON.stringify(result.rows, null, 2));
} finally {
  await pool.end();
}
