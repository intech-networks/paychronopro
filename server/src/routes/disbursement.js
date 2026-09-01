import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requirePermission } from '../auth/authorization.js';
import { isPositiveInteger } from '../validation.js';
import { validateDisbursementUpdate } from '../payroll/disbursement.js';

export const disbursementRouter = Router();

disbursementRouter.get(
  '/disbursements',
  ...requirePermission('disbursement', 'view'),
  async (_request, response, next) => {
    try {
      const result = await pool.query(
        `SELECT run.id, run.period_start AS "periodStart", run.period_end AS "periodEnd",
                run.pay_date AS "payDate", run.status,
                COUNT(item.id)::integer AS "employeeCount",
                COALESCE(SUM(item.net_pay),0) AS "totalNetPay",
                COUNT(item.id) FILTER (WHERE item.disbursement_status='pending')::integer AS "pendingCount",
                COUNT(item.id) FILTER (WHERE item.disbursement_status='processing')::integer AS "processingCount",
                COUNT(item.id) FILTER (WHERE item.disbursement_status='paid')::integer AS "paidCount",
                COUNT(item.id) FILTER (WHERE item.disbursement_status='failed')::integer AS "failedCount",
                COALESCE(SUM(item.net_pay) FILTER (WHERE item.disbursement_status='paid'),0) AS "paidAmount"
         FROM payroll_runs run
         JOIN payroll_run_items item ON item.run_id=run.id
         WHERE run.status='finalized'
         GROUP BY run.id
         ORDER BY run.pay_date DESC, run.id DESC
         LIMIT 200`
      );
      return response.json({ runs:result.rows });
    } catch (error) { return next(error); }
  }
);

disbursementRouter.get(
  '/disbursements/:runId',
  ...requirePermission('disbursement', 'view'),
  async (request, response, next) => {
    if (!isPositiveInteger(request.params.runId)) {
      return response.status(400).json({ error:'A valid payroll run is required.' });
    }
    try {
      const runResult = await pool.query(
        `SELECT id, period_start AS "periodStart", period_end AS "periodEnd",
                pay_date AS "payDate", status
         FROM payroll_runs WHERE id=$1 AND status='finalized'`,
        [request.params.runId]
      );
      if (!runResult.rowCount) {
        return response.status(404).json({ error:'Finalized payroll run not found.' });
      }
      const itemResult = await pool.query(
        `SELECT item.id, employee.id AS "employeeId",
                employee.employee_number AS "employeeNumber",
                employee.first_name AS "firstName", employee.last_name AS "lastName",
                item.net_pay AS "netPay",
                item.disbursement_status AS status,
                item.disbursement_method AS method,
                item.disbursement_reference AS reference,
                item.disbursement_notes AS notes,
                item.disbursed_at AS "disbursedAt",
                actor.display_name AS "disbursedBy"
         FROM payroll_run_items item
         JOIN employee_profiles employee ON employee.id=item.employee_id
         LEFT JOIN users actor ON actor.id=item.disbursed_by
         WHERE item.run_id=$1
         ORDER BY employee.last_name, employee.first_name, employee.id`,
        [request.params.runId]
      );
      return response.json({ run:runResult.rows[0], items:itemResult.rows });
    } catch (error) { return next(error); }
  }
);

disbursementRouter.patch(
  '/disbursements/:runId/items/:itemId',
  ...requirePermission('disbursement', 'update'),
  async (request, response, next) => {
    if (!isPositiveInteger(request.params.runId) || !isPositiveInteger(request.params.itemId)) {
      return response.status(400).json({ error:'A valid payroll run and employee payment are required.' });
    }
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      const current = await client.query(
        `SELECT item.id, item.disbursement_status AS status
         FROM payroll_run_items item
         JOIN payroll_runs run ON run.id=item.run_id
         WHERE item.id=$1 AND item.run_id=$2 AND run.status='finalized'
         FOR UPDATE OF item`,
        [request.params.itemId, request.params.runId]
      );
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return response.status(404).json({ error:'Employee disbursement was not found in this finalized payroll run.' });
      }
      const parsed = validateDisbursementUpdate(request.body, current.rows[0].status);
      if (parsed.error) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return response.status(400).json({ error:parsed.error });
      }
      const { status, method, reference, notes } = parsed.value;
      const updated = await client.query(
        `UPDATE payroll_run_items
         SET disbursement_status=$3,
             disbursement_method=$4,
             disbursement_reference=$5,
             disbursement_notes=$6,
             disbursed_at=CASE WHEN $3='paid' THEN COALESCE(disbursed_at,NOW()) ELSE NULL END,
             disbursed_by=CASE WHEN $3='paid' THEN $7 ELSE NULL END
         WHERE id=$1 AND run_id=$2
         RETURNING id, disbursement_status AS status,
                   disbursement_method AS method,
                   disbursement_reference AS reference,
                   disbursement_notes AS notes,
                   disbursed_at AS "disbursedAt"`,
        [request.params.itemId, request.params.runId, status, method, reference, notes, request.user.id]
      );
      await client.query('COMMIT');
      transactionStarted = false;
      return response.json({ item:updated.rows[0], message:'Disbursement updated.' });
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK');
      return next(error);
    } finally { client.release(); }
  }
);
