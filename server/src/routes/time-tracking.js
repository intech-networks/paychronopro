import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requirePermission } from '../auth/authorization.js';

export const timeTrackingRouter = Router();

timeTrackingRouter.get('/employees', ...requirePermission('time_tracking', 'view'), async (request, response, next) => {
  try {
    const search = String(request.query.search || '').trim();
    const showAll = request.query.showAll === 'true';
    if (!search && !showAll) return response.json({ employees: [] });
    const pattern = `%${search}%`;
    const result = await pool.query(
      `SELECT id, employee_number AS "employeeNumber", first_name AS "firstName",
              last_name AS "lastName", preferred_name AS "preferredName", email,
              job_title AS "jobTitle", department, employment_status AS "employmentStatus"
       FROM employee_profiles
       WHERE $2::boolean = TRUE OR employee_number ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1
          OR preferred_name ILIKE $1 OR email ILIKE $1 OR department ILIKE $1
          OR job_title ILIKE $1
       ORDER BY employment_status = 'active' DESC, last_name, first_name
       LIMIT CASE WHEN $2::boolean THEN 200 ELSE 20 END`,
      [pattern, showAll]
    );
    response.json({ employees: result.rows });
  } catch (error) { next(error); }
});
