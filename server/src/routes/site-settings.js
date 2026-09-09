import { Router } from 'express';
import { requireAuth, requirePermission } from '../auth/authorization.js';
import { validateSiteSettingsInput } from '../site/validation.js';
import { pool } from '../db/pool.js';

export const siteSettingsRouter = Router();

const settingsColumns = `
  site_name AS "siteName",
  tagline,
  support_email AS "supportEmail",
  footer_text AS "footerText",
  primary_color AS "primaryColor",
  secondary_color AS "secondaryColor",
  accent_color AS "accentColor",
  favicon_data IS NOT NULL AS "hasFavicon",
  favicon_updated_at AS "faviconUpdatedAt",
  updated_at AS "updatedAt"
`;

function serializeSettings(settings, logo) {
  const logoVersion = logo?.updatedAt ? new Date(logo.updatedAt).valueOf() : 0;
  const faviconVersion = settings.faviconUpdatedAt ? new Date(settings.faviconUpdatedAt).valueOf() : 0;
  return {
    siteName: settings.siteName || 'PayTimePro',
    tagline: settings.tagline || '',
    supportEmail: settings.supportEmail || '',
    footerText: settings.footerText || '',
    primaryColor: settings.primaryColor || '#17314D',
    secondaryColor: settings.secondaryColor || '#3F5872',
    accentColor: settings.accentColor || '#9A6D4A',
    hasLogo: Boolean(logo?.hasLogo),
    logoUrl: logo?.hasLogo ? `/api/site-settings/logo?v=${encodeURIComponent(logoVersion)}` : null,
    hasFavicon: Boolean(settings.hasFavicon),
    faviconUrl: settings.hasFavicon ? `/api/site-settings/favicon?v=${encodeURIComponent(faviconVersion)}` : null,
    updatedAt: settings.updatedAt
  };
}

async function ensureRows(client) {
  await client.query('INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  await client.query('INSERT INTO company_profiles (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
}

async function loadSettings(client = pool) {
  await ensureRows(client);
  const [settingsResult, logoResult] = await Promise.all([
    client.query(`SELECT ${settingsColumns} FROM site_settings WHERE id=1`),
    client.query('SELECT logo_data IS NOT NULL AS "hasLogo", updated_at AS "updatedAt" FROM company_profiles WHERE id=1')
  ]);
  return serializeSettings(settingsResult.rows[0], logoResult.rows[0]);
}

function settingsWriteError(error, response) {
  if (error?.code === '23514' || error?.code === '22001') {
    response.status(400).json({ error:'Please review the site settings values and try again.' });
    return true;
  }
  if (error?.code === '23503') {
    response.status(409).json({ error:'The site settings could not be saved because the signed-in user is no longer available.' });
    return true;
  }
  return false;
}

siteSettingsRouter.get('/public', async (_request, response, next) => {
  try {
    const settings = await loadSettings();
    response.setHeader('Cache-Control', 'private, no-store');
    return response.json({ settings: {
      ...settings,
      logoUrl: settings.logoUrl?.replace('/logo?', '/logo-public?') || null,
      faviconUrl: settings.faviconUrl?.replace('/favicon?', '/favicon-public?') || null
    } });
  } catch (error) {
    return next(error);
  }
});

siteSettingsRouter.get('/', requireAuth, async (_request, response, next) => {
  try {
    const settings = await loadSettings();
    response.setHeader('Cache-Control', 'private, no-store');
    return response.json({ settings });
  } catch (error) {
    return next(error);
  }
});

siteSettingsRouter.get('/logo-public', async (_request, response, next) => {
  try {
    const result = await pool.query('SELECT logo_data AS "logoData", logo_mime_type AS "logoMimeType" FROM company_profiles WHERE id=1');
    const logo = result.rows[0];
    if (!logo?.logoData || !logo.logoMimeType) return response.status(404).json({ error:'No site logo has been uploaded.' });
    response.setHeader('Cache-Control', 'private, no-store');
    response.type(logo.logoMimeType);
    return response.send(logo.logoData);
  } catch (error) {
    return next(error);
  }
});

siteSettingsRouter.get('/logo', requireAuth, async (_request, response, next) => {
  try {
    const result = await pool.query('SELECT logo_data AS "logoData", logo_mime_type AS "logoMimeType" FROM company_profiles WHERE id=1');
    const logo = result.rows[0];
    if (!logo?.logoData || !logo.logoMimeType) return response.status(404).json({ error:'No site logo has been uploaded.' });
    response.setHeader('Cache-Control', 'private, no-store');
    response.type(logo.logoMimeType);
    return response.send(logo.logoData);
  } catch (error) {
    return next(error);
  }
});

async function sendFavicon(response, next) {
  try {
    const result = await pool.query('SELECT favicon_data AS "faviconData", favicon_mime_type AS "faviconMimeType" FROM site_settings WHERE id=1');
    const favicon = result.rows[0];
    if (!favicon?.faviconData || !favicon.faviconMimeType) return response.status(404).json({ error:'No site favicon has been uploaded.' });
    response.setHeader('Cache-Control', 'private, no-store');
    response.type(favicon.faviconMimeType);
    return response.send(favicon.faviconData);
  } catch (error) {
    return next(error);
  }
}

siteSettingsRouter.get('/favicon-public', (_request, response, next) => sendFavicon(response, next));
siteSettingsRouter.get('/favicon', requireAuth, (_request, response, next) => sendFavicon(response, next));

siteSettingsRouter.get('/history', ...requirePermission('site_settings', 'view'), async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT audit.id, audit.site_name AS "siteName", audit.tagline,
              audit.primary_color AS "primaryColor", audit.secondary_color AS "secondaryColor",
              audit.accent_color AS "accentColor", audit.has_logo AS "hasLogo",
              audit.has_favicon AS "hasFavicon", audit.changed_at AS "changedAt",
              COALESCE(user_account.display_name, 'System') AS "changedBy"
       FROM site_settings_audit audit
       LEFT JOIN users user_account ON user_account.id=audit.changed_by
       ORDER BY audit.changed_at DESC, audit.id DESC
       LIMIT 10`
    );
    response.setHeader('Cache-Control', 'private, no-store');
    return response.json({ history:result.rows });
  } catch (error) {
    return next(error);
  }
});

siteSettingsRouter.put('/', ...requirePermission('site_settings', 'update'), async (request, response, next) => {
  const parsed = validateSiteSettingsInput(request.body);
  if (parsed.error) return response.status(400).json({ error:parsed.error });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureRows(client);
    const replaceLogo = parsed.value.clearLogo || parsed.value.logo !== null;
    const replaceFavicon = parsed.value.clearFavicon || parsed.value.favicon !== null;
    await client.query(
      `UPDATE site_settings
       SET site_name=$1, tagline=$2, support_email=$3, footer_text=$4,
           primary_color=$5, secondary_color=$6, accent_color=$7,
           favicon_data=CASE WHEN $8::boolean THEN $9::bytea ELSE favicon_data END,
           favicon_mime_type=CASE WHEN $8::boolean THEN $10::text ELSE favicon_mime_type END,
           favicon_updated_at=CASE WHEN $8::boolean THEN CASE WHEN $9::bytea IS NULL THEN NULL ELSE NOW() END ELSE favicon_updated_at END,
           updated_by=$11, updated_at=NOW()
       WHERE id=1`,
      [
        parsed.value.siteName,
        parsed.value.tagline,
        parsed.value.supportEmail,
        parsed.value.footerText,
        parsed.value.primaryColor,
        parsed.value.secondaryColor,
        parsed.value.accentColor,
        replaceFavicon,
        parsed.value.favicon?.data || null,
        parsed.value.favicon?.mimeType || null,
        request.user.id
      ]
    );
    if (replaceLogo) {
      await client.query(
        `UPDATE company_profiles
         SET logo_data=$1, logo_mime_type=$2, updated_by=$3, updated_at=NOW()
         WHERE id=1`,
        [parsed.value.logo?.data || null, parsed.value.logo?.mimeType || null, request.user.id]
      );
    }
    const settings = await loadSettings(client);
    await client.query(
      `INSERT INTO site_settings_audit
         (site_settings_id, changed_by, site_name, tagline, primary_color, secondary_color, accent_color, has_logo, has_favicon)
       SELECT site_settings.id, $1, site_settings.site_name, site_settings.tagline,
              site_settings.primary_color, site_settings.secondary_color, site_settings.accent_color,
              company_profiles.logo_data IS NOT NULL, site_settings.favicon_data IS NOT NULL
       FROM site_settings
       LEFT JOIN company_profiles ON company_profiles.id=1
       WHERE site_settings.id=1`,
      [request.user.id]
    );
    await client.query('COMMIT');
    response.setHeader('Cache-Control', 'private, no-store');
    return response.json({ settings });
  } catch (error) {
    await client.query('ROLLBACK');
    if (settingsWriteError(error, response)) return undefined;
    return next(error);
  } finally {
    client.release();
  }
});
