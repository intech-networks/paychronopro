import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requirePermission } from '../auth/authorization.js';
import { calculatePhilippineWithholding } from '../payroll/tax.js';
import { isIsoDate, isPositiveInteger } from '../validation.js';

export const taxRouter = Router();

const frequencies = new Set(['daily', 'weekly', 'semi_monthly', 'monthly']);
const taxConfigurationLockKeyByFrequency = new Map([
  ['daily', 1],
  ['weekly', 2],
  ['semi_monthly', 3],
  ['monthly', 4]
]);
const maximumMoneyValue = 999_999_999_999.99;
const configurationQuery = `
  SELECT configuration.id, configuration.name,
         configuration.effective_from AS "effectiveFrom",
         configuration.effective_to AS "effectiveTo",
         configuration.pay_frequency AS "payFrequency",
         configuration.exemption_amount::double precision AS "exemptionAmount",
         configuration.is_active AS "isActive",
         COALESCE(
           JSONB_AGG(
             JSONB_BUILD_OBJECT(
               'id', bracket.id,
               'lowerBound', bracket.lower_bound,
               'upperBound', bracket.upper_bound,
               'baseTax', bracket.base_tax,
               'ratePercent', bracket.rate_percent
             ) ORDER BY bracket.lower_bound
           ) FILTER (WHERE bracket.id IS NOT NULL),
           '[]'
         ) AS brackets
  FROM tax_configurations configuration
  LEFT JOIN tax_brackets bracket ON bracket.configuration_id = configuration.id
  GROUP BY configuration.id
  ORDER BY configuration.effective_from DESC, configuration.id DESC`;

function finiteNonnegative(value, maximum = maximumMoneyValue, decimalPlaces = 2) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  const factor = 10 ** decimalPlaces;
  const roundedUnits = Math.round(number * factor);
  return Number.isFinite(number) && number >= 0 && number <= maximum
    && Math.abs(number * factor - roundedUnits) <= 1e-7
    ? number
    : null;
}

function normalizeBrackets(value) {
  if (!Array.isArray(value) || !value.length) return { error:'Add at least one tax bracket.' };
  const brackets = value.map((bracket) => {
    const hasUpper = bracket?.upperBound !== '' && bracket?.upperBound != null;
    return {
      lower:finiteNonnegative(bracket?.lowerBound),
      upper:hasUpper ? finiteNonnegative(bracket.upperBound) : null,
      hasUpper,
      base:finiteNonnegative(bracket?.baseTax),
      rate:finiteNonnegative(bracket?.ratePercent, 100, 3)
    };
  }).sort((left, right) => left.lower - right.lower);

  const invalid = brackets.some((bracket, index) =>
    bracket.lower === null
      || (bracket.hasUpper && (bracket.upper === null || bracket.upper <= bracket.lower))
      || bracket.base === null || bracket.rate === null
      || (index > 0 && brackets[index - 1].upper !== bracket.lower)
  ) || brackets[0].lower !== 0 || brackets.at(-1).upper !== null;
  return invalid
    ? { error:'Tax brackets must be valid, continuous, and non-overlapping.' }
    : { value:brackets };
}

async function lockTaxConfigurationWrites(client, payFrequency) {
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtext(current_schema() || ':tax-configuration'),
       $1::integer
     )`,
    [taxConfigurationLockKeyByFrequency.get(payFrequency)]
  );
}

taxRouter.get('/', ...requirePermission('tax_configuration', 'view'), async (_request, response, next) => {
  try {
    const result = await pool.query(configurationQuery);
    return response.json({ configurations:result.rows });
  } catch (error) {
    return next(error);
  }
});

taxRouter.post('/', ...requirePermission('tax_configuration', 'create'), saveTax);
taxRouter.put('/:id', ...requirePermission('tax_configuration', 'update'), saveTax);

async function saveTax(request, response, next) {
  const body = request.body || {};
  const name = String(body.name || '').trim();
  const effectiveFrom = String(body.effectiveFrom || '');
  const effectiveTo = String(body.effectiveTo || '');
  const payFrequency = String(body.payFrequency || '');
  const exemptionAmount = finiteNonnegative(body.exemptionAmount ?? 0);
  const parsedBrackets = normalizeBrackets(body.brackets);

  if (request.params.id && !isPositiveInteger(request.params.id)) {
    return response.status(400).json({ error:'Invalid tax configuration ID.' });
  }
  if (!name || name.length > 160 || !effectiveFrom || !isIsoDate(effectiveFrom) || (effectiveTo && !isIsoDate(effectiveTo))
    || (effectiveTo && effectiveTo < effectiveFrom) || !frequencies.has(payFrequency)
    || exemptionAmount === null || parsedBrackets.error) {
    return response.status(400).json({
      error:parsedBrackets.error || 'Complete the tax configuration with valid dates, frequency, and exemption amount.'
    });
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await lockTaxConfigurationWrites(client, payFrequency);
    if (body.isActive !== false) {
      const overlap = await client.query(
        `SELECT id FROM tax_configurations
         WHERE pay_frequency = $1 AND is_active = TRUE
           AND id <> COALESCE($4::bigint, 0)
           AND effective_from <= COALESCE($3::date, 'infinity'::date)
           AND COALESCE(effective_to, 'infinity'::date) >= $2::date
         LIMIT 1`,
        [payFrequency, effectiveFrom, effectiveTo || null, request.params.id || null]
      );
      if (overlap.rowCount) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return response.status(409).json({ error:'Another active configuration overlaps this frequency and date range.' });
      }
    }

    const values = [name, effectiveFrom, effectiveTo || null, payFrequency, exemptionAmount, body.isActive !== false, request.user.id];
    const saved = request.params.id
      ? await client.query(
        `UPDATE tax_configurations
         SET name=$1, effective_from=$2, effective_to=$3, pay_frequency=$4,
             exemption_amount=$5, is_active=$6, updated_by=$7, updated_at=NOW()
         WHERE id=$8 RETURNING id`,
        [...values, request.params.id]
      )
      : await client.query(
        `INSERT INTO tax_configurations (
           name, effective_from, effective_to, pay_frequency, exemption_amount, is_active, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        values
      );
    if (!saved.rowCount) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return response.status(404).json({ error:'Tax configuration not found.' });
    }

    const configurationId = saved.rows[0].id;
    await client.query('DELETE FROM tax_brackets WHERE configuration_id=$1', [configurationId]);
    for (const bracket of parsedBrackets.value) {
      await client.query(
        `INSERT INTO tax_brackets (configuration_id, lower_bound, upper_bound, base_tax, rate_percent)
         VALUES ($1,$2,$3,$4,$5)`,
        [configurationId, bracket.lower, bracket.upper, bracket.base, bracket.rate]
      );
    }
    await client.query('COMMIT');
    transactionStarted = false;
    return response.json({ id:configurationId, message:'Tax configuration saved.' });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

taxRouter.post('/preview', ...requirePermission('tax_configuration', 'view'), (request, response) => {
  const body = request.body || {};
  const frequency = String(body.frequency || body.payFrequency || 'monthly');
  const numericFields = [
    'regularCompensation', 'supplementaryCompensation', 'nonTaxableCompensation',
    'mandatoryContributions', 'exemptionAmount'
  ];
  const values = Object.fromEntries(numericFields.map((field) => [
    field,
    finiteNonnegative(body[field] ?? 0)
  ]));
  const brackets = normalizeBrackets(body.brackets);
  if (!frequencies.has(frequency)) return response.status(400).json({ error:'Select a valid pay frequency.' });
  if (Object.values(values).some((value) => value === null) || brackets.error) {
    return response.status(400).json({ error:brackets.error || 'Preview amounts must be valid non-negative numbers.' });
  }
  return response.json(calculatePhilippineWithholding({
    ...body,
    ...values,
    frequency,
    brackets:brackets.value.map((bracket) => ({
      lowerBound:bracket.lower,
      upperBound:bracket.upper,
      baseTax:bracket.base,
      ratePercent:bracket.rate
    }))
  }));
});
