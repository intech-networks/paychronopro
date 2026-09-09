import { useEffect, useMemo, useRef, useState } from 'react';
import BrandName from './BrandName.jsx';
import { bestContrastColor, contrastRatio, isHexColor, readableTextColor } from './theme.js';

export const defaultSiteSettings = {
  siteName: 'PayTimePro',
  tagline: 'Simple, secure payroll for modern teams.',
  supportEmail: 'hello@paytimepro.com',
  footerText: 'Secure workforce access',
  primaryColor: '#17314D',
  secondaryColor: '#3F5872',
  accentColor: '#9A6D4A',
  hasLogo: false,
  logoUrl: null,
  hasFavicon: false,
  faviconUrl: null
};

const supportedLogoTypes = ['image/png', 'image/jpeg', 'image/webp'];
const maximumLogoBytes = 2 * 1024 * 1024;
const supportedFaviconTypes = ['image/png', 'image/x-icon'];
const maximumFaviconBytes = 512 * 1024;
const minimumContrastRatio = 4.5;

const colorPresets = [
  { name: 'PayTime Classic', primaryColor: '#17314D', secondaryColor: '#3F5872', accentColor: '#9A6D4A' },
  { name: 'Emerald Office', primaryColor: '#123C36', secondaryColor: '#2E6B62', accentColor: '#D88A4A' },
  { name: 'Executive Plum', primaryColor: '#33234F', secondaryColor: '#604B7A', accentColor: '#D494C5' },
  { name: 'Cobalt Modern', primaryColor: '#123A70', secondaryColor: '#2B66A5', accentColor: '#E0A13B' }
];

const colorFields = [
  ['primaryColor', 'Primary color', 'Main navigation, headings, and primary actions.'],
  ['secondaryColor', 'Secondary color', 'Supporting text, secondary controls, and data surfaces.'],
  ['accentColor', 'Highlight / accent color', 'Active states, links, progress, and attention highlights.']
];

function readApiResponse(response, fallback) {
  return response.json().catch(() => ({})).then((data) => {
    if (!response.ok) throw new Error(data.error || fallback);
    return data;
  });
}

function normalizeSettings(value) {
  return { ...defaultSiteSettings, ...(value || {}) };
}

function colorForPreview(value, fallback) {
  return isHexColor(value) ? value : fallback;
}

function formatHistoryDate(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Unknown time' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function PreviewBrand({ form, logoSource }) {
  return <div className="site-preview-brand">{logoSource ? <img src={logoSource} alt="" /> : <BrandName siteName={form.siteName || defaultSiteSettings.siteName} />}</div>;
}

function PreviewDashboard({ form, logoSource }) {
  return <div className="site-preview-screen preview-dashboard">
    <aside className="preview-dashboard-sidebar">
      <PreviewBrand form={form} logoSource={logoSource} />
      <span className="preview-dashboard-nav active">⌂ Overview</span>
      <span className="preview-dashboard-nav">♙ Workforce</span>
      <span className="preview-dashboard-nav">◷ Timetracking</span>
      <span className="preview-dashboard-nav">$ Payroll</span>
      <span className="preview-dashboard-nav">⚙ Setup</span>
    </aside>
    <div className="preview-dashboard-main">
      <div className="preview-dashboard-topbar"><span>Good morning, Administrator</span><b>•••</b></div>
      <div className="preview-dashboard-copy"><small>{form.tagline || 'Your payroll workspace'}</small><h3>{form.siteName || defaultSiteSettings.siteName}</h3><p>Everything your team needs for accurate, on-time payroll.</p></div>
      <div className="preview-dashboard-metrics"><article><span>Payroll processed</span><strong>₱128,450</strong><small>+12.4% this month</small></article><article><span>Active employees</span><strong>124</strong><small>8 new this quarter</small></article></div>
      <div className="preview-dashboard-table"><div><strong>Payroll activity</strong><b>View report</b></div><span><i />Regular payroll <em>Completed</em></span><span><i />Benefits deductions <em>In review</em></span></div>
    </div>
  </div>;
}

function PreviewLogin({ form, logoSource }) {
  return <div className="site-preview-screen preview-login"><div className="preview-login-card"><PreviewBrand form={form} logoSource={logoSource} /><small>Welcome back</small><h3>Sign in to your account</h3><p>{form.tagline || 'Simple, secure payroll for modern teams.'}</p><label>Email address<span /></label><label>Password<span /></label><button type="button">Sign in <b>→</b></button><footer>Need access? <strong>{form.supportEmail || 'Contact your administrator'}</strong></footer></div></div>;
}

function PreviewReport({ form }) {
  return <div className="site-preview-screen preview-report"><div className="preview-report-header"><div><small>{form.siteName || defaultSiteSettings.siteName}</small><h3>Payroll summary</h3></div><b>JUL 2026</b></div><div className="preview-report-summary"><span>Total payroll<strong>₱1,284,500</strong></span><span>Employees<strong>124</strong></span><span>Pay date<strong>31 Jul 2026</strong></span></div><div className="preview-report-table"><div><span>Employee</span><span>Gross pay</span><span>Status</span></div><p><span>Maria Santos</span><span>₱48,200</span><strong>Processed</strong></p><p><span>Daniel Cruz</span><span>₱42,850</span><strong>Processed</strong></p><p><span>Ana Reyes</span><span>₱39,600</span><strong>Review</strong></p></div></div>;
}

function Preview({ form, logoSource }) {
  const [mode, setMode] = useState('dashboard');
  const [dark, setDark] = useState(false);
  const previewSurface = dark ? '#242526' : '#F5F8F8';
  const previewPrimary = colorForPreview(form.primaryColor, defaultSiteSettings.primaryColor);
  const previewSecondary = colorForPreview(form.secondaryColor, defaultSiteSettings.secondaryColor);
  const previewAccent = colorForPreview(form.accentColor, defaultSiteSettings.accentColor);
  const previewStyle = {
    '--preview-primary': previewPrimary,
    '--preview-secondary': previewSecondary,
    '--preview-accent': previewAccent,
    '--preview-primary-contrast': bestContrastColor(previewPrimary),
    '--preview-secondary-contrast': bestContrastColor(previewSecondary),
    '--preview-accent-contrast': bestContrastColor(previewAccent),
    '--preview-secondary-text': readableTextColor(previewSecondary, previewSurface, dark ? '#F4FAFC' : '#17314D'),
    '--preview-accent-text': readableTextColor(previewAccent, previewSurface, dark ? '#F4FAFC' : '#17314D')
  };
  return <aside className="site-settings-preview-card" aria-label="Site theme preview">
    <div className="site-preview-heading"><span>Live preview</span><h2>Your site theme</h2><p>Check the identity, readability, and color balance before publishing.</p></div>
    <div className="site-preview-toolbar"><div className="site-preview-tabs" role="tablist" aria-label="Preview surface">{[['dashboard', 'Dashboard'], ['login', 'Sign in'], ['report', 'Payroll report']].map(([key, label]) => <button className={mode === key ? 'active' : ''} type="button" role="tab" aria-selected={mode === key} onClick={() => setMode(key)} key={key}>{label}</button>)}</div><button className="site-preview-theme-toggle" type="button" onClick={() => setDark((current) => !current)}>{dark ? '☼ Light' : '☾ Dark'}</button></div>
    <div className={`site-preview-stage${dark ? ' preview-dark' : ''}`} style={previewStyle}>
      {mode === 'dashboard' && <PreviewDashboard form={form} logoSource={logoSource} />}
      {mode === 'login' && <PreviewLogin form={form} logoSource={logoSource} />}
      {mode === 'report' && <PreviewReport form={form} />}
    </div>
    <div className="site-preview-legend"><span><i style={{ background: previewStyle['--preview-primary'] }} />Primary</span><span><i style={{ background: previewStyle['--preview-secondary'] }} />Secondary</span><span><i style={{ background: previewStyle['--preview-accent'] }} />Accent</span></div>
  </aside>;
}

export function SiteSettings({ permission, branding, onSettingsChange, onNotify }) {
  const initialSettings = normalizeSettings(branding);
  const [form, setForm] = useState(initialSettings);
  const [savedForm, setSavedForm] = useState(initialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [logoBase64, setLogoBase64] = useState('');
  const [logoMimeType, setLogoMimeType] = useState('');
  const [clearLogo, setClearLogo] = useState(false);
  const [faviconPreview, setFaviconPreview] = useState('');
  const [faviconBase64, setFaviconBase64] = useState('');
  const [faviconMimeType, setFaviconMimeType] = useState('');
  const [clearFavicon, setClearFavicon] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const mountedRef = useRef(false);

  const colorHealth = useMemo(() => colorFields.map(([key, label]) => {
    const value = form[key];
    const valid = isHexColor(value);
    const ratio = valid ? Math.max(contrastRatio(value, '#FFFFFF'), contrastRatio(value, '#17314D')) : 0;
    return { key, label, value, valid, ratio, foreground: valid ? bestContrastColor(value) : '#17314D' };
  }), [form]);
  const hasInvalidColor = colorHealth.some((color) => !color.valid || color.ratio < minimumContrastRatio);
  const isDirty = useMemo(() => {
    const fieldsChanged = ['siteName', 'tagline', 'supportEmail', 'footerText', 'primaryColor', 'secondaryColor', 'accentColor'].some((key) => form[key] !== savedForm[key]);
    return fieldsChanged || clearLogo || Boolean(logoBase64) || clearFavicon || Boolean(faviconBase64);
  }, [clearFavicon, clearLogo, faviconBase64, form, logoBase64, savedForm]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    async function loadSettings() {
      try {
        const response = await fetch('/api/site-settings', { cache: 'no-store' });
        const data = await readApiResponse(response, 'Unable to load site settings.');
        if (cancelled) return;
        const settings = normalizeSettings(data.settings);
        setForm(settings);
        setSavedForm(settings);
        onSettingsChange?.(settings);
        setLoadError('');
      } catch (error) {
        if (!cancelled) setLoadError(error.message || 'Unable to load site settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSettings();
    return () => { cancelled = true; mountedRef.current = false; };
  }, [onSettingsChange]);

  useEffect(() => {
    if (!permission?.view) {
      setHistoryLoading(false);
      return undefined;
    }
    let cancelled = false;
    fetch('/api/site-settings/history', { cache: 'no-store' })
      .then((response) => readApiResponse(response, 'Unable to load settings history.'))
      .then((data) => { if (!cancelled) setHistory(Array.isArray(data.history) ? data.history : []); })
      .catch(() => { if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [permission?.view]);

  useEffect(() => {
    if (!isDirty) return undefined;
    function warnBeforeLeave(event) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [isDirty]);

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveError('');
    setSaveSuccess('');
  }

  function applyPreset(preset) {
    setForm((current) => ({ ...current, ...preset }));
    setSaveError('');
    setSaveSuccess('');
  }

  function resetToDefault() {
    if (!window.confirm('Reset the editable site settings to the PayTimePro defaults? You can review the changes before saving.')) return;
    setForm(normalizeSettings(defaultSiteSettings));
    setClearLogo(Boolean(savedForm.hasLogo || logoBase64));
    setLogoPreview('');
    setLogoBase64('');
    setLogoMimeType('');
    setClearFavicon(Boolean(savedForm.hasFavicon || faviconBase64));
    setFaviconPreview('');
    setFaviconBase64('');
    setFaviconMimeType('');
    setSaveError('');
    setSaveSuccess('');
  }

  function removeLogo() {
    setClearLogo(true);
    setLogoPreview('');
    setLogoBase64('');
    setLogoMimeType('');
    setSaveError('');
    setSaveSuccess('');
  }

  function removeFavicon() {
    setClearFavicon(true);
    setFaviconPreview('');
    setFaviconBase64('');
    setFaviconMimeType('');
    setSaveError('');
    setSaveSuccess('');
  }

  function handleAssetChange(event, asset) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!asset.types.includes(file.type)) {
      setSaveError(`${asset.label} must be a ${asset.typeLabel} image.`);
      return;
    }
    if (file.size > asset.maximumBytes) {
      setSaveError(`${asset.label} must be no larger than ${asset.sizeLabel}.`);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setSaveError(`Unable to read the selected ${asset.label.toLowerCase()}.`);
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const separator = reader.result.indexOf(',');
      const encoded = separator >= 0 ? reader.result.slice(separator + 1) : '';
      if (!encoded) {
        setSaveError(`Unable to read the selected ${asset.label.toLowerCase()}.`);
        return;
      }
      asset.setBase64(encoded);
      asset.setMimeType(file.type);
      asset.setPreview(reader.result);
      asset.setClear(false);
      setSaveError('');
      setSaveSuccess('');
    };
    reader.readAsDataURL(file);
  }

  async function reloadHistory() {
    try {
      const response = await fetch('/api/site-settings/history', { cache: 'no-store' });
      const data = await readApiResponse(response, 'Unable to load settings history.');
      if (mountedRef.current) setHistory(Array.isArray(data.history) ? data.history : []);
    } catch {
      // History is informative; a save should remain successful if this optional refresh fails.
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (saving || !permission?.update) return;
    if (hasInvalidColor) {
      setSaveError('Please choose valid colors with at least 4.5:1 contrast against white or the site navy.');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');

    const payload = {
      siteName: form.siteName,
      tagline: form.tagline,
      supportEmail: form.supportEmail,
      footerText: form.footerText,
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
      accentColor: form.accentColor
    };
    if (clearLogo) payload.clearLogo = true;
    if (logoBase64) {
      payload.logoBase64 = logoBase64;
      payload.logoMimeType = logoMimeType;
    }
    if (clearFavicon) payload.clearFavicon = true;
    if (faviconBase64) {
      payload.faviconBase64 = faviconBase64;
      payload.faviconMimeType = faviconMimeType;
    }

    try {
      const response = await fetch('/api/site-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponse(response, 'Unable to save site settings.');
      const settings = normalizeSettings(data.settings);
      setForm(settings);
      setSavedForm(settings);
      setLogoPreview('');
      setLogoBase64('');
      setLogoMimeType('');
      setClearLogo(false);
      setFaviconPreview('');
      setFaviconBase64('');
      setFaviconMimeType('');
      setClearFavicon(false);
      onSettingsChange?.(settings);
      setSaveSuccess('Site settings saved and applied across the website.');
      onNotify?.('notification', 'Site settings saved.', 'Saved');
      await reloadHistory();
    } catch (error) {
      if (mountedRef.current) setSaveError(error.message || 'Unable to save site settings.');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  const logoSource = logoPreview || (!clearLogo ? form.logoUrl : '');
  const faviconSource = faviconPreview || (!clearFavicon ? form.faviconUrl : '');
  const hasLogo = Boolean(logoSource);
  const hasFavicon = Boolean(faviconSource);
  const assetLogo = {
    label: 'Logo', typeLabel: 'PNG, JPEG, or WebP', sizeLabel: '2 MB', types: supportedLogoTypes, maximumBytes: maximumLogoBytes,
    setBase64: setLogoBase64, setMimeType: setLogoMimeType, setPreview: setLogoPreview, setClear: setClearLogo
  };
  const assetFavicon = {
    label: 'Favicon', typeLabel: 'PNG or ICO', sizeLabel: '512 KB', types: supportedFaviconTypes, maximumBytes: maximumFaviconBytes,
    setBase64: setFaviconBase64, setMimeType: setFaviconMimeType, setPreview: setFaviconPreview, setClear: setClearFavicon
  };

  return <section className="site-settings-view">
    <div className="module-title site-settings-title"><div><span>Setup</span><h1>Site Settings</h1><p>Shape the identity and color language used across your payroll workspace.</p></div>{permission?.update && <span className="site-settings-status">Admin controls</span>}</div>
    {loading && <div className="site-settings-loading" role="status"><strong>Loading site settings…</strong><span>Retrieving the current site identity and theme.</span></div>}
    {!loading && loadError && <div className="site-settings-error" role="alert"><strong>Unable to load site settings</strong><span>{loadError}</span></div>}
    {!loading && !loadError && <>
      <div className="site-settings-tools"><div><span>Quick start</span><strong>Start with a color direction</strong><small>Presets only change the draft. Your live site changes after you save.</small></div><div className="site-preset-row">{colorPresets.map((preset) => <button className="site-preset-button" type="button" key={preset.name} onClick={() => applyPreset(preset)} disabled={!permission?.update || saving}><i><b style={{ background: preset.primaryColor }} /><b style={{ background: preset.secondaryColor }} /><b style={{ background: preset.accentColor }} /></i>{preset.name}</button>)}<button className="site-reset-button" type="button" onClick={resetToDefault} disabled={!permission?.update || saving}>Reset to default</button></div></div>
      {saveError && <p className="site-settings-feedback error" role="alert">{saveError}</p>}
      {saveSuccess && <p className="site-settings-feedback success" role="status">{saveSuccess}</p>}
      <div className="site-settings-layout">
        <form className="site-settings-form" onSubmit={saveSettings}>
          <section className="site-settings-card" aria-labelledby="site-information-title"><header><div><span>Brand identity</span><h2 id="site-information-title">Site Information</h2><p>These details identify your payroll site in navigation, sign-in, browser tabs, and shared workspace surfaces.</p></div>{!permission?.update && <small>View-only access</small>}</header>
            <div className="site-settings-fields"><label className="site-field-wide"><span>Site name <b>*</b></span><input value={form.siteName} onChange={(event) => updateForm('siteName', event.target.value)} maxLength="80" required disabled={!permission?.update || saving} placeholder="Your company payroll" /></label><label className="site-field-wide"><span>Tagline</span><input value={form.tagline} onChange={(event) => updateForm('tagline', event.target.value)} maxLength="160" disabled={!permission?.update || saving} placeholder="A short line that describes your site" /></label><label><span>Support email</span><input type="email" value={form.supportEmail} onChange={(event) => updateForm('supportEmail', event.target.value)} maxLength="254" disabled={!permission?.update || saving} placeholder="support@company.com" /></label><label><span>Footer text</span><input value={form.footerText} onChange={(event) => updateForm('footerText', event.target.value)} maxLength="120" disabled={!permission?.update || saving} placeholder="Secure workforce access" /></label></div>
            <div className="site-assets-grid"><div className="site-logo-field"><div className={'site-logo-preview' + (hasLogo ? ' has-logo' : '')}>{hasLogo ? <img src={logoSource} alt="Site logo preview" /> : <span aria-hidden="true">▣</span>}</div><div className="site-logo-copy"><strong>Company logo</strong><p>Shown beside the site name. PNG, JPEG, or WebP up to 2 MB.</p><div className="site-logo-actions"><label className={'site-upload-button' + (!permission?.update || saving ? ' is-disabled' : '')} htmlFor="site-settings-logo-upload">Choose logo</label><input id="site-settings-logo-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleAssetChange(event, assetLogo)} disabled={!permission?.update || saving} />{(logoPreview || (form.hasLogo && !clearLogo)) && permission?.update && <button type="button" onClick={removeLogo} disabled={saving}>Remove</button>}</div></div></div><div className="site-logo-field site-favicon-field"><div className={'site-logo-preview site-favicon-preview' + (hasFavicon ? ' has-logo' : '')}>{hasFavicon ? <img src={faviconSource} alt="Favicon preview" /> : <span aria-hidden="true">✦</span>}</div><div className="site-logo-copy"><strong>Browser icon</strong><p>Shown in browser tabs and bookmarks. PNG or ICO up to 512 KB.</p><div className="site-logo-actions"><label className={'site-upload-button' + (!permission?.update || saving ? ' is-disabled' : '')} htmlFor="site-settings-favicon-upload">Choose icon</label><input id="site-settings-favicon-upload" type="file" accept="image/png,image/x-icon,.ico" onChange={(event) => handleAssetChange(event, assetFavicon)} disabled={!permission?.update || saving} />{(faviconPreview || (form.hasFavicon && !clearFavicon)) && permission?.update && <button type="button" onClick={removeFavicon} disabled={saving}>Remove</button>}</div></div></div></div>
          </section>
          <section className="site-settings-card" aria-labelledby="color-preferences-title"><header><div><span>Visual system</span><h2 id="color-preferences-title">Color Preferences</h2><p>Colors are checked before saving so text and controls remain readable throughout the payroll website.</p></div></header><div className="site-color-fields">{colorHealth.map((color) => <label className="site-color-field" key={color.key}><span className="site-color-label"><i style={{ background: color.valid ? color.value : '#d9e0e3' }} aria-hidden="true" /><b>{color.label}</b></span><small>{colorFields.find(([key]) => key === color.key)?.[2]}</small><div><input type="color" value={color.valid ? color.value : '#17314D'} onChange={(event) => updateForm(color.key, event.target.value.toUpperCase())} disabled={!permission?.update || saving} aria-label={`${color.label} picker`} /><input className="site-color-hex" value={color.value} onChange={(event) => updateForm(color.key, event.target.value.toUpperCase())} pattern="#[0-9A-Fa-f]{6}" maxLength="7" aria-label={`${color.label} hex value`} disabled={!permission?.update || saving} /></div><span className={`site-color-health ${color.valid && color.ratio >= minimumContrastRatio ? 'pass' : 'warn'}`}>{color.valid ? `${color.ratio.toFixed(1)}:1 contrast · ${color.foreground === '#FFFFFF' ? 'white' : 'navy'} text` : 'Enter a 6-digit hex color'}</span></label>)}</div><div className="site-contrast-note"><span aria-hidden="true">✓</span><p>Good contrast keeps navigation, action buttons, links, and status labels usable for more people.</p></div></section>
          <div className="site-settings-save"><div>{isDirty ? <span className="site-settings-dirty"><i />Unsaved changes</span> : <span className="site-settings-clean"><i />All changes saved</span>}<small>{permission?.update ? 'Save to apply this identity and theme to every payroll user.' : 'Your role can view site settings but cannot make changes.'}</small></div>{permission?.update && <button className="primary-action" type="submit" disabled={saving || hasInvalidColor}>{saving ? 'Saving changes…' : 'Save Site Settings'}</button>}</div>
        </form>
        <Preview form={form} logoSource={logoSource} />
      </div>
      <section className="site-settings-history-card" aria-labelledby="site-settings-history-title"><header><div><span>Change control</span><h2 id="site-settings-history-title">Recent branding changes</h2><p>Each save is recorded so administrators can see what changed and when.</p></div><small>Last 10 saves</small></header>{historyLoading ? <p className="site-history-empty">Loading history…</p> : history.length === 0 ? <p className="site-history-empty">No branding changes have been saved yet.</p> : <div className="site-settings-history-list">{history.map((item) => <article className="site-history-item" key={item.id}><div><strong>{item.siteName}</strong><span>{item.changedBy} · {formatHistoryDate(item.changedAt)}</span></div><p>{item.tagline || 'No tagline'}</p><div className="site-history-meta"><span><i style={{ background: item.primaryColor }} />Primary</span><span><i style={{ background: item.secondaryColor }} />Secondary</span><span><i style={{ background: item.accentColor }} />Accent</span>{item.hasLogo && <b>Logo</b>}{item.hasFavicon && <b>Icon</b>}</div></article>)}</div>}</section>
    </>}
  </section>;
}
