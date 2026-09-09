import { createContext, useContext, useEffect, useRef, useState } from 'react';
import './tax.css';
import './payroll-tax.css';
import './payroll-workspace.css';
import './payroll-runs.css';
import './disbursement.css';
import './exemption-report.css';
import './payout.css';
import './calendar.css';
import './calendar-interactions.css';
import './company-profile.css';
import './site-settings.css';
import { CalendarModule, UpcomingCalendarCard } from './CalendarModule.jsx';
import { CompanyProfile } from './CompanyProfile.jsx';
import BrandName from './BrandName.jsx';
import { SiteSettings, defaultSiteSettings } from './SiteSettings.jsx';
import { applySiteTheme } from './theme.js';

const DeviceUsersModuleContext = createContext(false);
const administratorHiddenModuleKeys = new Set(['leave_application', 'overtime_request', 'shift_change']);
const leaveBalanceFields = [
  ['vacationLeave', 'Vacation'],
  ['sickLeave', 'Sick'],
  ['emergencyLeave', 'Emergency']
];
const leaveTypeLabels = { vacation:'Vacation Leave', sick:'Sick Leave', emergency:'Emergency Leave' };

const parentModuleByChild = {
  company:'setup', site_settings:'setup', organization:'setup', tax_configuration:'payroll',
  workforce:'workforce_module', leave_management:'setup', roles:'setup',
  shift_management:'setup', time_entries:'time_tracking', exemption_report:'time_tracking', requests:'time_tracking', leave_application:'time_tracking', overtime_request:'time_tracking', shift_change:'time_tracking',
  scheduler:'utilities', device_users:'utilities', payroll_setup:'payroll', payroll_tax:'payroll', payroll_runs:'payroll', payout_view:'payroll', disbursement:'payroll'
};

function effectiveModulePermission(user, moduleKey) {
  const permission = user.permissions.find((item) => item.moduleKey === moduleKey);
  if (user.role === 'Administrator' && ['setup', 'company', 'site_settings', 'organization', 'tax_configuration'].includes(moduleKey) && !permission) {
    return { moduleKey, moduleName:moduleKey === 'setup' ? 'Setup' : moduleKey === 'company' ? 'Company' : moduleKey === 'site_settings' ? 'Site Settings' : moduleKey === 'organization' ? 'Organization' : 'Tax', create:true, view:true, update:true, delete:true };
  }
  if (user.role === 'Administrator' && administratorHiddenModuleKeys.has(moduleKey)) {
    return { ...permission, create:false, view:false, update:false, delete:false };
  }
  const parentKey = parentModuleByChild[moduleKey];
  if (!parentKey) return permission;
  const parent = user.permissions.find((item) => item.moduleKey === parentKey);
  return { ...permission, create:Boolean(permission?.create&&parent?.create), view:Boolean(permission?.view&&parent?.view), update:Boolean(permission?.update&&parent?.update), delete:Boolean(permission?.delete&&parent?.delete) };
}

function showModal(type, message, title) {
  window.dispatchEvent(new CustomEvent('paytimepro:modal', { detail: { type, message, title } }));
}

function confirmModal(message, title = 'Please confirm') {
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent('paytimepro:modal', { detail: { type: 'confirm', message, title, resolve } })));
}

function useModalMessage(kind = 'auto') {
  const [message, setStoredMessage] = useState('');
  function setMessage(nextMessage) {
    setStoredMessage(nextMessage);
    if (!nextMessage || nextMessage === 'Saving…') return;
    const isError = /(?:unable|failed|error|must|required|not found|wait for|exceeds|invalid|cannot|select at least)/i.test(nextMessage);
    const type = kind === 'error' || isError ? 'alert' : 'notification';
    showModal(type, nextMessage, type === 'notification' ? 'Success' : 'Attention');
  }
  return [message, setMessage];
}

function NotificationModal() {
  const [modal, setModal] = useState(null);
  useEffect(() => {
    const openModal = (event) => setModal(event.detail);
    window.addEventListener('paytimepro:modal', openModal);
    return () => window.removeEventListener('paytimepro:modal', openModal);
  }, []);
  if (!modal) return null;
  function close(result = false) { modal.resolve?.(result); setModal(null); }
  return <div className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-modal-title"><button className="notification-modal-scrim" type="button" onClick={() => close(false)} aria-label="Close notification" /><div className={`notification-modal-card ${modal.type}`}><i aria-hidden="true">{modal.type==='notification'?'✓':modal.type==='confirm'?'?':'!'}</i><div><span>{modal.type==='notification'?'Notification':modal.type==='confirm'?'Confirmation':'Alert'}</span><h2 id="notification-modal-title">{modal.title}</h2><p>{modal.message}</p></div><div className="notification-modal-actions">{modal.type==='confirm'&&<button type="button" onClick={()=>close(false)}>Cancel</button>}<button className="primary-action" type="button" autoFocus onClick={()=>close(true)}>{modal.type==='confirm'?'Confirm':'OK'}</button></div></div></div>;
}

function Logo({ branding = defaultSiteSettings }) {
  const siteName = branding?.siteName || defaultSiteSettings.siteName;
  const textLogo = siteName === 'PayTimePro' ? <><span>PayTime</span><strong>Pro</strong></> : <BrandName siteName={siteName} />;
  return <a className="wordmark" href="/" aria-label={`${siteName} home`}>{branding?.logoUrl ? <img className="wordmark-logo" src={branding.logoUrl} alt="" /> : textLogo}</a>;
}

const themeModeLabels = { light:'Light', dark:'Dark' };
const themeModeIcons = { light:'☼', dark:'☾' };

function ThemeToggle({ mode = 'light', onChange }) {
  const currentMode = mode === 'dark' ? 'dark' : 'light';
  const nextMode = currentMode === 'dark' ? 'light' : 'dark';
  const currentLabel = themeModeLabels[currentMode];
  const nextLabel = themeModeLabels[nextMode];
  return <button className="theme-toggle" type="button" onClick={() => onChange?.(nextMode)} aria-label={`${currentLabel} mode. Switch to ${nextLabel} mode`} title={`${currentLabel} mode · click for ${nextLabel}`}><span aria-hidden="true">{themeModeIcons[currentMode]}</span><b>{currentLabel}</b></button>;
}

export default function App() {
  const [siteSettings, setSiteSettings] = useState(defaultSiteSettings);
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const stored = window.localStorage.getItem('paytimepro.theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const resolvedTheme = themeMode;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    try { window.localStorage.setItem('paytimepro.theme', themeMode); } catch {}
  }, [resolvedTheme, themeMode]);

  useEffect(() => {
    fetch('/api/site-settings/public', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.settings && setSiteSettings((current) => ({ ...current, ...data.settings })))
      .catch(() => {});
  }, []);

  useEffect(() => applySiteTheme(siteSettings, defaultSiteSettings), [siteSettings, resolvedTheme]);

  useEffect(() => {
    document.title = siteSettings.siteName || defaultSiteSettings.siteName;
  }, [siteSettings.siteName]);

  useEffect(() => {
    const existing = document.querySelector('link[data-site-favicon]');
    if (!siteSettings.faviconUrl) {
      existing?.remove();
      return undefined;
    }
    const favicon = existing || document.createElement('link');
    favicon.rel = 'icon';
    favicon.dataset.siteFavicon = 'true';
    favicon.href = siteSettings.faviconUrl;
    if (!existing) document.head.appendChild(favicon);
    return undefined;
  }, [siteSettings.faviconUrl]);

  const page = window.location.pathname === '/dashboard'
    ? <Dashboard siteSettings={siteSettings} onSiteSettingsChange={setSiteSettings} themeMode={themeMode} onThemeModeChange={setThemeMode} />
    : window.location.pathname === '/logout' ? <LogoutConfirmation branding={siteSettings} themeMode={themeMode} onThemeModeChange={setThemeMode} /> : <Login branding={siteSettings} themeMode={themeMode} onThemeModeChange={setThemeMode} />;
  return <>{page}<NotificationModal /></>;
}

function Login({ branding = defaultSiteSettings, themeMode, onThemeModeChange }) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useModalMessage('error');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then((response) => {
      if (response.ok) window.location.replace('/dashboard');
    }).catch(() => {});
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          remember: form.get('remember') === 'on'
        })
      });
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : {};
      if (!response.ok) throw new Error(data.error || 'Unable to sign in.');
      window.location.assign('/dashboard');
    } catch (loginError) {
      setError(loginError.message === 'Failed to fetch' ? 'Unable to reach the server.' : loginError.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <header className="site-header"><div className="site-header-inner"><Logo branding={branding} /><ThemeToggle mode={themeMode} onChange={onThemeModeChange} /></div></header>
      <main className="login-main">
        <section className="login-panel" aria-labelledby="login-title">
          <div className="panel-copy"><span className="eyebrow">Welcome back</span><h1 id="login-title">Sign in to your account</h1><p>Enter your details to access your team, timesheets, and payroll.</p></div>
          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
            <div className="password-row"><label htmlFor="password">Password</label><a href="#forgot">Forgot password?</a></div>
            <div className="password-field">
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>
            <label className="remember"><input type="checkbox" name="remember" /><span>Keep me signed in</span></label>
            <button className="submit-button" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'} <span>→</span></button>
          </form>
          <p className="support">Need access? <a href={`mailto:${branding.supportEmail || 'hello@paytimepro.com'}`}>Contact your administrator</a></p>
        </section>
      </main>
      <footer><span>© 2026 {branding.siteName}</span><span>{branding.footerText}</span></footer>
    </div>
  );
}

function Dashboard({ siteSettings = defaultSiteSettings, onSiteSettingsChange, themeMode, onThemeModeChange }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState('overview');
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('paytimepro.sidebarCollapsed') === 'true'; } catch { return false; }
  });
  const [setupOpen, setSetupOpen] = useState(true);
  const [workforceOpen, setWorkforceOpen] = useState(true);
  const [maintenanceOpen, setMaintenanceOpen] = useState(true);
  const [utilitiesOpen, setUtilitiesOpen] = useState(true);
  const [timeTrackingOpen, setTimeTrackingOpen] = useState(true);
  const [payrollOpen, setPayrollOpen] = useState(true);
  const mobileNavigationToggleRef = useRef(null);
  const mobileNavigationCloseRef = useRef(null);
  const dashboardMainRef = useRef(null);

  function isMobileNavigationViewport() {
    return window.matchMedia?.('(max-width: 720px)').matches;
  }

  function closeMobileNavigation({ restoreToggleFocus = false, focusMain = false } = {}) {
    setMobileNavigationOpen(false);
    if (!isMobileNavigationViewport()) return;
    window.requestAnimationFrame(() => {
      if (focusMain) dashboardMainRef.current?.focus();
      else if (restoreToggleFocus) mobileNavigationToggleRef.current?.focus();
    });
  }

  function openMobileNavigation() {
    if (!isMobileNavigationViewport()) return;
    setMobileNavigationOpen(true);
    window.requestAnimationFrame(() => mobileNavigationCloseRef.current?.focus());
  }

  useEffect(() => {
    fetch('/api/site-settings', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.settings && onSiteSettingsChange?.(data.settings))
      .catch(() => {});
  }, [onSiteSettingsChange]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) throw new Error('unauthorized');
        return response.json();
      })
      .then((data) => {
        setUser(data.user);
        const visibleModules = data.user.permissions.filter((permission) => permission.view && !(data.user.role === 'Administrator' && administratorHiddenModuleKeys.has(permission.moduleKey))).map((permission) => permission.moduleKey);
        if (visibleModules.includes('payroll_setup')) visibleModules.push('payroll_tax');
        if (visibleModules.includes('payroll_setup') && visibleModules.includes('payout_view')) visibleModules.push('payroll_runs');
        if (data.user.role === 'Administrator') visibleModules.push('setup', 'company', 'site_settings', 'organization');
        const parentByChild = { company:'setup', site_settings:'setup', organization:'setup', shift_management:'setup', leave_management:'setup', roles:'setup', tax_configuration:'payroll', workforce:'workforce_module', time_entries:'time_tracking', exemption_report:'time_tracking', requests:'time_tracking', leave_application:'time_tracking', overtime_request:'time_tracking', shift_change:'time_tracking', scheduler:'utilities', device_users:'utilities', payroll_setup:'payroll', payroll_tax:'payroll', payroll_runs:'payroll', payout_view:'payroll', disbursement:'payroll' };
        const setupVisible = visibleModules.includes('setup') && ['company', 'site_settings', 'organization', 'shift_management', 'leave_management', 'roles'].some((moduleKey) => visibleModules.includes(moduleKey));
        const workforceVisible = visibleModules.includes('workforce_module') && visibleModules.includes('workforce');
        const maintenanceVisible = visibleModules.includes('maintenance') && ['leave_management', 'roles'].some((moduleKey) => visibleModules.includes(moduleKey));
        const utilitiesVisible = visibleModules.includes('utilities') && ['scheduler', 'device_users'].some((moduleKey) => visibleModules.includes(moduleKey));
        let savedModule = '';
        try { savedModule = window.localStorage.getItem('paytimepro.activeModule') || ''; } catch {}
        const savedParent = parentByChild[savedModule];
        const savedModuleAllowed = (visibleModules.includes(savedModule) && (!savedParent || visibleModules.includes(savedParent)))
          || (savedModule === 'maintenance' && maintenanceVisible)
          || (savedModule === 'workforce_module' && workforceVisible)
          || (savedModule === 'setup' && setupVisible)
          || (savedModule === 'utilities' && utilitiesVisible);
        const fallbackModule = visibleModules.includes('overview') ? 'overview' : visibleModules[0] || 'overview';
        setActiveModule(savedModuleAllowed ? savedModule : fallbackModule);
        setLoading(false);
      })
      .catch(() => window.location.replace('/'));
  }, []);

  useEffect(() => {
    if (!user) return;
    try { window.localStorage.setItem('paytimepro.activeModule', activeModule); } catch {}
  }, [activeModule, user]);

  useEffect(() => {
    try { window.localStorage.setItem('paytimepro.sidebarCollapsed', String(desktopSidebarCollapsed)); } catch {}
  }, [desktopSidebarCollapsed]);

  useEffect(() => {
    if (!mobileNavigationOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileNavigation({ restoreToggleFocus: true });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileNavigationOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 720px)');
    const closeOnDesktop = (event) => {
      if (!event.matches) setMobileNavigationOpen(false);
    };
    mediaQuery.addEventListener('change', closeOnDesktop);
    return () => mediaQuery.removeEventListener('change', closeOnDesktop);
  }, []);

  if (loading) return <div className="session-loading">Loading your session…</div>;
  const initials = user.displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const canView = (moduleKey) => Boolean(effectiveModulePermission(user,moduleKey)?.view);
  const workforceItems = [
    ['workforce', '♙', 'Employees']
  ].filter(([moduleKey]) => canView(moduleKey));
  const setupItems = [
    ['company', '\u25A3', 'Company'],
    ['site_settings', '✦', 'Site Settings'],
    ['organization', '\u25C8', 'Organization'],
    ['shift_management', '\u25E7', 'Shift Management'],
    ['leave_management', '▦', 'Leave Management'],
    ['roles', '▦', 'Roles & Access']
  ].filter(([moduleKey]) => canView(moduleKey));
  const utilityItems = [
    ['scheduler', '▦', 'Sync Agent']
  ].filter(([moduleKey]) => canView(moduleKey));
  const navItems = [
    ['overview', '⌂', 'Overview'],
    ['calendar', '▣', 'Calendar'],
    ['reports', '▤', 'Reports']
  ].filter(([moduleKey]) => canView(moduleKey));

  return (
    <div className={`dashboard-shell${desktopSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className={`sidebar${mobileNavigationOpen ? ' sidebar-open' : ''}`} id="dashboard-sidebar">
        <button className="mobile-sidebar-close" type="button" ref={mobileNavigationCloseRef} onClick={() => closeMobileNavigation({ restoreToggleFocus: true })} aria-label="Close navigation"><span aria-hidden="true">×</span></button>
        <div className="sidebar-brand">
          <Logo branding={siteSettings} />
          <button className="desktop-sidebar-toggle" type="button" onClick={() => setDesktopSidebarCollapsed((current) => !current)} aria-expanded={!desktopSidebarCollapsed} aria-controls="dashboard-sidebar" aria-label={desktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={desktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}><span aria-hidden="true">{desktopSidebarCollapsed ? '›' : '‹'}</span></button>
        </div>
        <nav aria-label="Dashboard navigation" onClick={(event) => {
          if (event.target.closest('button')) closeMobileNavigation({ focusMain: true });
        }}>
          {navItems.slice(0, 1).map(([moduleKey, icon, label]) => <button className={activeModule === moduleKey ? 'active' : ''} type="button" key={moduleKey} onClick={() => setActiveModule(moduleKey)}><span>{icon}</span>{label}</button>)}
          {canView('workforce_module') && workforceItems.length > 0 && <div className="sidebar-nav-group">
            <button className={activeModule === 'workforce_module' || workforceItems.some(([moduleKey]) => moduleKey === activeModule) ? 'active group-active' : ''} type="button" onClick={() => { setWorkforceOpen((current) => !current); setActiveModule('workforce_module'); }} aria-expanded={workforceOpen}><span>♙</span>Workforce<b>{workforceOpen ? '⌃' : '⌄'}</b></button>
            {workforceOpen && <div className="sidebar-subnav">{workforceItems.map(([moduleKey, icon, label]) => <button className={activeModule === moduleKey ? 'active' : ''} type="button" key={moduleKey} onClick={() => setActiveModule(moduleKey)}><span>{icon}</span>{label}</button>)}</div>}
          </div>}
          {canView('utilities') && (utilityItems.length > 0 || canView('device_users')) && <div className="sidebar-nav-group">
            <button className={activeModule === 'utilities' || activeModule === 'device_users' || utilityItems.some(([moduleKey]) => moduleKey === activeModule) ? 'active group-active' : ''} type="button" onClick={() => { setUtilitiesOpen((current) => !current); setActiveModule('utilities'); }} aria-expanded={utilitiesOpen}><span>⌘</span>Utilities<b>{utilitiesOpen ? '⌃' : '⌄'}</b></button>
            {utilitiesOpen && <div className="sidebar-subnav">{utilityItems.map(([moduleKey, icon, label]) => <button className={activeModule === moduleKey ? 'active' : ''} type="button" key={moduleKey} onClick={() => setActiveModule(moduleKey)}><span>{icon}</span>{label}</button>)}{canView('device_users')&&<button className={activeModule === 'device_users' ? 'active' : ''} type="button" onClick={() => setActiveModule('device_users')}><span>•</span>Device Users</button>}</div>}
          </div>}
          {canView('time_tracking') && ['time_entries','exemption_report','requests','leave_application','overtime_request','shift_change'].some(canView) && <div className="sidebar-nav-group">
            <button className={['time_tracking', 'time_entries', 'exemption_report', 'requests', 'leave_application', 'overtime_request', 'shift_change'].includes(activeModule) ? 'active group-active' : ''} type="button" onClick={() => { setTimeTrackingOpen((current) => !current); setActiveModule('time_tracking'); }} aria-expanded={timeTrackingOpen}><span>◷</span>Timetracking<b>{timeTrackingOpen ? '⌃' : '⌄'}</b></button>
            {timeTrackingOpen && <div className="sidebar-subnav">{canView('time_entries')&&<button className={activeModule === 'time_entries' ? 'active' : ''} type="button" onClick={() => setActiveModule('time_entries')}><span>•</span>Time Entries</button>}{canView('exemption_report')&&<button className={activeModule === 'exemption_report' ? 'active' : ''} type="button" onClick={() => setActiveModule('exemption_report')}><span>•</span>Exemption Report</button>}{canView('requests')&&<button className={activeModule === 'requests' ? 'active' : ''} type="button" onClick={() => setActiveModule('requests')}><span>•</span>Requests</button>}{canView('leave_application')&&<button className={activeModule === 'leave_application' ? 'active' : ''} type="button" onClick={() => setActiveModule('leave_application')}><span>•</span>Leave Application</button>}{canView('overtime_request')&&<button className={activeModule === 'overtime_request' ? 'active' : ''} type="button" onClick={() => setActiveModule('overtime_request')}><span>•</span>Overtime Request</button>}{canView('shift_change')&&<button className={activeModule === 'shift_change' ? 'active' : ''} type="button" onClick={() => setActiveModule('shift_change')}><span>•</span>Shift Change</button>}</div>}
          </div>}
          {canView('payroll') && (canView('payroll_setup')||canView('tax_configuration')||canView('payout_view')||canView('disbursement')) && <div className="sidebar-nav-group">
            <button className={['payroll','payroll_setup','payroll_tax','payroll_runs','tax_configuration','payout_view','disbursement'].includes(activeModule) ? 'active group-active' : ''} type="button" onClick={() => { setPayrollOpen((current) => !current); setActiveModule('payroll'); }} aria-expanded={payrollOpen}><span>$</span>Payroll<b>{payrollOpen ? '⌃' : '⌄'}</b></button>
            {payrollOpen&&<div className="sidebar-subnav">{canView('payroll_setup')&&<button className={activeModule==='payroll_setup'?'active':''} type="button" onClick={()=>setActiveModule('payroll_setup')}><span>•</span>Salary Setup</button>}{canView('tax_configuration')&&<button className={activeModule==='tax_configuration'?'active':''} type="button" onClick={()=>setActiveModule('tax_configuration')}><span>•</span>Tax Configuration</button>}{canView('payroll_setup')&&<button className={activeModule==='payroll_tax'?'active':''} type="button" onClick={()=>setActiveModule('payroll_tax')}><span>•</span>Tax Calculator</button>}{canView('payroll_setup')&&canView('payout_view')&&<button className={activeModule==='payroll_runs'?'active':''} type="button" onClick={()=>setActiveModule('payroll_runs')}><span>•</span>Payroll Runs</button>}{canView('payout_view')&&<button className={activeModule==='payout_view'?'active':''} type="button" onClick={()=>setActiveModule('payout_view')}><span>•</span>Payout View</button>}{canView('disbursement')&&<button className={activeModule==='disbursement'?'active':''} type="button" onClick={()=>setActiveModule('disbursement')}><span>•</span>Disbursement</button>}</div>}
          </div>}
          {navItems.slice(1).map(([moduleKey, icon, label]) => <button className={activeModule === moduleKey ? 'active' : ''} type="button" key={moduleKey} onClick={() => setActiveModule(moduleKey)}><span>{icon}</span>{label}</button>)}
          {canView('setup') && setupItems.length > 0 && <div className="sidebar-nav-group">
            <button className={activeModule === 'setup' || setupItems.some(([moduleKey]) => moduleKey === activeModule) ? 'active group-active' : ''} type="button" onClick={() => { setSetupOpen((current) => !current); setActiveModule('setup'); }} aria-expanded={setupOpen}><span>{'\u2699'}</span>Setup<b>{setupOpen ? '\u2303' : '\u2304'}</b></button>
            {setupOpen && <div className="sidebar-subnav">{setupItems.map(([moduleKey, icon, label]) => <button className={activeModule === moduleKey ? 'active' : ''} type="button" key={moduleKey} onClick={() => setActiveModule(moduleKey)}><span>{icon}</span>{label}</button>)}</div>}
          </div>}
        </nav>
      </aside>
      {mobileNavigationOpen && <button className="sidebar-scrim" type="button" onClick={() => closeMobileNavigation({ restoreToggleFocus: true })} aria-label="Close navigation" />}
      <div className="dashboard-content">
        <header className="dashboard-topbar" aria-label="Dashboard header">
          <div className="header-user">
            <button className="mobile-nav-toggle" type="button" ref={mobileNavigationToggleRef} onClick={openMobileNavigation} aria-expanded={mobileNavigationOpen} aria-controls="dashboard-sidebar" aria-label="Open navigation"><span aria-hidden="true">☰</span></button>
            <i>{initials}</i>
            <span><strong>{user.displayName}</strong><small>{user.role}</small></span>
            <div className="header-actions"><ThemeToggle mode={themeMode} onChange={onThemeModeChange} /><button className="header-signout" type="button" onClick={() => window.location.assign('/logout')} aria-label="Sign out"><span>Sign out</span><b aria-hidden="true">↪</b></button></div>
          </div>
        </header>
        <main className="dashboard-main" id={activeModule} ref={dashboardMainRef} tabIndex={-1} aria-label={`${activeModule} module`}>
          {activeModule === 'overview' && <Overview user={user} onNavigate={setActiveModule} />}
          {activeModule === 'calendar' && <CalendarModule user={user} permission={effectiveModulePermission(user,'calendar')} onConfirm={confirmModal} />}
          {activeModule === 'workforce_module' && <WorkforceModule user={user} onNavigate={setActiveModule} />}
          {activeModule === 'setup' && <Setup user={user} onNavigate={setActiveModule} />}
          {activeModule === 'company' && <CompanyProfile permission={effectiveModulePermission(user,'company')} onNavigate={setActiveModule} onNotify={showModal} canViewOrganization={Boolean(effectiveModulePermission(user,'organization')?.view)} />}
          {activeModule === 'site_settings' && <SiteSettings permission={effectiveModulePermission(user,'site_settings')} branding={siteSettings} onSettingsChange={onSiteSettingsChange} onNotify={showModal} />}
          {activeModule === 'organization' && <Organization user={user} />}
          {activeModule === 'maintenance' && <Maintenance user={user} onNavigate={setActiveModule} />}
          {activeModule === 'utilities' && <Utilities user={user} onNavigate={setActiveModule} />}
          {activeModule === 'roles' && <RoleAccess user={user} />}
          {activeModule === 'workforce' && <Workforce user={user} onNavigate={setActiveModule} />}
          {activeModule === 'leave_management' && <LeaveManagement user={user} />}
          {activeModule === 'time_tracking' && <Timetracking user={user} onNavigate={setActiveModule} />}
          {activeModule === 'time_entries' && <TimeEntries user={user} />}
          {activeModule === 'exemption_report' && <ExemptionReport />}
          {activeModule === 'shift_management' && <ShiftManagement user={user} />}
          {activeModule === 'requests' && <Requests user={user} />}
          {activeModule === 'leave_application' && <LeaveApplication user={user} />}
          {['overtime_request', 'shift_change'].includes(activeModule) && <ShiftCalendarModule moduleKey={activeModule} />}
          {activeModule === 'scheduler' && <Scheduler user={user} />}
          {activeModule === 'device_users' && <DeviceUsers user={user} />}
          {activeModule === 'payroll' && <Payroll user={user} onNavigate={setActiveModule} />}
          {activeModule === 'payroll_setup' && <PayrollSetup user={user} />}
          {activeModule === 'tax_configuration' && <TaxConfiguration user={user} />}
          {activeModule === 'payroll_tax' && <PayrollTaxCalculator user={user} />}
          {activeModule === 'payroll_runs' && <PayrollRuns user={user} onNavigate={setActiveModule} />}
          {activeModule === 'payout_view' && <PayoutView />}
          {activeModule === 'disbursement' && <Disbursement user={user} />}
          {activeModule === 'reports' && <ModulePlaceholder moduleKey={activeModule} />}
        </main>
      </div>
    </div>
  );
}

function Overview({ user, onNavigate }) {
  const childModuleKeys = ['maintenance','company','site_settings','organization','tax_configuration','workforce','leave_management','roles','time_entries','exemption_report','shift_management','requests','leave_application','overtime_request','shift_change','scheduler','device_users','payroll_setup','payroll_tax','payroll_runs','payout_view','disbursement','calendar'];
  const visibleModules = user.permissions.filter((permission) => permission.view && permission.moduleKey !== 'overview' && !childModuleKeys.includes(permission.moduleKey));
  const calendarVisible = Boolean(effectiveModulePermission(user,'calendar')?.view);
  return <section className="overview-view"><div className="module-title"><div><span>Workspace</span><h1>Welcome, {user.displayName.split(' ')[0]}</h1><p>Choose a module to continue.</p></div></div>{calendarVisible&&<UpcomingCalendarCard onNavigate={onNavigate}/>}<div className="module-grid">{visibleModules.map((permission) => <button type="button" key={permission.moduleKey} onClick={() => onNavigate(permission.moduleKey)}><strong>{permission.moduleName}</strong><span>Open module →</span></button>)}</div></section>;
}

function Setup({ user, onNavigate }) {
  const setupModules = ['company', 'site_settings', 'organization', 'shift_management', 'leave_management', 'roles'].map((moduleKey) => effectiveModulePermission(user,moduleKey)).filter((permission) => permission?.view);
  return <section className="overview-view"><div className="module-title"><div><span>Configuration</span><h1>Setup</h1><p>Manage company, organization, shifts, leave, and access settings.</p></div></div><div className="module-grid">{setupModules.map((permission) => <button type="button" key={permission.moduleKey} onClick={() => onNavigate(permission.moduleKey)}><strong>{permission.moduleName}</strong><span>Open submodule →</span></button>)}</div></section>;
}

const emptyTaxConfiguration={id:null,name:'',effectiveFrom:'',effectiveTo:'',payFrequency:'monthly',exemptionAmount:'0',isActive:true,brackets:[{lowerBound:'0',upperBound:'',baseTax:'0',ratePercent:'0'}]};
function TaxConfiguration({user}){
  const permission=effectiveModulePermission(user,'tax_configuration');const[items,setItems]=useState([]),[form,setForm]=useState(emptyTaxConfiguration),[income,setIncome]=useState(''),[preview,setPreview]=useState(null),[message,setMessage]=useState(''),[saving,setSaving]=useState(false);
  async function load(){try{const r=await fetch('/api/tax-configurations'),d=await r.json();if(!r.ok)throw new Error(d.error);setItems(d.configurations);}catch(e){setMessage(e.message);}}
  useEffect(()=>{load();},[]);
  function edit(item){setForm({...item,exemptionAmount:item.exemptionAmount??'0',effectiveFrom:item.effectiveFrom?.slice(0,10)||'',effectiveTo:item.effectiveTo?.slice(0,10)||'',brackets:item.brackets.map(b=>({...b,upperBound:b.upperBound??''}))});setPreview(null);}
  function bracket(index,key,value){setForm(current=>({...current,brackets:current.brackets.map((b,i)=>i===index?{...b,[key]:value}:b)}));}
  async function save(e){e.preventDefault();setSaving(true);setMessage('');try{const r=await fetch(`/api/tax-configurations${form.id?`/${form.id}`:''}`,{method:form.id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}),d=await r.json();if(!r.ok)throw new Error(d.error);setMessage(d.message);setForm(emptyTaxConfiguration);await load();}catch(error){setMessage(error.message);}finally{setSaving(false);}}
  async function calculate() {
    try {
      const response = await fetch('/api/tax-configurations/preview', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({
          regularCompensation:income,
          exemptionAmount:form.exemptionAmount,
          payFrequency:form.payFrequency,
          brackets:form.brackets
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to preview tax.');
      setPreview(data);
    } catch (error) {
      setPreview(null);
      setMessage(error.message);
    }
  }
  return <section className="tax-config-view"><div className="module-title"><div><span>Setup</span><h1>Tax Configuration</h1><p>Define effective-dated withholding brackets applied to taxable employee salary.</p></div><button type="button" onClick={()=>setForm(emptyTaxConfiguration)}>New configuration</button></div>{message&&<p className="rbac-message">{message}</p>}<div className="tax-config-layout"><aside>{items.map(item=><button type="button" className={form.id===item.id?'selected':''} key={item.id} onClick={()=>edit(item)}><strong>{item.name}</strong><small>{item.payFrequency.replace('_',' ')} · from {item.effectiveFrom?.slice(0,10)}</small><b>{item.isActive?'Active':'Inactive'}</b></button>)}{!items.length&&<p>No configurations yet.</p>}</aside><form onSubmit={save}><div className="tax-general"><label><span>Configuration name</span><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Monthly withholding for 2026"/></label><label><span>Pay frequency</span><select value={form.payFrequency} onChange={e=>setForm({...form,payFrequency:e.target.value})}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="semi_monthly">Semi-monthly</option><option value="monthly">Monthly</option></select></label><label><span>Effective from</span><input type="date" required value={form.effectiveFrom} onChange={e=>setForm({...form,effectiveFrom:e.target.value})}/></label><label><span>Effective to</span><input type="date" value={form.effectiveTo} onChange={e=>setForm({...form,effectiveTo:e.target.value})}/></label><label><span>Exemption per pay period (PHP)</span><input type="number" min="0" step=".01" value={form.exemptionAmount} onChange={e=>setForm({...form,exemptionAmount:e.target.value})}/></label><label className="tax-active"><input type="checkbox" checked={form.isActive} onChange={e=>setForm({...form,isActive:e.target.checked})}/>Active for payroll</label></div><fieldset><legend>Progressive brackets</legend><div className="tax-bracket tax-bracket-head"><span>From</span><span>Up to</span><span>Base tax</span><span>Rate on excess</span><span/></div>{form.brackets.map((b,i)=><div className="tax-bracket" key={i}><input type="number" min="0" step=".01" required value={b.lowerBound} onChange={e=>bracket(i,'lowerBound',e.target.value)}/><input type="number" min="0" step=".01" value={b.upperBound} placeholder="No limit" onChange={e=>bracket(i,'upperBound',e.target.value)}/><input type="number" min="0" step=".01" required value={b.baseTax} onChange={e=>bracket(i,'baseTax',e.target.value)}/><input type="number" min="0" max="100" step=".001" required value={b.ratePercent} onChange={e=>bracket(i,'ratePercent',e.target.value)}/><button type="button" onClick={()=>setForm({...form,brackets:form.brackets.filter((_,index)=>index!==i)})}>×</button></div>)}<button className="add-tax-bracket" type="button" onClick={()=>setForm({...form,brackets:[...form.brackets,{lowerBound:'',upperBound:'',baseTax:'0',ratePercent:'0'}]})}>+ Add bracket</button></fieldset><div className="tax-preview"><label><span>Test salary (PHP)</span><input type="number" min="0" value={income} onChange={e=>setIncome(e.target.value)}/></label><button type="button" onClick={calculate}>Preview tax</button>{preview&&<span>Taxable: <b>₱{Number(preview.taxableIncome).toLocaleString()}</b> · Withholding: <b>₱{Number(preview.tax).toLocaleString()}</b></span>}</div><button className="save-tax" disabled={saving||!(form.id?permission?.update:permission?.create)}>{saving?'Saving…':'Save tax configuration'}</button></form></div></section>;
}

const emptyOrganizationDepartment = { name:'', description:'' };

function Organization({ user }) {
  const [section, setSection] = useState('structure');
  const [departments, setDepartments] = useState([]);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState({ ...emptyOrganizationDepartment, parentId:'', unitType:'department' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [, setMessage] = useModalMessage();
  const permission = effectiveModulePermission(user, 'organization');

  async function loadDepartments() {
    setLoading(true);
    try {
      const response = await fetch('/api/organization/departments', { cache:'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load departments.');
      setDepartments(data.departments);
    } catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadDepartments(); }, []);

  function openCreate() {
    setForm({ ...emptyOrganizationDepartment, parentId:'', unitType:'department' });
    setEditor({ mode:'create' });
  }

  function openEdit(department) {
    setForm({ name:department.name, description:department.description || '', parentId:department.parentId?String(department.parentId):'', unitType:department.unitType||'department' });
    setEditor({ mode:'edit', department });
  }

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]:event.target.value }));
  }

  async function saveDepartment(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const editing = editor.mode === 'edit';
      const response = await fetch(editing ? `/api/organization/departments/${editor.department.id}` : '/api/organization/departments', {
        method:editing ? 'PUT' : 'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save department.');
      setEditor(null);
      await loadDepartments();
      setMessage(editing ? 'Department updated.' : 'Department added.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function deleteDepartment(department) {
    if (!await confirmModal(`Delete ${department.name}?`, 'Delete department?')) return;
    const response = await fetch(`/api/organization/departments/${department.id}`, { method:'DELETE' });
    if (!response.ok) {
      const data = await response.json();
      return setMessage(data.error || 'Unable to delete department.');
    }
    await loadDepartments();
    setMessage('Department deleted.');
  }

  const orderedDepartments = [...departments].sort((left,right)=>Number(Boolean(left.parentId))-Number(Boolean(right.parentId))||left.name.localeCompare(right.name));
  return <section className="departments-view organization-view organization-workspace">
    <div className="module-title"><div><span>Setup</span><h1>Organization</h1><p>Manage teams, position levels, and employee reporting lines in one workspace.</p></div></div>
    <div className="organization-tabs" role="tablist">{[['structure','Structure'],['positions','Positions'],['assignments','Assignments']].map(([key,label])=><button className={section===key?'active':''} type="button" role="tab" aria-selected={section===key} onClick={()=>setSection(key)} key={key}>{label}</button>)}</div>
    {section==='positions'&&<OrganizationPositions permission={permission} />}
    {section==='assignments'&&<OrganizationAssignments permission={permission} departments={departments} />}
    {section==='structure'&&<>
    <div className="organization-section-heading organization-departments-heading"><div><span>Company structure</span><h2>Departments</h2><p>Add and maintain company departments.</p></div>{permission?.create&&<button type="button" onClick={openCreate}>+ Add department</button>}</div>
    <div className="department-table"><div className="department-row department-head"><span>Unit</span><span>Description</span><span>Members</span><span>Actions</span></div>{orderedDepartments.map((department)=>{const parent=departments.find((candidate)=>String(candidate.id)===String(department.parentId));return <div className={`department-row organization-unit-row ${department.parentId?'child-unit':''}`} key={department.id}><strong><small>{department.unitType||'department'}</small>{department.name}{parent&&<em>under {parent.name}</em>}</strong><span>{department.description||'No description'}</span><span>{department.memberCount||0}</span><div className="organization-department-actions">{permission?.update&&<button className="edit" type="button" onClick={()=>openEdit(department)} aria-label={`Edit ${department.name}`} title="Edit unit">{'\u270E'}</button>}{permission?.delete&&<button className="delete" type="button" onClick={()=>deleteDepartment(department)} aria-label={`Delete ${department.name}`} title="Delete unit">{'\u2715'}</button>}</div></div>})}{loading&&<div className="empty-departments"><strong>Loading departments…</strong></div>}{!loading&&!departments.length&&<div className="empty-departments"><strong>No departments added</strong><small>Add the first company department to begin.</small></div>}</div>
    {editor&&<div className="employee-modal" role="dialog" aria-modal="true" aria-labelledby="organization-department-title"><button className="modal-scrim" type="button" onClick={()=>setEditor(null)} aria-label="Close" /><div className="employee-editor department-editor"><div className="editor-header"><div><span>Organization</span><h2 id="organization-department-title">{editor.mode==='edit'?'Edit organizational unit':'Add organizational unit'}</h2></div><button type="button" onClick={()=>setEditor(null)} aria-label="Close">×</button></div><form className="department-form" onSubmit={saveDepartment}><div className="department-form-grid"><label><span>Unit name *</span><input name="name" value={form.name} onChange={updateField} maxLength="120" required /></label><label><span>Type</span><select name="unitType" value={form.unitType} onChange={updateField}><option value="department">Department</option><option value="team">Team</option></select></label><label><span>Parent unit</span><select name="parentId" value={form.parentId} onChange={updateField}><option value="">Top level</option>{departments.filter((department)=>department.id!==editor.department?.id).map((department)=><option value={department.id} key={department.id}>{department.name}</option>)}</select></label><label><span>Description</span><textarea name="description" value={form.description} onChange={updateField} maxLength="1000" rows="4" /></label></div><button className="form-save" type="submit" disabled={saving}>{saving?'Saving…':'Save unit'}</button></form><div className="editor-actions"><span /><button className="secondary-action" type="button" onClick={()=>setEditor(null)}>Cancel</button></div></div></div>}
    </>}
  </section>;
}

function OrganizationPositions({ permission }) {
  const [positions, setPositions] = useState([]);
  const [draggingId, setDraggingId] = useState(null);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState({ ...emptyOrganizationDepartment, level:1 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [, setMessage] = useModalMessage();

  async function loadPositions() {
    setLoading(true);
    try {
      const response = await fetch('/api/organization/positions', { cache:'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load employee positions.');
      setPositions(data.positions);
    } catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadPositions(); }, []);

  function openCreate() { setForm({ ...emptyOrganizationDepartment, level:1 }); setEditor({ mode:'create' }); }
  function openEdit(position) { setForm({ name:position.name, description:position.description || '', level:position.level||1 }); setEditor({ mode:'edit', position }); }

  async function savePosition(event) {
    event.preventDefault(); setSaving(true);
    try {
      const editing = editor.mode === 'edit';
      const response = await fetch(editing ? `/api/organization/positions/${editor.position.id}` : '/api/organization/positions', { method:editing?'PUT':'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save employee position.');
      setEditor(null); await loadPositions(); setMessage(editing?'Employee position updated.':'Employee position added.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function deletePosition(position) {
    if (!await confirmModal(`Delete ${position.name}?`, 'Delete employee position?')) return;
    const response = await fetch(`/api/organization/positions/${position.id}`, { method:'DELETE' });
    if (!response.ok) { const data = await response.json(); return setMessage(data.error || 'Unable to delete employee position.'); }
    await loadPositions(); setMessage('Employee position deleted.');
  }

  async function movePosition(targetId) {
    if (!draggingId || String(draggingId) === String(targetId)) return;
    const reordered = [...positions];
    const sourceIndex = reordered.findIndex((position) => String(position.id) === String(draggingId));
    const targetIndex = reordered.findIndex((position) => String(position.id) === String(targetId));
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setPositions(reordered);
    setDraggingId(null);
    try {
      const response = await fetch('/api/organization/positions-order', { method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ positionIds:reordered.map((position)=>position.id) }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Unable to save position order.');
    } catch (error) { setMessage(error.message); await loadPositions(); }
  }

  return <div className="organization-positions"><div className="organization-section-heading"><div><span>Workforce structure</span><h2>Employee Positions</h2><p>Set explicit hierarchy levels; Level 1 is the most senior. Drag a row to reorder.</p></div>{permission?.create&&<button type="button" onClick={openCreate}>+ Add position</button>}</div><div className="department-table"><div className="department-row department-head"><span>Position</span><span>Description</span><span>Level</span><span>Actions</span></div>{positions.map((position)=><div className="department-row draggable-position" key={position.id} draggable={Boolean(permission?.update)} onDragStart={()=>setDraggingId(position.id)} onDragOver={(event)=>event.preventDefault()} onDrop={()=>movePosition(position.id)} onDragEnd={()=>setDraggingId(null)}><strong>{position.name}</strong><span>{position.description||'No description'}</span><span>Level {position.level||1}</span><div className="organization-department-actions">{permission?.update&&<button className="edit" type="button" onClick={()=>openEdit(position)} aria-label={`Edit ${position.name}`} title="Edit position">{'\u270E'}</button>}{permission?.delete&&<button className="delete" type="button" onClick={()=>deletePosition(position)} aria-label={`Delete ${position.name}`} title="Delete position">{'\u2715'}</button>}</div></div>)}{loading&&<div className="empty-departments"><strong>Loading positions…</strong></div>}{!loading&&!positions.length&&<div className="empty-departments"><strong>No employee positions added</strong><small>Add the first position to begin.</small></div>}</div>{editor&&<div className="employee-modal" role="dialog" aria-modal="true" aria-labelledby="organization-position-title"><button className="modal-scrim" type="button" onClick={()=>setEditor(null)} aria-label="Close" /><div className="employee-editor department-editor"><div className="editor-header"><div><span>Organization</span><h2 id="organization-position-title">{editor.mode==='edit'?'Edit employee position':'Add employee position'}</h2></div><button type="button" onClick={()=>setEditor(null)} aria-label="Close">×</button></div><form className="department-form" onSubmit={savePosition}><div className="department-form-grid"><label><span>Position name *</span><input name="name" value={form.name} onChange={(event)=>setForm((current)=>({...current,name:event.target.value}))} maxLength="120" required /></label><label><span>Hierarchy level *</span><input type="number" min="1" max="100" value={form.level} onChange={(event)=>setForm((current)=>({...current,level:Number(event.target.value)}))} required /></label><label><span>Description</span><textarea name="description" value={form.description} onChange={(event)=>setForm((current)=>({...current,description:event.target.value}))} maxLength="1000" rows="4" /></label></div><button className="form-save" type="submit" disabled={saving}>{saving?'Saving…':'Save position'}</button></form><div className="editor-actions"><span /><button className="secondary-action" type="button" onClick={()=>setEditor(null)}>Cancel</button></div></div></div>}</div>;
}

function OrganizationAssignments({ permission, departments }) {
  const [assignments, setAssignments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [editor, setEditor] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [, setMessage] = useModalMessage();

  async function loadAssignments() {
    setLoading(true);
    try {
      const [assignmentResponse, positionResponse] = await Promise.all([fetch('/api/organization/assignments',{cache:'no-store'}),fetch('/api/organization/positions',{cache:'no-store'})]);
      const assignmentData=await assignmentResponse.json(); const positionData=await positionResponse.json();
      if(!assignmentResponse.ok||!positionResponse.ok) throw new Error(assignmentData.error||positionData.error||'Unable to load organization assignments.');
      setAssignments(assignmentData.assignments); setPositions(positionData.positions);
    } catch(error){setMessage(error.message);} finally{setLoading(false);}
  }
  useEffect(()=>{loadAssignments();},[]);

  async function openAssignment(employee) {
    setEditor({ employee, form:{ unitIds:(employee.unitIds||[]).map(String), positionId:employee.positionId?String(employee.positionId):'', managerEmployeeIds:(employee.managerEmployeeIds||[]).map(String), effectiveFrom:localDateValue(new Date()) } });
    try { const response=await fetch(`/api/organization/assignments/${employee.employeeId}/history`,{cache:'no-store'}); const data=await response.json(); setHistory(response.ok?data.history:[]); } catch { setHistory([]); }
  }
  async function saveAssignment(event) {
    event.preventDefault(); setSaving(true);
    try {
      const response=await fetch(`/api/organization/assignments/${editor.employee.employeeId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(editor.form)});
      const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to save assignment.');
      setEditor(null); await loadAssignments(); setMessage('Organization assignment updated.');
    } catch(error){setMessage(error.message);} finally{setSaving(false);}
  }
  function toggleAssignmentValue(field, value) {
    setEditor((current)=>({ ...current, form:{ ...current.form, [field]:current.form[field].includes(String(value)) ? current.form[field].filter((item)=>item!==String(value)) : [...current.form[field],String(value)] } }));
  }
  const selectedPosition=positions.find((position)=>String(position.id)===editor?.form.positionId);
  const managerOptions=assignments.filter((candidate)=>candidate.assignmentId&&candidate.employeeId!==editor?.employee.employeeId&&Number(candidate.positionLevel)<Number(selectedPosition?.level||0));
  const grouped=departments.map((unit)=>({...unit,members:assignments.filter((assignment)=>(assignment.unitIds||[]).map(String).includes(String(unit.id)))}));
  const unassigned=assignments.filter((assignment)=>!assignment.assignmentId);
  const normalizedSearch=search.trim().toLowerCase();
  const visibleGroups=grouped.map((unit)=>({...unit,members:unit.members.filter((employee)=>!normalizedSearch||`${employee.firstName} ${employee.lastName} ${employee.employeeNumber||''} ${employee.positionName||''} ${employee.managerNames||''}`.toLowerCase().includes(normalizedSearch))})).filter((unit)=>unit.members.length);
  const visibleUnassigned=unassigned.filter((employee)=>!normalizedSearch||`${employee.firstName} ${employee.lastName} ${employee.employeeNumber||''}`.toLowerCase().includes(normalizedSearch));
  const employeesWithManagers=assignments.filter((employee)=>(employee.managerEmployeeIds||[]).length>0).length;

  return <div className="organization-assignments friendly-organization-assignments">
    <section className="assignment-page-hero"><div><span>Organization structure</span><h2>Reporting hierarchy</h2><p>See where every employee belongs and who approves their requests.</p></div><div className="assignment-hero-guide"><i>↳</i><span><strong>Manage assignments</strong><small>Select an employee to update their teams, position, or direct managers.</small></span></div></section>
    <div className="assignment-overview"><article><span>Employees</span><strong>{assignments.length}</strong><small>In the workforce</small></article><article><span>Active teams</span><strong>{grouped.filter((unit)=>unit.members.length).length}</strong><small>With assigned members</small></article><article><span>Manager assigned</span><strong>{employeesWithManagers}</strong><small>{assignments.length?Math.round(employeesWithManagers/assignments.length*100):0}% coverage</small></article><article className={unassigned.length?'needs-attention':''}><span>Needs assignment</span><strong>{unassigned.length}</strong><small>{unassigned.length?'Review required':'Everyone is assigned'}</small></article></div>
    <section className="assignment-directory"><header className="assignment-directory-toolbar"><div><span>Team directory</span><strong>Employee assignments</strong></div><label><span>⌕</span><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search employee, position, or manager…" />{search&&<button type="button" onClick={()=>setSearch('')} aria-label="Clear search">×</button>}</label></header>
      {loading&&<div className="assignment-directory-empty"><strong>Loading organization…</strong></div>}
      {!loading&&<div className="organization-chart redesigned-organization-chart">{visibleUnassigned.length>0&&<section className="unassigned-unit"><header><div><span>Needs attention</span><h3>Unassigned employees</h3></div><b>{visibleUnassigned.length}</b></header><div>{visibleUnassigned.map((employee)=><AssignmentEmployeeCard employee={employee} onOpen={openAssignment} key={employee.employeeId} unassigned />)}</div></section>}{visibleGroups.map((unit)=><section className={unit.parentId?'child-unit':''} key={unit.id}><header><div><span>{unit.unitType}</span><h3>{unit.name}</h3></div><b>{unit.members.length}</b></header><div>{unit.members.map((employee)=><AssignmentEmployeeCard employee={employee} onOpen={openAssignment} key={employee.employeeId}/>)}</div></section>)}</div>}
      {!loading&&!visibleGroups.length&&!visibleUnassigned.length&&<div className="assignment-directory-empty"><i>⌕</i><strong>No assignments found</strong><small>Try a different employee, position, or manager.</small></div>}
    </section>
    {editor&&<OrganizationAssignmentEditor editor={editor} setEditor={setEditor} departments={departments} positions={positions} selectedPosition={selectedPosition} managerOptions={managerOptions} toggleAssignmentValue={toggleAssignmentValue} saveAssignment={saveAssignment} saving={saving} permission={permission} history={history}/>} 
  </div>;
}

function AssignmentEmployeeCard({ employee, onOpen, unassigned=false }) {
  return <button type="button" onClick={()=>onOpen(employee)} className="assignment-employee-card"><i>{employee.firstName[0]}{employee.lastName[0]}</i><span><strong>{employee.firstName} {employee.lastName}</strong><small>{unassigned?'No organization assignment':employee.positionName||'No position assigned'}</small>{!unassigned&&<em>{employee.managerNames?`Reports to ${employee.managerNames}`:'Direct manager not assigned'}</em>}</span><b aria-hidden="true">›</b></button>;
}

function OrganizationAssignmentEditor({ editor, setEditor, departments, positions, selectedPosition, managerOptions, toggleAssignmentValue, saveAssignment, saving, permission, history }) {
  const selectedUnits=departments.filter((unit)=>editor.form.unitIds.includes(String(unit.id)));
  const selectedManagers=managerOptions.filter((manager)=>editor.form.managerEmployeeIds.includes(String(manager.employeeId)));
  return <div className="employee-modal organization-assignment-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-editor-title">
    <button className="modal-scrim" type="button" onClick={()=>setEditor(null)} aria-label="Close"/>
    <form className="organization-assignment-dialog" onSubmit={saveAssignment}>
      <header className="assignment-dialog-header"><div className="assignment-person"><i>{editor.employee.firstName[0]}{editor.employee.lastName[0]}</i><div><span>Organization assignment</span><h2 id="assignment-editor-title">{editor.employee.firstName} {editor.employee.lastName}</h2><p>{editor.employee.employeeNumber} · {editor.employee.positionName||'No position assigned'}</p></div></div><button type="button" onClick={()=>setEditor(null)} aria-label="Close">×</button></header>
      <div className="assignment-dialog-summary"><article><span>Teams</span><strong>{editor.form.unitIds.length}</strong></article><article><span>Managers</span><strong>{editor.form.managerEmployeeIds.length}</strong></article><article><span>Position</span><strong>{selectedPosition?.name||'Not selected'}</strong></article></div>
      <div className="assignment-dialog-body">
        <main>
          <section className="assignment-basics"><div className="assignment-panel-heading"><b>1</b><div><strong>Role and effective date</strong><small>Choose the employee's position before selecting managers.</small></div></div><div><label><span>Position *</span><select value={editor.form.positionId} onChange={(event)=>setEditor((current)=>({...current,form:{...current.form,positionId:event.target.value,managerEmployeeIds:[]}}))} required><option value="">Select position</option>{[...positions].sort((a,b)=>a.level-b.level).map((position)=><option value={position.id} key={position.id}>{position.name} · Level {position.level}</option>)}</select></label><label><span>Effective from *</span><input type="date" value={editor.form.effectiveFrom} onChange={(event)=>setEditor((current)=>({...current,form:{...current.form,effectiveFrom:event.target.value}}))} required/></label></div></section>
          <section className="assignment-selection-panel"><div className="assignment-panel-heading"><b>2</b><div><strong>Teams and departments</strong><small>Select every unit this employee belongs to.</small></div><em>{editor.form.unitIds.length} selected</em></div><div className="assignment-choice-grid">{departments.map((unit)=><label className={editor.form.unitIds.includes(String(unit.id))?'selected':''} key={unit.id}><input type="checkbox" checked={editor.form.unitIds.includes(String(unit.id))} onChange={()=>toggleAssignmentValue('unitIds',unit.id)}/><i/><span><strong>{unit.name}</strong><small>{unit.unitType}{unit.parentId?' · Nested':''}</small></span></label>)}</div></section>
          <section className="assignment-selection-panel"><div className="assignment-panel-heading"><b>3</b><div><strong>Direct managers</strong><small>{selectedPosition?'Select all employees who directly supervise this person.':'Select a position to show eligible managers.'}</small></div><em>{editor.form.managerEmployeeIds.length} selected</em></div><div className="assignment-choice-grid manager-choices">{managerOptions.map((manager)=><label className={editor.form.managerEmployeeIds.includes(String(manager.employeeId))?'selected':''} key={manager.employeeId}><input type="checkbox" checked={editor.form.managerEmployeeIds.includes(String(manager.employeeId))} onChange={()=>toggleAssignmentValue('managerEmployeeIds',manager.employeeId)}/><i/><span><strong>{manager.firstName} {manager.lastName}</strong><small>{manager.positionName} · {manager.unitNames||'No team'}</small></span></label>)}{selectedPosition&&!managerOptions.length&&<div className="assignment-choice-empty">No employees in more senior positions are available.</div>}</div></section>
        </main>
        <aside className="assignment-review-panel"><span>Assignment preview</span><h3>{editor.employee.firstName}'s organization</h3><section><strong>Position</strong><p>{selectedPosition?.name||'Select a position'}</p></section><section><strong>Teams</strong>{selectedUnits.length?<ul>{selectedUnits.map((unit)=><li key={unit.id}>{unit.name}</li>)}</ul>:<p>No teams selected</p>}</section><section><strong>Direct managers</strong>{selectedManagers.length?<ol>{selectedManagers.map((manager,index)=><li key={manager.employeeId}>{manager.firstName} {manager.lastName}{index===0&&<small>Primary approver</small>}</li>)}</ol>:<p>No managers selected</p>}</section>{history.length>0&&<section className="assignment-review-history"><strong>Previous assignments</strong><small>{history.length} historical record{history.length===1?'':'s'}</small></section>}</aside>
      </div>
      <footer className="assignment-dialog-actions"><small>{!editor.form.unitIds.length?'Select at least one team to continue.':!editor.form.positionId?'Select a position to continue.':'Ready to save this organization assignment.'}</small><button type="button" onClick={()=>setEditor(null)}>Cancel</button>{permission?.update&&<button className="primary-action" type="submit" disabled={saving||!editor.form.unitIds.length||!editor.form.positionId}>{saving?'Saving…':'Save assignment'}</button>}</footer>
    </form>
  </div>;
}

function Maintenance({ user, onNavigate }) {
  const maintenanceModules = user.permissions.filter((permission) => ['leave_management', 'roles'].includes(permission.moduleKey) && effectiveModulePermission(user,permission.moduleKey)?.view);
  return <section className="overview-view"><div className="module-title"><div><span>Administration</span><h1>Maintenance</h1><p>Manage leave and access controls.</p></div></div><div className="module-grid">{maintenanceModules.map((permission) => <button type="button" key={permission.moduleKey} onClick={() => onNavigate(permission.moduleKey)}><strong>{permission.moduleName}</strong><span>Open submodule →</span></button>)}</div></section>;
}

function WorkforceModule({ user, onNavigate }) {
  const employees = effectiveModulePermission(user, 'workforce');
  return <section className="overview-view"><div className="module-title"><div><span>People</span><h1>Workforce</h1><p>Manage employee records and workforce information.</p></div></div><div className="module-grid">{employees?.view&&<button type="button" onClick={() => onNavigate('workforce')}><strong>Employees</strong><span>Open submodule →</span></button>}</div></section>;
}

function LeaveManagement({ user }) {
  const [employees, setEmployees] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingEmployeeId, setSavingEmployeeId] = useState(null);
  const [, setMessage] = useModalMessage();
  const permission = effectiveModulePermission(user, 'leave_management');

  useEffect(() => { loadEmployees(); }, []);

  async function loadEmployees(query = '') {
    setLoading(true);
    setMessage('');
    try {
      const parameters = new URLSearchParams();
      if (query.trim()) parameters.set('search', query.trim());
      const response = await fetch(`/api/leave-management/employees?${parameters}`, { cache:'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load employee leave balances.');
      setEmployees(data.employees);
      setDrafts(Object.fromEntries(data.employees.map((employee) => [employee.id,
        Object.fromEntries(leaveBalanceFields.map(([key]) => [key, String(employee[key] ?? 0)]))
      ])));
    } catch (error) {
      setEmployees([]);
      setDrafts({});
      setMessage(error.message);
    } finally { setLoading(false); }
  }

  function searchEmployees(event) {
    event.preventDefault();
    loadEmployees(search);
  }

  function showAllEmployees() {
    setSearch('');
    loadEmployees('');
  }

  function updateBalance(employeeId, key, value) {
    setDrafts((current) => ({ ...current, [employeeId]: { ...current[employeeId], [key]:value } }));
  }

  async function saveBalances(event, employee) {
    event.preventDefault();
    setSavingEmployeeId(employee.id);
    setMessage('');
    try {
      const response = await fetch(`/api/leave-management/employees/${employee.id}`, {
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(drafts[employee.id])
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save leave balances.');
      setEmployees((current) => current.map((item) => item.id === employee.id ? { ...item, ...data.balances } : item));
      setDrafts((current) => ({ ...current, [employee.id]:Object.fromEntries(leaveBalanceFields.map(([key]) => [key,String(data.balances[key])])) }));
      setMessage(`Leave balances saved for ${employeeName(employee)}.`);
    } catch (error) { setMessage(error.message); }
    finally { setSavingEmployeeId(null); }
  }

  function hasChanges(employee) {
    return leaveBalanceFields.some(([key]) => Number(drafts[employee.id]?.[key]) !== Number(employee[key]));
  }

  const totalLeaveDays = employees.reduce((total,employee)=>total+leaveBalanceFields.reduce((sum,[key])=>sum+Number(employee[key]||0),0),0);
  const employeesWithoutCredits = employees.filter((employee)=>leaveBalanceFields.every(([key])=>Number(employee[key]||0)===0)).length;
  const unsavedEmployees = employees.filter(hasChanges).length;

  return <section className="leave-management-view friendly-leave-management">
    <div className="module-title"><div><span>Maintenance</span><h1>Leave Management</h1><p>Review and adjust each employee's available leave credits.</p></div></div>
    <div className="leave-management-overview"><article><span>Active employees</span><strong>{loading?'—':employees.length}</strong><small>Shown in this view</small></article><article><span>Allocated credits</span><strong>{loading?'—':totalLeaveDays.toLocaleString(undefined,{maximumFractionDigits:1})}</strong><small>Total available days</small></article><article className={employeesWithoutCredits?'needs-attention':''}><span>No leave credits</span><strong>{loading?'—':employeesWithoutCredits}</strong><small>Employees requiring review</small></article><article className={unsavedEmployees?'has-changes':''}><span>Unsaved changes</span><strong>{unsavedEmployees}</strong><small>{unsavedEmployees?'Save highlighted rows':'Everything is up to date'}</small></article></div>
    <section className="leave-balance-card">
      <div className="leave-balance-card-heading"><div><span>Employee balances</span><h2>Available leave credits</h2><p>Enter the number of days currently available to each employee.</p></div><b>{employees.length} {employees.length===1?'employee':'employees'}</b></div>
      <div className="leave-management-toolbar"><form onSubmit={searchEmployees}><span>⌕</span><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search employees, positions, or departments…" aria-label="Search employee leave balances"/>{search&&<button className="clear-leave-search" type="button" onClick={showAllEmployees}>×</button>}<button type="submit" disabled={loading}>Search</button></form><div><button type="button" onClick={showAllEmployees} disabled={loading}>View everyone</button></div></div>
      <div className="leave-balance-guide"><i>i</i><span><strong>Balances are measured in days</strong><small>Half days are supported. A highlighted row contains changes that have not been saved yet.</small></span></div>
      <div className="leave-balance-table">
        <div className="leave-balance-row leave-balance-head"><span>Employee</span><span>Employee ID</span>{leaveBalanceFields.map(([,label])=><span key={label}>{label}</span>)}<span>{permission?.update?'Save':'Access'}</span></div>
        {!loading&&employees.map((employee)=><form className={`leave-balance-row ${hasChanges(employee)?'has-unsaved-balance':''}`} key={employee.id} onSubmit={(event)=>saveBalances(event,employee)}><div className="leave-employee-cell"><i>{employee.firstName[0]}{employee.lastName[0]}</i><span><strong>{employeeName(employee)}</strong><small>{employee.department||'No department'} · {employee.jobTitle||'No position'}</small></span></div><span className="leave-employee-number">{employee.employeeNumber}</span>{leaveBalanceFields.map(([key,label])=><label key={key}><span>{label} leave days</span><div><input type="number" min="0" max="999" step="0.5" value={drafts[employee.id]?.[key]??''} onChange={(event)=>updateBalance(employee.id,key,event.target.value)} disabled={!permission?.update||savingEmployeeId===employee.id} aria-label={`${label} leave days for ${employeeName(employee)}`} required/><small>days</small></div></label>)}{permission?.update?<button type="submit" disabled={!hasChanges(employee)||savingEmployeeId===employee.id}>{savingEmployeeId===employee.id?'Saving…':hasChanges(employee)?'Save':'Saved'}</button>:<small className="leave-view-only">View only</small>}</form>)}
        {loading&&<div className="leave-balance-empty"><i>↻</i><strong>Loading employee balances…</strong><small>This should only take a moment.</small></div>}
        {!loading&&!employees.length&&<div className="leave-balance-empty"><i>⌕</i><strong>No active employees found</strong><small>Try a different search or view everyone.</small>{search&&<button type="button" onClick={showAllEmployees}>Clear search</button>}</div>}
      </div>
    </section>
  </section>;
}

function Utilities({ user, onNavigate }) {
  const utilityModules = user.permissions.filter((permission) => ['scheduler','device_users'].includes(permission.moduleKey) && effectiveModulePermission(user,permission.moduleKey)?.view);
  return <section className="overview-view"><div className="module-title"><div><span>Tools</span><h1>Utilities</h1><p>Access synchronization and other workforce utilities.</p></div></div><div className="module-grid">{utilityModules.map((permission) => <button type="button" key={permission.moduleKey} onClick={() => onNavigate(permission.moduleKey)}><strong>{permission.moduleName}</strong><span>Open utility →</span></button>)}</div></section>;
}

function Payroll({ user, onNavigate }) {
  const setup=effectiveModulePermission(user,'payroll_setup');
  const tax=effectiveModulePermission(user,'tax_configuration');
  const payout=effectiveModulePermission(user,'payout_view');
  const disbursement=effectiveModulePermission(user,'disbursement');
  return <section className="overview-view payroll-workspace"><div className="module-title"><div><span>Compensation</span><h1>Payroll</h1><p>Choose a payroll module to configure compensation, calculate pay, or release finalized payroll.</p></div></div><div className="module-grid">{setup?.view&&<button type="button" onClick={()=>onNavigate('payroll_setup')}><strong>Salary Setup</strong><span>Salary, earnings and deductions →</span></button>}{tax?.view&&<button type="button" onClick={()=>onNavigate('tax_configuration')}><strong>Tax Configuration</strong><span>BIR tables and effective dates →</span></button>}{setup?.view&&<button type="button" onClick={()=>onNavigate('payroll_tax')}><strong>Tax Calculator</strong><span>Calculate and review withholding →</span></button>}{setup?.view&&payout?.view&&<button type="button" onClick={()=>onNavigate('payroll_runs')}><strong>Payroll Runs</strong><span>Calculate, create, and finalize payroll →</span></button>}{payout?.view&&<button type="button" onClick={()=>onNavigate('payout_view')}><strong>Payout View</strong><span>Actual pay based on setup and attendance →</span></button>}{disbursement?.view&&<button type="button" onClick={()=>onNavigate('disbursement')}><strong>Disbursement</strong><span>Track payroll payment release →</span></button>}</div></section>;
}

const emptyPayrollProfile={payBasis:'monthly',payFrequency:'semi_monthly',baseRate:'',monthlyContributionBase:'',standardHoursPerDay:'8',taxStatus:'taxable',effectiveDate:'',isMinimumWageEarner:false,minimumWageRegion:'',minimumDailyWage:'',autoCalculateContributions:true,contributionDeductionSchedule:'split_evenly',sssEmployeeShare:'0',philhealthEmployeeShare:'0',pagibigEmployeeShare:'0',unionDues:'0',notes:'',components:[]};

function PayrollSetup({ user }) {
  const permission=effectiveModulePermission(user,'payroll_setup');
  const [employees,setEmployees]=useState([]),[selected,setSelected]=useState(null),[form,setForm]=useState(emptyPayrollProfile),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
  const selectionRequestRef=useRef(null);
  useEffect(()=>{const controller=new AbortController();setLoading(true);fetch(`/api/payroll/employees?search=${encodeURIComponent(search)}`,{signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setEmployees(d.employees);}).catch(e=>{if(e.name!=='AbortError')setMessage(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[search]);
  async function choose(employee) {
    selectionRequestRef.current?.abort();
    const controller = new AbortController();
    selectionRequestRef.current = controller;
    setSelected(employee);
    setForm(emptyPayrollProfile);
    setMessage('');
    setLoading(true);
    try {
      const response = await fetch(`/api/payroll/employees/${employee.id}`, { signal:controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load payroll settings.');
      if (selectionRequestRef.current !== controller) return;
      setForm({
        ...emptyPayrollProfile,
        ...data.profile,
        baseRate:data.profile?.baseRate ?? '',
        monthlyContributionBase:data.profile?.monthlyContributionBase ?? data.profile?.baseRate ?? '',
        minimumDailyWage:data.profile?.minimumDailyWage ?? '',
        standardHoursPerDay:data.profile?.standardHoursPerDay ?? '8',
        effectiveDate:data.profile?.effectiveDate?.slice(0,10) || '',
        components:data.components || []
      });
    } catch (error) {
      if (error.name !== 'AbortError' && selectionRequestRef.current === controller) setMessage(error.message);
    } finally {
      if (selectionRequestRef.current === controller) setLoading(false);
    }
  }
  useEffect(() => () => selectionRequestRef.current?.abort(), []);
  function updateItem(index,field,value){setForm(current=>({...current,components:current.components.map((item,i)=>i===index?{...item,[field]:value}:item)}));}
  function addItem(type){setForm(current=>({...current,components:[...current.components,{type,name:'',amount:'',calculation:'fixed',isTaxable:type==='earning',benefitCategory:'',isActive:true}]}));}
  async function save(event) {
    event.preventDefault();
    if (!selected || saving) return;
    const employeeId = selected.id;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`/api/payroll/employees/${employeeId}`, {
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save payroll settings.');
      setMessage(data.message);
      setEmployees((current) => current.map((employee) =>
        employee.id === employeeId ? { ...employee, baseRate:form.baseRate, payBasis:form.payBasis } : employee
      ));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }
  return <section className="payroll-setup-view"><div className="module-title"><div><span>Payroll</span><h1>Salary Setup</h1><p>Set each employee's compensation and recurring payroll items.</p></div></div>{message&&<p className="rbac-message" role="status">{message}</p>}<div className="payroll-setup-layout"><aside className="payroll-employee-list"><label><span>Find employee</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or employee number"/></label><div>{employees.map(employee=><button type="button" className={selected?.id===employee.id?'selected':''} key={employee.id} onClick={()=>choose(employee)}><span><strong>{employee.firstName} {employee.lastName}</strong><small>{employee.employeeNumber} · {employee.jobTitle||'No position'}</small></span><b>{employee.baseRate!=null?`₱${Number(employee.baseRate).toLocaleString()}`:'Not set'}</b></button>)}</div></aside><main className="payroll-editor">{!selected?<div className="time-entry-empty-state"><strong>Choose an employee</strong><p>Select someone from the list to configure their payroll details.</p></div>:<form onSubmit={save}><div className="payroll-editor-heading"><div><span>Payroll profile</span><h2>{selected.firstName} {selected.lastName}</h2></div><button disabled={!permission?.update||saving}>{saving?'Saving…':'Save setup'}</button></div><fieldset><legend>Compensation</legend><div className="payroll-field-grid"><label><span>Pay basis</span><select value={form.payBasis} onChange={e=>setForm({...form,payBasis:e.target.value})}><option value="monthly">Monthly salary</option><option value="daily">Daily rate</option><option value="hourly">Hourly rate</option></select></label><label><span>Base {form.payBasis==='monthly'?'salary':'rate'} (PHP)</span><input type="number" min="0" step="0.01" required value={form.baseRate} onChange={e=>setForm({...form,baseRate:e.target.value,monthlyContributionBase:form.payBasis==='monthly'?e.target.value:form.monthlyContributionBase})}/></label><label><span>Monthly statutory contribution base (PHP)</span><input type="number" min="0.01" step="0.01" required value={form.monthlyContributionBase} onChange={e=>setForm({...form,monthlyContributionBase:e.target.value})}/></label><label><span>Pay frequency</span><select value={form.payFrequency} onChange={e=>setForm({...form,payFrequency:e.target.value})}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="semi_monthly">Semi-monthly</option><option value="monthly">Monthly</option></select></label><label><span>Standard hours/day</span><input type="number" min="0.01" max="24" step="0.25" required value={form.standardHoursPerDay} onChange={e=>setForm({...form,standardHoursPerDay:e.target.value})}/></label><label><span>Tax status</span><select value={form.taxStatus} onChange={e=>setForm({...form,taxStatus:e.target.value})}><option value="taxable">Taxable</option><option value="exempt">Tax exempt</option></select></label><label className="tax-active"><input type="checkbox" checked={form.isMinimumWageEarner} onChange={e=>setForm({...form,isMinimumWageEarner:e.target.checked})}/>Minimum-wage earner</label>{form.isMinimumWageEarner&&<><label><span>Applicable wage region</span><input required value={form.minimumWageRegion} onChange={e=>setForm({...form,minimumWageRegion:e.target.value})} placeholder="e.g. NCR"/></label><label><span>Current minimum daily wage (PHP)</span><input type="number" min="0.01" step="0.01" required value={form.minimumDailyWage} onChange={e=>setForm({...form,minimumDailyWage:e.target.value})}/></label></>}<label><span>Effective date</span><input type="date" value={form.effectiveDate} onChange={e=>setForm({...form,effectiveDate:e.target.value})}/></label></div></fieldset><fieldset><legend>Statutory contribution allocation</legend><div className="payroll-field-grid"><label className="tax-active"><input type="checkbox" checked={form.autoCalculateContributions} onChange={e=>setForm({...form,autoCalculateContributions:e.target.checked})}/>Automatically calculate employee and employer statutory shares</label>{form.autoCalculateContributions&&<label><span>Deduction schedule</span><select value={form.contributionDeductionSchedule} onChange={e=>setForm({...form,contributionDeductionSchedule:e.target.value})}>{form.payFrequency==='semi_monthly'&&<option value="split_evenly">Split evenly between cutoffs</option>}<option value="first_cutoff">Deduct in first half of month</option><option value="second_cutoff">Deduct in second half of month</option></select></label>}{!form.autoCalculateContributions&&[['sssEmployeeShare','SSS per pay period'],['philhealthEmployeeShare','PhilHealth per pay period'],['pagibigEmployeeShare','Pag-IBIG per pay period']].map(([key,label])=><label key={key}><span>{label}</span><input type="number" min="0" step="0.01" value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}</div></fieldset>{['earning','deduction'].map(type=><fieldset key={type}><legend>{type==='earning'?'Recurring earnings':'Recurring deductions'}</legend>{form.components.map((item,index)=>item.type===type&&<div className="payroll-component" key={index}><input aria-label="Name" placeholder={type==='earning'?'Allowance name':'Deduction name'} value={item.name} onChange={e=>updateItem(index,'name',e.target.value)} required/><select aria-label="Calculation" value={item.calculation} onChange={e=>updateItem(index,'calculation',e.target.value)}><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option></select><input aria-label="Amount" type="number" min="0" max={item.calculation==='percentage'?'100':undefined} step="0.01" value={item.amount} onChange={e=>updateItem(index,'amount',e.target.value)} required/>{type==='earning'&&<select aria-label="Statutory benefit category" value={item.benefitCategory||''} onChange={e=>updateItem(index,'benefitCategory',e.target.value)}><option value="">Not a statutory benefit</option><option value="rice">Rice subsidy</option><option value="uniform">Uniform/clothing</option><option value="medical_dependents">Dependent medical allowance</option><option value="medical_assistance">Medical assistance</option><option value="laundry">Laundry allowance</option><option value="achievement_award">Achievement award</option><option value="christmas_gifts">Christmas/anniversary gift</option><option value="cba_productivity">CBA/productivity incentive</option><option value="overtime_meal">Overtime meal</option><option value="thirteenth_month">13th month/other benefits</option></select>}<label className="payroll-check"><input type="checkbox" checked={item.isTaxable} disabled={Boolean(item.benefitCategory)} onChange={e=>updateItem(index,'isTaxable',e.target.checked)}/>Taxable</label><button type="button" onClick={()=>setForm({...form,components:form.components.filter((_,i)=>i!==index)})}>Remove</button></div>)}<button className="add-payroll-item" type="button" onClick={()=>addItem(type)}>+ Add {type}</button></fieldset>)}<label className="payroll-notes"><span>Notes</span><textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Internal payroll notes"/></label></form>}</main></div></section>;
}

function payoutPeriodForFrequency(frequency, referenceDate=new Date()){
  const reference=new Date(referenceDate.getFullYear(),referenceDate.getMonth(),referenceDate.getDate());
  let end=new Date(reference);end.setDate(end.getDate()-1);
  let start=new Date(end);
  if(frequency==='weekly')start.setDate(end.getDate()-6);
  else if(frequency==='biweekly')start.setDate(end.getDate()-13);
  else if(frequency==='monthly'){
    end=new Date(reference.getFullYear(),reference.getMonth(),0);
    start=new Date(end.getFullYear(),end.getMonth(),1);
  }else{
    if(reference.getDate()>15){
      start=new Date(reference.getFullYear(),reference.getMonth(),1);
      end=new Date(reference.getFullYear(),reference.getMonth(),15);
    }else{
      end=new Date(reference.getFullYear(),reference.getMonth(),0);
      start=new Date(end.getFullYear(),end.getMonth(),16);
    }
  }
  return{start:localDateValue(start),end:localDateValue(end),payDate:localDateValue(end)};
}

function PayoutView(){
  const initialPeriod=payoutPeriodForFrequency('semi_monthly');
  const[employees,setEmployees]=useState([]);
  const[employeeId,setEmployeeId]=useState('');
  const[periodStart,setPeriodStart]=useState(initialPeriod.start);
  const[periodEnd,setPeriodEnd]=useState(initialPeriod.end);
  const[payDate,setPayDate]=useState(initialPeriod.payDate);
  const[result,setResult]=useState(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useModalMessage('error');
  const payoutRequestRef=useRef(null);

  const applyEmployeePeriod=(employee)=>{
    const period=payoutPeriodForFrequency(employee?.payFrequency||'semi_monthly');
    setPeriodStart(period.start);setPeriodEnd(period.end);setPayDate(period.payDate);
  };
  const invalidatePayoutPreview=()=>{
    payoutRequestRef.current?.abort();
    payoutRequestRef.current=null;
    setLoading(false);setResult(null);setError('');
  };
  useEffect(()=>{
    const controller=new AbortController();
    (async()=>{
      try{
        const response=await fetch('/api/payroll/employees',{signal:controller.signal});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||'Unable to load payroll employees.');
        const loaded=data.employees||[];
        setEmployees(loaded);
        if(loaded.length){setEmployeeId(String(loaded[0].id));applyEmployeePeriod(loaded[0]);}
      }catch(loadError){if(loadError.name!=='AbortError')setError(loadError.message);}
    })();
    return()=>controller.abort();
  },[]);
  useEffect(()=>()=>payoutRequestRef.current?.abort(),[]);
  const chooseEmployee=(value)=>{
    invalidatePayoutPreview();setEmployeeId(value);
    applyEmployeePeriod(employees.find(employee=>String(employee.id)===String(value)));
  };
  async function calculate(event){
    event.preventDefault();
    payoutRequestRef.current?.abort();
    const controller=new AbortController();
    payoutRequestRef.current=controller;
    setLoading(true);setResult(null);setError('');
    try{
      const response=await fetch(`/api/payroll/employees/${employeeId}/payout-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({periodStart,periodEnd,payDate}),signal:controller.signal});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Unable to calculate payout.');
      if(payoutRequestRef.current!==controller)return;
      setResult(data);setError('');
    }catch(calculateError){
      if(calculateError.name!=='AbortError'&&payoutRequestRef.current===controller)setError(calculateError.message);
    }finally{
      if(payoutRequestRef.current===controller){payoutRequestRef.current=null;setLoading(false);}
    }
  }
  const money=value=>`₱${Number(value||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const payoutItemKey=(kind,item,index)=>item.id?`${kind}:${item.id}`:`${kind}:${item.name}:${item.calculation||'value'}:${item.value}:${index}`;
  const attendanceStatus=item=>{
    const incomplete=item.incompletePunches?' · Incomplete punches':'';
    if(item.holiday){
      const rawStatus=String(item.holiday.status||item.holiday.type||'holiday').replaceAll('_',' ');
      const holidayStatus=rawStatus.charAt(0).toUpperCase()+rawStatus.slice(1);
      return `${item.holiday.title||'Company holiday'} · ${holidayStatus}${incomplete}`;
    }
    if(item.incompletePunches)return 'Incomplete punches';
    if(item.absent)return 'Absent';
    const punchCount=Array.isArray(item.punches)?item.punches.length:0;
    return punchCount?`${punchCount} punches`:'No entries';
  };

  return <section className="overview-view payout-view">
    <div className="module-title"><div><span>Payroll</span><h1>Payout View</h1><p>Preview an employee's payout using salary configuration, attendance, holiday rules, contributions, deductions, and tax.</p></div></div>
    <form className="payout-controls" onSubmit={calculate}>
      <label><span>Employee</span><select value={employeeId} onChange={event=>chooseEmployee(event.target.value)} required><option value="">Select employee</option>{employees.map(employee=><option value={employee.id} key={employee.id}>{employee.firstName} {employee.lastName} · {employee.employeeNumber}</option>)}</select></label>
      <label><span>Period start</span><input type="date" value={periodStart} onChange={event=>{invalidatePayoutPreview();setPeriodStart(event.target.value);}} required/></label>
      <label><span>Period end</span><input type="date" value={periodEnd} onChange={event=>{invalidatePayoutPreview();setPeriodEnd(event.target.value);if(payDate<event.target.value)setPayDate(event.target.value);}} required/></label>
      <label><span>Pay date</span><input type="date" min={periodEnd||undefined} value={payDate} onChange={event=>{invalidatePayoutPreview();setPayDate(event.target.value);}} required/></label>
      <button type="submit" disabled={!employeeId||loading}>{loading?'Calculating…':'Calculate payout'}</button>
    </form>
    {error&&<p className="rbac-message" role="alert">{error}</p>}
    {result&&<>
      {result.attendance?.warnings?.map(warning=><p className="rbac-message" role="alert" key={warning}>{warning} Review this attendance before finalizing payroll.</p>)}
      {result.holidayPayAssumptions?.map(assumption=><p className="rbac-message" role="note" key={assumption}>{assumption}</p>)}
      <div className="payout-summary">
        <article><span>Configured period pay</span><strong>{money(result.salary.periodBase)}</strong><small>Before attendance</small></article>
        <article className={result.salary.attendanceDeduction?'needs-attention':''}><span>Attendance / holiday adjustment</span><strong>{money(result.salary.attendanceDeduction)}</strong><small>{result.attendance.totalPenaltyMinutes} penalty minutes</small></article>
        <article><span>Gross payout</span><strong>{money(result.grossPay)}</strong><small>Before deductions</small></article>
        <article><span>Total deductions</span><strong>{money(result.totalDeductions)}</strong><small>Attendance, statutory, tax, and recurring</small></article>
        <article className="net-pay"><span>Net payout</span><strong>{money(result.netPay)}</strong><small>Expected employee take-home pay</small></article>
      </div>
      <div className="payout-breakdown">
        <section><h2>Earnings</h2><dl><div><dt>Configured base pay</dt><dd>{money(result.salary.periodBase)}</dd></div>{result.earnings.map((item,index)=><div key={payoutItemKey('earning',item,index)}><dt>{item.name}</dt><dd>{money(item.value)}</dd></div>)}<div className="total"><dt>Gross payout</dt><dd>{money(result.grossPay)}</dd></div></dl></section>
        <section><h2>Deductions</h2><dl><div><dt>Attendance / unpaid holiday</dt><dd>{money(result.salary.attendanceDeduction)}</dd></div><div><dt>SSS</dt><dd>{money(result.contributions.sssEmployee)}</dd></div><div><dt>PhilHealth</dt><dd>{money(result.contributions.philhealthEmployee)}</dd></div><div><dt>Pag-IBIG</dt><dd>{money(result.contributions.pagibigEmployee)}</dd></div><div><dt>Union dues</dt><dd>{money(result.unionDues)}</dd></div>{result.deductions.map((item,index)=><div key={payoutItemKey('deduction',item,index)}><dt>{item.name}</dt><dd>{money(item.value)}</dd></div>)}<div><dt>Withholding tax</dt><dd>{money(result.tax.amount)}</dd></div>{result.tax.refund>0&&<div><dt>Year-end tax refund</dt><dd>-{money(result.tax.refund)}</dd></div>}<div className="total"><dt>Net payout</dt><dd>{money(result.netPay)}</dd></div></dl></section>
        <section><h2>Employer contributions</h2><dl><div><dt>SSS employer share</dt><dd>{money(result.contributions.sssEmployer)}</dd></div><div><dt>SSS EC</dt><dd>{money(result.contributions.sssEcEmployer)}</dd></div><div><dt>PhilHealth employer share</dt><dd>{money(result.contributions.philhealthEmployer)}</dd></div><div><dt>Pag-IBIG employer share</dt><dd>{money(result.contributions.pagibigEmployer)}</dd></div><div className="total"><dt>Total employer cost</dt><dd>{money(result.contributions.totalEmployer)}</dd></div></dl></section>
      </div>
      <section className="payout-attendance">
        <div className="friendly-table-heading"><div><span>Attendance computation</span><h2>{result.employee.name}</h2></div><small>{result.attendance.scheduledDays} scheduled days</small></div>
        <div className="payout-attendance-row head"><span>Date</span><span>Status</span><span>Late</span><span>Break excess</span><span>Undertime</span><span>Deduction</span></div>
        {result.attendance.days.map(item=><div className={`payout-attendance-row${item.penaltyMinutes||item.incompletePunches?' exception':''}`} key={item.date}><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString()}</span><b>{attendanceStatus(item)}</b><span>{item.lateMinutes} min</span><span>{item.breakExcessMinutes} min</span><span>{item.undertimeMinutes} min</span><strong>{money(item.deduction)}</strong></div>)}
      </section>
    </>}
  </section>;
}

const payrollRunFrequencyLabels={weekly:'Weekly',biweekly:'Every two weeks',semi_monthly:'Semi-monthly',monthly:'Monthly'};

function PayrollRuns({ user, onNavigate }) {
  const permission=effectiveModulePermission(user,'payroll_setup');
  const initialPeriod=payoutPeriodForFrequency('semi_monthly');
  const[employees,setEmployees]=useState([]);
  const[runs,setRuns]=useState([]);
  const[frequency,setFrequency]=useState('semi_monthly');
  const[periodStart,setPeriodStart]=useState(initialPeriod.start);
  const[periodEnd,setPeriodEnd]=useState(initialPeriod.end);
  const[payDate,setPayDate]=useState(initialPeriod.payDate);
  const[selectedIds,setSelectedIds]=useState([]);
  const[previews,setPreviews]=useState([]);
  const[previewErrors,setPreviewErrors]=useState([]);
  const[progress,setProgress]=useState({ completed:0,total:0 });
  const[currentRun,setCurrentRun]=useState(null);
  const[loading,setLoading]=useState(true);
  const[calculating,setCalculating]=useState(false);
  const[creating,setCreating]=useState(false);
  const[actionRunId,setActionRunId]=useState(null);
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');
  const calculationRequestRef=useRef(null);

  const eligibleEmployees=employees.filter(employee=>employee.employmentStatus==='active'&&employee.payFrequency===frequency);
  const selectedEmployees=eligibleEmployees.filter(employee=>selectedIds.includes(String(employee.id)));
  const warningCount=previews.filter(preview=>preview.attendance?.requiresReview).length;
  const grossTotal=previews.reduce((sum,preview)=>sum+Number(preview.grossPay||0),0);
  const deductionTotal=previews.reduce((sum,preview)=>sum+Number(preview.totalDeductions||0),0);
  const netTotal=previews.reduce((sum,preview)=>sum+Number(preview.netPay||0),0);
  const batchReady=previews.length===selectedEmployees.length&&previews.length>0&&!previewErrors.length&&!warningCount&&!currentRun;
  const money=value=>`₱${Number(value||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const dateLabel=value=>new Date(`${String(value).slice(0,10)}T00:00:00`).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});

  async function loadRuns(signal) {
    const response=await fetch('/api/payroll/runs',{signal,cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Unable to load payroll runs.');
    setRuns(data.runs||[]);
  }

  useEffect(()=>{
    const controller=new AbortController();
    (async()=>{
      setLoading(true);setError('');
      try{
        const[employeeResponse,runsResponse]=await Promise.all([
          fetch('/api/payroll/employees',{signal:controller.signal,cache:'no-store'}),
          fetch('/api/payroll/runs',{signal:controller.signal,cache:'no-store'})
        ]);
        const[employeeData,runsData]=await Promise.all([employeeResponse.json(),runsResponse.json()]);
        if(!employeeResponse.ok)throw new Error(employeeData.error||'Unable to load payroll employees.');
        if(!runsResponse.ok)throw new Error(runsData.error||'Unable to load payroll runs.');
        const loadedEmployees=employeeData.employees||[];
        setEmployees(loadedEmployees);setRuns(runsData.runs||[]);
        setSelectedIds(loadedEmployees.filter(employee=>employee.employmentStatus==='active'&&employee.payFrequency==='semi_monthly').map(employee=>String(employee.id)));
      }catch(loadError){if(loadError.name!=='AbortError')setError(loadError.message);}
      finally{if(!controller.signal.aborted)setLoading(false);}
    })();
    return()=>{controller.abort();calculationRequestRef.current?.abort();};
  },[]);

  function invalidateCalculation() {
    calculationRequestRef.current?.abort();calculationRequestRef.current=null;
    setCalculating(false);setPreviews([]);setPreviewErrors([]);setProgress({completed:0,total:0});setCurrentRun(null);setMessage('');setError('');
  }

  function changeFrequency(nextFrequency) {
    invalidateCalculation();setFrequency(nextFrequency);
    const period=payoutPeriodForFrequency(nextFrequency);
    setPeriodStart(period.start);setPeriodEnd(period.end);setPayDate(period.payDate);
    setSelectedIds(employees.filter(employee=>employee.employmentStatus==='active'&&employee.payFrequency===nextFrequency).map(employee=>String(employee.id)));
  }

  function changePeriod(field,value) {
    invalidateCalculation();
    if(field==='start')setPeriodStart(value);
    if(field==='end'){setPeriodEnd(value);if(payDate<value)setPayDate(value);}
    if(field==='payDate')setPayDate(value);
  }

  function toggleEmployee(employeeId) {
    invalidateCalculation();
    const id=String(employeeId);
    setSelectedIds(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
  }

  function toggleAllEmployees() {
    invalidateCalculation();
    setSelectedIds(selectedIds.length===eligibleEmployees.length?[]:eligibleEmployees.map(employee=>String(employee.id)));
  }

  async function calculateBatch() {
    if(!selectedEmployees.length||calculating)return;
    calculationRequestRef.current?.abort();
    const controller=new AbortController();calculationRequestRef.current=controller;
    setCalculating(true);setPreviews([]);setPreviewErrors([]);setCurrentRun(null);setMessage('');setError('');
    setProgress({completed:0,total:selectedEmployees.length});
    const calculated=[];const failures=[];
    try{
      for(let start=0;start<selectedEmployees.length;start+=5){
        const chunk=selectedEmployees.slice(start,start+5);
        const results=await Promise.all(chunk.map(async employee=>{
          try{
            const response=await fetch(`/api/payroll/employees/${employee.id}/payout-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({periodStart,periodEnd,payDate}),signal:controller.signal});
            const data=await response.json();
            if(!response.ok)throw new Error(data.error||'Unable to calculate payout.');
            return{ preview:data };
          }catch(previewError){
            if(previewError.name==='AbortError')throw previewError;
            return{ error:{ employeeId:String(employee.id),employeeName:`${employee.firstName} ${employee.lastName}`,message:previewError.message } };
          }
        }));
        if(calculationRequestRef.current!==controller)return;
        results.forEach(result=>{if(result.preview)calculated.push(result.preview);else failures.push(result.error);});
        setPreviews([...calculated]);setPreviewErrors([...failures]);setProgress({completed:Math.min(start+chunk.length,selectedEmployees.length),total:selectedEmployees.length});
      }
      if(failures.length)setError(`${failures.length} employee payout${failures.length===1?'':'s'} could not be calculated. Resolve the listed issues and calculate again.`);
      else if(calculated.some(preview=>preview.attendance?.requiresReview))setError('Resolve every attendance warning before creating this payroll run.');
      else setMessage(`${calculated.length} employee payout${calculated.length===1?'':'s'} calculated. Review the totals, then create the draft run.`);
    }catch(batchError){if(batchError.name!=='AbortError')setError(batchError.message);}
    finally{if(calculationRequestRef.current===controller){calculationRequestRef.current=null;setCalculating(false);}}
  }

  async function createDraft() {
    if(!batchReady||creating)return;
    setCreating(true);setMessage('');setError('');
    try{
      const response=await fetch('/api/payroll/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({periodStart,periodEnd,payDate,items:previews})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Unable to create the payroll run.');
      setCurrentRun(data.run);setMessage(`Draft payroll run #${data.run.id} was created. Finalize it when the batch is approved.`);
      await loadRuns();
    }catch(createError){setError(createError.message);}
    finally{setCreating(false);}
  }

  async function changeRunStatus(run,nextStatus) {
    const verb=nextStatus==='finalized'?'finalize':'void';
    const confirmed=await confirmModal(nextStatus==='finalized'
      ?`Finalize payroll run #${run.id}? Its employee calculations will be locked and sent to Disbursement.`
      :`Void payroll run #${run.id}? This cannot be undone.`,`${verb.charAt(0).toUpperCase()+verb.slice(1)} payroll run`);
    if(!confirmed)return;
    setActionRunId(run.id);setMessage('');setError('');
    try{
      const response=await fetch(`/api/payroll/runs/${run.id}/status`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:nextStatus})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||`Unable to ${verb} the payroll run.`);
      if(String(currentRun?.id)===String(run.id))setCurrentRun(data.run);
      setMessage(`Payroll run #${run.id} is now ${data.run.status}.`);await loadRuns();
    }catch(statusError){setError(statusError.message);}
    finally{setActionRunId(null);}
  }

  return <section className="overview-view payroll-runs-view">
    <div className="module-title"><div><span>Payroll</span><h1>Payroll Runs</h1><p>Calculate a complete employee batch, create a controlled draft, and finalize it for disbursement.</p></div></div>
    {message&&<p className="payroll-run-message success" role="status">{message}</p>}
    {error&&<p className="payroll-run-message error" role="alert">{error}</p>}
    <section className="payroll-run-builder" aria-labelledby="payroll-run-builder-title">
      <header><div><span>Step 1</span><h2 id="payroll-run-builder-title">Choose the payroll period</h2></div><small>All selected employees must use the same pay frequency.</small></header>
      <div className="payroll-run-controls">
        <label><span>Pay frequency</span><select value={frequency} disabled={calculating||creating} onChange={event=>changeFrequency(event.target.value)}>{Object.entries(payrollRunFrequencyLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Period start</span><input type="date" value={periodStart} disabled={calculating||creating} onChange={event=>changePeriod('start',event.target.value)} required/></label>
        <label><span>Period end</span><input type="date" value={periodEnd} disabled={calculating||creating} onChange={event=>changePeriod('end',event.target.value)} required/></label>
        <label><span>Pay date</span><input type="date" min={periodEnd||undefined} value={payDate} disabled={calculating||creating} onChange={event=>changePeriod('payDate',event.target.value)} required/></label>
      </div>
      <div className="payroll-run-selection-heading"><div><span>Step 2</span><h2>Select employees</h2><small>{eligibleEmployees.length} active {payrollRunFrequencyLabels[frequency].toLowerCase()} employee{eligibleEmployees.length===1?'':'s'}</small></div><button type="button" disabled={!eligibleEmployees.length||calculating||creating} onClick={toggleAllEmployees}>{selectedIds.length===eligibleEmployees.length&&eligibleEmployees.length?'Clear all':'Select all'}</button></div>
      <div className="payroll-run-employee-list">{eligibleEmployees.map(employee=><label className={selectedIds.includes(String(employee.id))?'selected':''} key={employee.id}><input type="checkbox" checked={selectedIds.includes(String(employee.id))} disabled={calculating||creating} onChange={()=>toggleEmployee(employee.id)}/><i aria-hidden="true"/><span><strong>{employee.firstName} {employee.lastName}</strong><small>{employee.employeeNumber} · {employee.jobTitle||'No position'}</small></span><b>{employee.payBasis?payrollRunFrequencyLabels[employee.payFrequency]:'Setup required'}</b></label>)}{!loading&&!eligibleEmployees.length&&<div className="payroll-run-empty">No active employees have this pay frequency configured. Update Salary Setup first.</div>}</div>
      <div className="payroll-run-calculate"><div><span>Step 3</span><strong>Calculate and review</strong><small>Calculations remain valid for 30 minutes and must be recreated after attendance changes.</small></div><button type="button" disabled={!selectedEmployees.length||calculating||creating} onClick={calculateBatch}>{calculating?`Calculating ${progress.completed}/${progress.total}…`:`Calculate ${selectedEmployees.length} payout${selectedEmployees.length===1?'':'s'}`}</button></div>
    </section>
    {(previews.length>0||previewErrors.length>0)&&<section className="payroll-run-review" aria-labelledby="payroll-run-review-title">
      <header><div><span>Step 4</span><h2 id="payroll-run-review-title">Review the batch</h2></div><small>{previews.length} calculated · {warningCount} attendance warning{warningCount===1?'':'s'} · {previewErrors.length} failed</small></header>
      <div className="payroll-run-summary"><article><span>Employees</span><strong>{previews.length}</strong></article><article><span>Gross payroll</span><strong>{money(grossTotal)}</strong></article><article><span>Total deductions</span><strong>{money(deductionTotal)}</strong></article><article className="net"><span>Net payroll</span><strong>{money(netTotal)}</strong></article></div>
      <div className="payroll-run-table"><div className="payroll-run-row head"><span>Employee</span><span>Gross</span><span>Deductions</span><span>Net pay</span><span>Attendance</span></div>{previews.map(preview=><div className={`payroll-run-row${preview.attendance?.requiresReview?' warning':''}`} key={preview.employeeId}><div><strong>{preview.employee.name}</strong><small>{preview.employee.employeeNumber}</small></div><span>{money(preview.grossPay)}</span><span>{money(preview.totalDeductions)}</span><strong>{money(preview.netPay)}</strong><b>{preview.attendance?.requiresReview?'Review required':'Ready'}</b></div>)}{previewErrors.map(item=><div className="payroll-run-row failed" key={item.employeeId}><div><strong>{item.employeeName}</strong><small>Calculation failed</small></div><p>{item.message}</p></div>)}</div>
      {warningCount>0&&<div className="payroll-run-warning"><span>Attendance must be resolved before a draft can be created.</span><button type="button" onClick={()=>onNavigate('time_entries')}>Open Time Entries</button></div>}
      <footer><div><span>Step 5</span><strong>{currentRun?`Draft run #${currentRun.id} created`:'Create the controlled draft'}</strong><small>{currentRun?'Finalize this run to make it available in Disbursement.':'Creating the draft stores this exact signed calculation batch.'}</small></div>{!currentRun?<button className="primary" type="button" disabled={!batchReady||!permission?.create||creating} onClick={createDraft}>{creating?'Creating draft…':'Create draft run'}</button>:currentRun.status==='draft'?<button className="primary" type="button" disabled={!permission?.update||actionRunId===currentRun.id} onClick={()=>changeRunStatus(currentRun,'finalized')}>{actionRunId===currentRun.id?'Finalizing…':'Finalize payroll'}</button>:currentRun.status==='finalized'?<button className="primary" type="button" onClick={()=>onNavigate('disbursement')}>Open Disbursement</button>:null}</footer>
    </section>}
    <section className="payroll-run-history" aria-labelledby="payroll-run-history-title"><header><div><span>Run history</span><h2 id="payroll-run-history-title">Payroll batches</h2></div><b>{runs.length}</b></header><div className="payroll-run-history-table"><div className="payroll-history-row head"><span>Run</span><span>Period</span><span>Pay date</span><span>Employees</span><span>Net payroll</span><span>Status</span><span>Actions</span></div>{runs.map(run=><div className="payroll-history-row" key={run.id}><strong>#{run.id}</strong><span>{dateLabel(run.periodStart)} – {dateLabel(run.periodEnd)}</span><span>{dateLabel(run.payDate)}</span><span>{run.employeeCount}</span><span>{money(run.netPay)}</span><b className={`payroll-run-status ${run.status}`}>{run.status}</b><div>{run.status==='draft'&&permission?.update&&<button type="button" disabled={actionRunId===run.id} onClick={()=>changeRunStatus(run,'finalized')}>Finalize</button>}{run.status!=='void'&&permission?.update&&<button className="danger" type="button" disabled={actionRunId===run.id} onClick={()=>changeRunStatus(run,'void')}>Void</button>}{run.status==='finalized'&&<button type="button" onClick={()=>onNavigate('disbursement')}>Disburse</button>}</div></div>)}{!loading&&!runs.length&&<div className="payroll-run-empty">No payroll runs have been created yet.</div>}</div></section>
  </section>;
}

function Disbursement({ user }) {
  const permission=effectiveModulePermission(user,'disbursement');
  const[runs,setRuns]=useState([]);
  const[selectedRunId,setSelectedRunId]=useState('');
  const[detail,setDetail]=useState(null);
  const[drafts,setDrafts]=useState({});
  const[loading,setLoading]=useState(true);
  const[savingItemId,setSavingItemId]=useState(null);
  const[message,setMessage]=useState('');
  const money=value=>`₱${Number(value||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const dateLabel=value=>value?new Date(`${String(value).slice(0,10)}T00:00:00`).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'—';
  const methodLabel=value=>({bank_transfer:'Bank transfer',cash:'Cash',check:'Check',e_wallet:'E-wallet'}[value]||'Not selected');

  async function refreshRuns(signal) {
    const response=await fetch('/api/payroll/disbursements',{signal,cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Unable to load finalized payroll runs.');
    setRuns(data.runs||[]);
    return data.runs||[];
  }

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setMessage('');
    refreshRuns(controller.signal).then(loaded=>{if(loaded.length)setSelectedRunId(String(loaded[0].id));}).catch(error=>{if(error.name!=='AbortError')setMessage(error.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[]);

  useEffect(()=>{
    if(!selectedRunId){setDetail(null);setDrafts({});return undefined;}
    const controller=new AbortController();
    setLoading(true);setMessage('');
    fetch(`/api/payroll/disbursements/${selectedRunId}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Unable to load disbursement details.');
      setDetail(data);
      setDrafts(Object.fromEntries((data.items||[]).map(item=>[item.id,{status:item.status||'pending',method:item.method||'',reference:item.reference||'',notes:item.notes||''}])));
    }).catch(error=>{if(error.name!=='AbortError')setMessage(error.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[selectedRunId]);

  function updateDraft(itemId,key,value){
    setDrafts(current=>({...current,[itemId]:{...current[itemId],[key]:value}}));
  }

  async function saveItem(item) {
    const draft=drafts[item.id];
    if(!draft||savingItemId)return;
    setSavingItemId(item.id);setMessage('');
    try{
      const response=await fetch(`/api/payroll/disbursements/${selectedRunId}/items/${item.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Unable to update the disbursement.');
      setDetail(current=>({...current,items:current.items.map(currentItem=>currentItem.id===item.id?{...currentItem,...data.item,disbursedBy:data.item.status==='paid'?user.displayName:null}:currentItem)}));
      setMessage(`${item.firstName} ${item.lastName}'s disbursement was updated.`);
      await refreshRuns();
    }catch(error){setMessage(error.message);}
    finally{setSavingItemId(null);}
  }

  const items=detail?.items||[];
  const counts={pending:0,processing:0,paid:0,failed:0};
  for(const item of items)counts[item.status]=(counts[item.status]||0)+1;
  const paidAmount=items.filter(item=>item.status==='paid').reduce((sum,item)=>sum+Number(item.netPay||0),0);

  return <section className="overview-view disbursement-view">
    <div className="module-title"><div><span>Payroll</span><h1>Disbursement</h1><p>Release finalized payroll and keep an auditable payment status, method, and reference for every employee.</p></div></div>
    {message&&<p className="rbac-message" role="status">{message}</p>}
    <div className="disbursement-layout">
      <aside className="disbursement-runs"><header><div><span>Finalized payroll</span><h2>Runs ready for release</h2></div><b>{runs.length}</b></header><div className="disbursement-run-list">{runs.map(run=><button type="button" className={String(run.id)===selectedRunId?'selected':''} key={run.id} onClick={()=>setSelectedRunId(String(run.id))}><span><strong>{dateLabel(run.periodStart)} – {dateLabel(run.periodEnd)}</strong><small>Pay date {dateLabel(run.payDate)} · {run.employeeCount} employees</small></span><b>{run.paidCount}/{run.employeeCount} paid</b></button>)}{!loading&&!runs.length&&<p className="disbursement-empty">Finalize a payroll run before disbursing employee pay.</p>}</div></aside>
      <main className="disbursement-detail">{!detail?<div className="disbursement-empty">{loading?'Loading disbursements…':'Choose a finalized payroll run.'}</div>:<><header><div><span>Payment batch</span><h2>{dateLabel(detail.run.periodStart)} – {dateLabel(detail.run.periodEnd)}</h2></div><small>Pay date {dateLabel(detail.run.payDate)}</small></header><div className="disbursement-summary"><article><span>Total net payroll</span><strong>{money(items.reduce((sum,item)=>sum+Number(item.netPay||0),0))}</strong></article><article><span>Paid amount</span><strong>{money(paidAmount)}</strong></article><article><span>Pending / processing</span><strong>{counts.pending} / {counts.processing}</strong></article><article><span>Paid / failed</span><strong>{counts.paid} / {counts.failed}</strong></article></div><div className="disbursement-table"><div className="disbursement-row head"><span>Employee</span><span>Net pay</span><span>Status</span><span>Method</span><span>Reference</span><span>Notes</span><span>Action</span></div>{items.map(item=>{const draft=drafts[item.id]||{};const locked=item.status==='paid';return <div className="disbursement-row" key={item.id}><div><strong>{item.firstName} {item.lastName}</strong><small>{item.employeeNumber}{item.disbursedAt?` · Paid ${dateLabel(item.disbursedAt)}`:''}</small></div><span>{money(item.netPay)}</span><select aria-label={`${item.firstName} ${item.lastName} status`} className={`disbursement-status ${draft.status||item.status}`} value={draft.status||item.status} disabled={locked||!permission?.update} onChange={event=>updateDraft(item.id,'status',event.target.value)}><option value="pending">Pending</option><option value="processing">Processing</option><option value="paid">Paid</option><option value="failed">Failed</option></select><select aria-label={`${item.firstName} ${item.lastName} payment method`} value={draft.method||''} disabled={locked||!permission?.update} onChange={event=>updateDraft(item.id,'method',event.target.value)}><option value="">Select method</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="check">Check</option><option value="e_wallet">E-wallet</option></select><input aria-label={`${item.firstName} ${item.lastName} payment reference`} value={draft.reference||''} disabled={locked||!permission?.update} maxLength="100" placeholder="Transaction or receipt no." onChange={event=>updateDraft(item.id,'reference',event.target.value)}/><input aria-label={`${item.firstName} ${item.lastName} disbursement notes`} value={draft.notes||''} disabled={locked||!permission?.update} maxLength="500" placeholder={locked?`${methodLabel(item.method)} · ${item.reference||'No reference'}`:'Optional note'} onChange={event=>updateDraft(item.id,'notes',event.target.value)}/><button type="button" disabled={locked||!permission?.update||savingItemId===item.id} onClick={()=>saveItem(item)}>{locked?'Locked':savingItemId===item.id?'Saving…':'Save'}</button></div>})}</div></>}</main>
    </div>
  </section>;
}

function PayrollTaxCalculator({user}){
  const permission=effectiveModulePermission(user,'payroll_setup');const[employees,setEmployees]=useState([]),[selected,setSelected]=useState(null),[profile,setProfile]=useState(null),[components,setComponents]=useState([]),[result,setResult]=useState(null),[message,setMessage]=useState('');
  const [regularCompensation,setRegularCompensation]=useState('');
  const [settingsDirty,setSettingsDirty]=useState(false);
  const [savingProfile,setSavingProfile]=useState(false);
  const [calculating,setCalculating]=useState(false);
  const selectionRequestRef=useRef(null);
  const previewRequestRef=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();
    (async()=>{
      try{
        const response=await fetch('/api/payroll/employees',{signal:controller.signal});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||'Unable to load payroll employees.');
        setEmployees(data.employees||[]);
      }catch(error){if(error.name!=='AbortError')setMessage(error.message);}
    })();
    return()=>controller.abort();
  },[]);
  function invalidateTaxPreview(){
    previewRequestRef.current?.abort();
    previewRequestRef.current=null;
    setCalculating(false);setResult(null);setMessage('');
  }
  function updateTaxProfile(key,value){
    invalidateTaxPreview();setMessage('');setSettingsDirty(true);
    setProfile(current=>({...current,[key]:value}));
  }
  async function selectEmployee(employee) {
    if(String(selected?.id||'')===String(employee.id)&&profile)return;
    if(settingsDirty){
      const discard=await confirmModal('You have unsaved tax treatment changes. Discard them and switch employees?','Unsaved tax changes');
      if(!discard)return;
    }
    selectionRequestRef.current?.abort();
    invalidateTaxPreview();
    const controller = new AbortController();
    selectionRequestRef.current = controller;
    setSelected(employee);
    setProfile(null);
    setComponents([]);
    setResult(null);
    setRegularCompensation('');
    setSettingsDirty(false);
    setMessage('');
    try {
      const response = await fetch(`/api/payroll/employees/${employee.id}`, { signal:controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load statutory settings.');
      if (selectionRequestRef.current !== controller) return;
      setProfile({ ...emptyPayrollProfile, ...data.profile });
      setComponents(data.components || []);
      setSettingsDirty(!data.profile);
    } catch (error) {
      if (error.name !== 'AbortError' && selectionRequestRef.current === controller) setMessage(error.message);
    } finally {
      if(selectionRequestRef.current===controller)selectionRequestRef.current=null;
    }
  }
  useEffect(() => () => {selectionRequestRef.current?.abort();previewRequestRef.current?.abort();}, []);
  async function saveProfile() {
    if (!selected || !profile || !permission?.update || savingProfile) return;
    const employeeId = selected.id;
    setSavingProfile(true);setMessage('');
    try {
      const response = await fetch(`/api/payroll/employees/${employeeId}`, {
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ ...profile, components })
      });
      const data = await response.json();
      if(!response.ok)throw new Error(data.error||'Unable to save statutory settings.');
      setSettingsDirty(false);setMessage(data.message||'Statutory settings saved.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingProfile(false);
    }
  }
  async function calculate(event){
    event.preventDefault();
    if(!selected||settingsDirty||savingProfile)return setMessage('Save the employee tax treatment before calculating withholding.');
    previewRequestRef.current?.abort();
    const controller=new AbortController();
    previewRequestRef.current=controller;
    const data=Object.fromEntries(new FormData(event.currentTarget));
    setCalculating(true);setResult(null);setMessage('');
    try{
      const response=await fetch(`/api/payroll/employees/${selected.id}/compliance-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:controller.signal});
      const preview=await response.json();
      if(!response.ok)throw new Error(preview.error||'Unable to calculate withholding.');
      if(previewRequestRef.current!==controller)return;
      setResult(preview);
    }catch(error){
      if(error.name!=='AbortError'&&previewRequestRef.current===controller)setMessage(error.message);
    }finally{
      if(previewRequestRef.current===controller){previewRequestRef.current=null;setCalculating(false);}
    }
  }
  const money=value=>`₱${Number(value||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  return <section className="payroll-setup-view">
    <div className="module-title"><div><span>Payroll</span><h1>Philippine Tax Calculator</h1><p>Apply the effective BIR table to an employee's taxable compensation.</p></div></div>
    {message&&<p className="rbac-message" role="status">{message}</p>}
    <div className="tax-payroll-layout">
      <aside className="payroll-employee-list"><div>{employees.map(employee=><button type="button" className={selected?.id===employee.id?'selected':''} key={employee.id} disabled={savingProfile} onClick={()=>selectEmployee(employee)}><span><strong>{employee.firstName} {employee.lastName}</strong><small>{employee.employeeNumber}</small></span></button>)}</div></aside>
      <main>{!profile?<div className="time-entry-empty-state"><strong>Choose an employee</strong><p>Select an employee to configure statutory deductions and calculate withholding.</p></div>:<>
        <section className="statutory-settings">
          <h2>Employee tax treatment</h2>
          <div className="payroll-field-grid">
            <label><span>Tax status</span><select value={profile.taxStatus} disabled={!permission?.update||savingProfile} onChange={event=>updateTaxProfile('taxStatus',event.target.value)}><option value="taxable">Taxable</option><option value="exempt">Tax exempt</option></select></label>
            <label><span>Monthly statutory contribution base</span><input type="number" min="0.01" step=".01" value={profile.monthlyContributionBase||''} disabled={!permission?.update||savingProfile} onChange={event=>updateTaxProfile('monthlyContributionBase',event.target.value)}/></label>
            <label className="tax-active"><input type="checkbox" checked={profile.isMinimumWageEarner} disabled={!permission?.update||savingProfile} onChange={event=>updateTaxProfile('isMinimumWageEarner',event.target.checked)}/>Minimum-wage earner</label>
            {profile.isMinimumWageEarner&&<>
              <label><span>Applicable wage region</span><input value={profile.minimumWageRegion||''} disabled={!permission?.update||savingProfile} onChange={event=>updateTaxProfile('minimumWageRegion',event.target.value)}/></label>
              <label><span>Current minimum daily wage</span><input type="number" min="0.01" step=".01" value={profile.minimumDailyWage||''} disabled={!permission?.update||savingProfile} onChange={event=>updateTaxProfile('minimumDailyWage',event.target.value)}/></label>
            </>}
            {[['sssEmployeeShare','SSS employee share'],['philhealthEmployeeShare','PhilHealth employee share'],['pagibigEmployeeShare','Pag-IBIG employee share'],['unionDues','Union dues']].map(([key,label])=><label key={key}><span>{label} per pay period</span><input type="number" min="0" step=".01" value={profile[key]} disabled={!permission?.update||savingProfile} onChange={event=>updateTaxProfile(key,event.target.value)}/></label>)}
          </div>
          {settingsDirty&&<p className="rbac-message" role="status">{permission?.update?'Save these tax treatment changes before calculating a new preview.':'An authorized user must save this employee tax treatment before a preview can be calculated.'}</p>}
          {permission?.update&&<button type="button" className="save-tax" disabled={!settingsDirty||savingProfile} onClick={saveProfile}>{savingProfile?'Saving…':settingsDirty?'Save tax treatment':'Tax treatment saved'}</button>}
        </section>
        <form className="employee-tax-preview" key={selected.id} aria-busy={calculating} onSubmit={calculate}>
          <h2>Current pay period</h2>
          <div className="payroll-field-grid">
            <label><span>Pay date</span><input name="payDate" type="date" required defaultValue={localDateValue(new Date())} onChange={invalidateTaxPreview}/></label>
            {['daily','hourly'].includes(profile.payBasis)&&<label><span>Regular compensation this pay period</span><input name="regularCompensation" type="number" min="0" step=".01" value={regularCompensation} onChange={event=>{invalidateTaxPreview();setRegularCompensation(event.target.value);}} required/></label>}
            <label><span>Additional taxable compensation</span><input name="supplementaryCompensation" type="number" min="0" step=".01" defaultValue="0" onChange={invalidateTaxPreview}/></label>
            <label><span>Other non-taxable compensation</span><input name="otherNonTaxableCompensation" type="number" min="0" step=".01" defaultValue="0" onChange={invalidateTaxPreview}/></label>
            <label><span>YTD taxable compensation</span><input name="yearToDateTaxableCompensation" type="number" min="0" step=".01" defaultValue="0" onChange={invalidateTaxPreview}/></label>
            <label><span>YTD tax already withheld</span><input name="yearToDateTaxWithheld" type="number" min="0" step=".01" defaultValue="0" onChange={invalidateTaxPreview}/></label>
          </div>
          <button className="save-tax" type="submit" disabled={calculating||savingProfile||settingsDirty}>{calculating?'Calculating…':'Calculate withholding'}</button>
        </form>
        {result&&<div className="tax-result"><article><span>Gross compensation</span><strong>{money(result.grossCompensation)}</strong></article><article><span>Employee contributions</span><strong>{money(result.mandatoryContributions)}</strong></article><article><span>Employer contributions</span><strong>{money(result.contributions.totalEmployer)}</strong></article><article><span>Taxable compensation</span><strong>{money(result.taxableIncome)}</strong></article><article><span>Withholding this period</span><strong>{money(result.tax)}</strong></article><article><span>Annualized tax</span><strong>{money(result.annualizedTax)}</strong></article><article><span>Year-end balance</span><strong>{money(result.yearEndBalance)}</strong></article><small>Table: {result.configuration.name}</small></div>}
      </>}</main>
    </div>
  </section>;
}

const moduleCopy = {
  company: ['Company', 'Manage company profile, identity, and business settings.'],
  organization: ['Organization', 'Manage organization structure and operating settings.'],
  time_tracking: ['Timetracking', 'Review and manage employee attendance records.'],
  requests: ['Requests', 'Review and manage employee leave, overtime, and shift-change requests.'],
  leave_management: ['Leave Management', 'Review and manage employee leave records.'],
  leave_application: ['Leave Application', 'Submit and review employee leave applications.'],
  overtime_request: ['Overtime Request', 'Submit and review employee overtime requests.'],
  shift_change: ['Shift Change', 'Submit and review employee shift change requests.'],
  payroll: ['Payroll', 'Payroll periods, calculations, and exports are ready for the next implementation phase.'],
  reports: ['Reports', 'Workforce and payroll reporting is ready for the next implementation phase.']
};

function Scheduler({ user }) {
  const [syncingDeviceId, setSyncingDeviceId] = useState(null);
  const [status, setStatus] = useState({ agent: null, jobs: [], backups: [], devices: [], syncConfiguration: null });
  const [syncConfiguration, setSyncConfiguration] = useState({ enabled: false, intervalMinutes: '15' });
  const [savingConfiguration, setSavingConfiguration] = useState(false);
  const [deviceForm, setDeviceForm] = useState({ name: '', ip: '', port: '4370' });
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [refreshingDeviceId, setRefreshingDeviceId] = useState(null);
  const [error, setError] = useModalMessage('error');
  const permission = effectiveModulePermission(user,'scheduler');

  async function loadStatus(refreshConfiguration = false) {
    const response = await fetch('/api/scheduler/status', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load synchronization status.');
    setStatus(data);
    if (refreshConfiguration && data.syncConfiguration) setSyncConfiguration({ enabled: data.syncConfiguration.enabled, intervalMinutes: String(data.syncConfiguration.intervalMinutes) });
  }

  useEffect(() => {
    loadStatus(true).catch((loadError) => setError(loadError.message));
    const timer = window.setInterval(() => loadStatus().catch(() => {}), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function requestSync(deviceId) {
    const device = status.devices.find((item) => String(item.id) === String(deviceId));
    if (device?.status !== 'online') {
      setError('Wait for the device to show Online before synchronizing.');
      return;
    }
    setSyncingDeviceId(deviceId);
    setError('');
    try {
      const response = await fetch(`/api/scheduler/devices/${deviceId}/sync`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to request synchronization.');
      await loadStatus();
      showModal('notification', 'Device synchronization was queued.', 'Synchronization queued');
    } catch (pullError) {
      setError(pullError.message);
    } finally {
      setSyncingDeviceId(null);
    }
  }

  async function addDevice(event) {
    event.preventDefault(); setError('');
    try { const wasEditing=Boolean(editingDeviceId); const response=await fetch(editingDeviceId?`/api/scheduler/devices/${editingDeviceId}`:'/api/scheduler/devices',{method:editingDeviceId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(deviceForm)}); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to save device.'); setDeviceForm({name:'',ip:'',port:'4370'}); setEditingDeviceId(null); setShowDeviceForm(false); await loadStatus(); showModal('notification',wasEditing?'Device updated successfully.':'Device added successfully.','Device saved'); }
    catch(addError){setError(addError.message);}
  }

  function editDevice(device) {
    setDeviceForm({name:device.name,ip:device.ip,port:String(device.port)}); setEditingDeviceId(device.id); setShowDeviceForm(true); setError('');
  }

  function closeDeviceForm() {
    setShowDeviceForm(false); setEditingDeviceId(null); setDeviceForm({name:'',ip:'',port:'4370'});
  }

  async function removeDevice(device) {
    if(!await confirmModal(`Remove ${device.name}? Its device association and job history will be removed.`, 'Remove device?'))return;
    setError(''); try{const response=await fetch(`/api/scheduler/devices/${device.id}`,{method:'DELETE'}); if(!response.ok){const data=await response.json();throw new Error(data.error||'Unable to remove device.');}await loadStatus();showModal('notification',`${device.name} was removed successfully.`,'Device removed');}catch(removeError){setError(removeError.message);}
  }

  async function refreshDevice(deviceId) {
    setRefreshingDeviceId(deviceId); setError('');
    try { const response=await fetch(`/api/scheduler/devices/${deviceId}/refresh`,{method:'POST'}); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to refresh device status.'); await loadStatus(); showModal('notification','Device status refreshed successfully.','Status refreshed'); }
    catch(refreshError){setError(refreshError.message);} finally {setRefreshingDeviceId(null);}
  }

  async function saveSyncConfiguration(event) {
    event.preventDefault(); setSavingConfiguration(true); setError('');
    try { const response=await fetch('/api/scheduler/configuration',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:syncConfiguration.enabled,intervalMinutes:Number(syncConfiguration.intervalMinutes)})}); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to save automatic sync configuration.'); setSyncConfiguration({enabled:data.syncConfiguration.enabled,intervalMinutes:String(data.syncConfiguration.intervalMinutes)}); await loadStatus(); showModal('notification','Automatic synchronization settings were saved.','Configuration saved'); }
    catch(configurationError){setError(configurationError.message);} finally {setSavingConfiguration(false);}
  }

  const online = status.agent?.lastSeenAt && Date.now() - new Date(status.agent.lastSeenAt).getTime() < 60000;
  const onlineDevices = status.devices.filter((device)=>device.status==='online').length;
  const activeSyncJobs = status.jobs.filter((job)=>['pending','running'].includes(job.status)).length;
  const latestBackup = [...status.backups].sort((left,right)=>new Date(right.capturedAt)-new Date(left.capturedAt))[0];
  return <section className="overview-view friendly-sync-agent"><div className="module-title"><div><span>Utilities</span><h1>Sync Agent</h1><p>Monitor the on-site agent, manage attendance devices, and control synchronization.</p></div></div><div className="sync-agent-overview"><article className={online?'online':'offline'}><span>Agent</span><strong>{online?'Online':'Offline'}</strong><small>{status.agent?.lastSeenAt?`Last contact ${new Date(status.agent.lastSeenAt).toLocaleString()}`:'Waiting for first connection'}</small></article><article><span>Registered devices</span><strong>{status.devices.length}</strong><small>{onlineDevices} currently online</small></article><article className={activeSyncJobs?'working':''}><span>Active sync jobs</span><strong>{activeSyncJobs}</strong><small>{activeSyncJobs?'Synchronization in progress':'No jobs waiting'}</small></article><article><span>Last backup</span><strong className="sync-date">{latestBackup?new Date(latestBackup.capturedAt).toLocaleDateString():'None'}</strong><small>{latestBackup?new Date(latestBackup.capturedAt).toLocaleTimeString():'Run the first device sync'}</small></article></div><SchedulerOverview online={online} status={status} error={error} permission={permission} syncConfiguration={syncConfiguration} setSyncConfiguration={setSyncConfiguration} savingConfiguration={savingConfiguration} onSave={saveSyncConfiguration} /><section className="device-registry"><div className="section-heading"><div><span>Local network</span><h3>Attendance devices</h3><p>Check connectivity, synchronize records, and review device storage.</p></div>{permission?.create&&<button type="button" onClick={()=>showDeviceForm?closeDeviceForm():setShowDeviceForm(true)}>{showDeviceForm?'Cancel':'Add device'}</button>}</div>{showDeviceForm&&<form className="device-add-form" onSubmit={addDevice}><label><span>Device name</span><input value={deviceForm.name} onChange={(event)=>setDeviceForm({...deviceForm,name:event.target.value})} placeholder="Main office MB460" required /></label><label><span>IP address</span><input value={deviceForm.ip} onChange={(event)=>setDeviceForm({...deviceForm,ip:event.target.value})} placeholder="192.168.1.11" required /></label><label><span>Port</span><input type="number" min="1" max="65535" value={deviceForm.port} onChange={(event)=>setDeviceForm({...deviceForm,port:event.target.value})} required /></label><button className="primary-action" type="submit">{editingDeviceId?'Save device':'Add device'}</button></form>}<div className="device-list">{status.devices.map((device)=>{const deviceJobs=status.jobs.filter((item)=>String(item.deviceId)===String(device.id));const job=deviceJobs.find((item)=>['pending','running'].includes(item.status));const backup=status.backups.find((item)=>String(item.deviceId)===String(device.id));return <article key={device.id}><i className={`device-dot ${device.status}`} /><div><strong>{device.name}</strong><small>{device.ip}:{device.port}</small></div><span className={`device-status ${device.status}`}>{device.status}</span><time>{device.lastCheckedAt?`Checked ${new Date(device.lastCheckedAt).toLocaleString()}`:device.status==='unknown'?'Checking connectivity…':'Not checked yet'}</time><div className="device-actions">{permission?.update&&<button className="device-sync-button" type="button" onClick={()=>requestSync(device.id)} disabled={!online||Boolean(job)||syncingDeviceId===device.id}>{job?`Sync ${job.status}…`:syncingDeviceId===device.id?'Requesting…':'Sync'}</button>}{permission?.update&&<button type="button" onClick={()=>refreshDevice(device.id)} disabled={!online||device.status==='unknown'||refreshingDeviceId===device.id}>{device.status==='unknown'||refreshingDeviceId===device.id?'Checking…':'Refresh'}</button>}{permission?.update&&<button type="button" onClick={()=>editDevice(device)}>Edit</button>}{permission?.delete&&<button className="remove-device" type="button" onClick={()=>removeDevice(device)}>Remove</button>}</div><DeviceSyncNotification job={deviceJobs[0]} backup={backup} />{device.lastError&&<p>{device.lastError}</p>}</article>;})}{!status.devices.length&&<div className="empty-device-list"><i>+</i><strong>No attendance devices registered</strong><small>Add the first device using its local network address.</small></div>}</div></section></section>;
}

function DeviceSyncNotification({ job, backup }) {
  if (job?.status === 'pending') return <div className="device-sync-notice pending" role="status"><strong>Synchronization queued</strong><small>Waiting for the on-site agent.</small></div>;
  if (job?.status === 'running') return <div className="device-sync-notice running" role="status"><strong>Synchronization in progress</strong><small>The agent is reading this device.</small></div>;
  if (job?.status === 'failed') return <div className="device-sync-notice failed" role="alert"><strong>Synchronization failed</strong><small>{job.error || 'The device could not be synchronized.'}</small></div>;
  if (backup) return <><div className="device-sync-notice completed" role="status"><strong>Last synchronized {new Date(backup.capturedAt).toLocaleString()}</strong><small>{backup.users} users · {backup.attendance} attendance records</small></div><DeviceStorageStatus storage={backup.storage} /></>;
  return <><div className="device-sync-notice"><strong>Not synchronized yet</strong><small>Run Sync to create the first backup.</small></div><DeviceStorageStatus /></>;
}

function DeviceStorageStatus({ storage }) {
  const hasCapacity = Number.isFinite(storage?.attendanceCapacity) && storage.attendanceCapacity > 0;
  return <div className="device-storage-status"><div><span>Device storage</span><strong>{hasCapacity?`${storage.attendanceRecords.toLocaleString()} / ${storage.attendanceCapacity.toLocaleString()} attendance logs`:'Available after synchronization'}</strong><small>{hasCapacity?`${storage.attendanceAvailable.toLocaleString()} available · ${storage.userRecords.toLocaleString()} device users`:'Synchronize this device to read its capacity.'}</small></div><div className="device-storage-meter" aria-label={hasCapacity?`${storage.utilization}% storage used`:'Storage usage unavailable'}><i style={{width:`${hasCapacity?storage.utilization:0}%`}} /></div>{hasCapacity&&<b>{storage.utilization}% used</b>}</div>;
}

function SchedulerOverview({ online, status, error, permission, syncConfiguration, setSyncConfiguration, savingConfiguration, onSave }) {
  return <><div className="scheduler-overview"><div className="scheduler-card scheduler-status"><span>Agent status</span><strong><i className={online?'online':'offline'} />Sync agent · {online?'Online':'Offline'}</strong><p>{status.agent?.lastSeenAt?`Last contact: ${new Date(status.agent.lastSeenAt).toLocaleString()}`:'The sync agent has not connected yet.'}</p>{status.agent?.lastSyncAt&&<small>Last sync: {new Date(status.agent.lastSyncAt).toLocaleString()}</small>}{status.agent?.lastError&&<p className="form-error" role="alert">{status.agent.lastError}</p>}</div><form className="scheduler-card sync-configuration" onSubmit={onSave}><span>Sync configuration</span><label className="automatic-sync-toggle"><input type="checkbox" checked={syncConfiguration.enabled} onChange={(event)=>setSyncConfiguration({...syncConfiguration,enabled:event.target.checked})} disabled={!permission?.update} /><strong>Automatic device sync</strong></label><label className="sync-interval"><span>Run every</span><input type="number" min="1" max="10080" value={syncConfiguration.intervalMinutes} onChange={(event)=>setSyncConfiguration({...syncConfiguration,intervalMinutes:event.target.value})} disabled={!permission?.update||!syncConfiguration.enabled} /><span>minutes</span></label><small>Online devices are queued automatically at this interval. Already synchronized records are skipped.</small>{permission?.update&&<button className="primary-action" type="submit" disabled={savingConfiguration}>{savingConfiguration?'Saving…':'Save configuration'}</button>}</form></div><DeviceUserPushSection devices={status.devices} permission={permission} /></>;
}

function DeviceUsers({ user }) {
  const [devices,setDevices]=useState([]);
  const [,setError]=useModalMessage('error');
  const permission=effectiveModulePermission(user,'device_users');
  useEffect(()=>{const controller=new AbortController();const load=async()=>{try{const response=await fetch('/api/scheduler/device-users/devices',{signal:controller.signal,cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load devices.');setDevices(data.devices||[]);}catch(loadError){if(loadError.name!=='AbortError')setError(loadError.message);}};load();const timer=window.setInterval(load,5000);return()=>{controller.abort();window.clearInterval(timer);};},[]);
  return <DeviceUsersModuleContext.Provider value><section className="overview-view friendly-device-users"><div className="module-title"><div><span>Utilities</span><h1>Device Users</h1><p>Compare workforce accounts with an attendance device and safely push missing users.</p></div></div><DeviceUserPushSection devices={devices} permission={permission} /></section></DeviceUsersModuleContext.Provider>;
}

function DeviceUserPushSection(props) {
  const isDeviceUsersModule = useContext(DeviceUsersModuleContext);
  return isDeviceUsersModule ? <DeviceUserPushContent {...props} /> : null;
}

function DeviceUserPushContent({ devices, permission }) {
  const [deviceId,setDeviceId]=useState(''); const [users,setUsers]=useState([]); const [check,setCheck]=useState(null); const [loading,setLoading]=useState(false); const [pushing,setPushing]=useState(false); const [checking,setChecking]=useState(false); const [message,setMessage]=useModalMessage();
  useEffect(()=>{if(!deviceId&&devices.length)setDeviceId(String(devices[0].id));},[devices,deviceId]);
  useEffect(()=>{if(!deviceId)return undefined;const controller=new AbortController();const load=async()=>{try{const response=await fetch(`/api/scheduler/devices/${deviceId}/users`,{signal:controller.signal,cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load device users.');setUsers(data.users);setCheck(data.check);}catch(loadError){if(loadError.name!=='AbortError')setMessage(loadError.message);}finally{setLoading(false);}};setLoading(true);load();const timer=window.setInterval(load,5000);return()=>{controller.abort();window.clearInterval(timer);};},[deviceId]);
  async function pushUsers(){setPushing(true);setMessage('');try{const response=await fetch(`/api/scheduler/devices/${deviceId}/users/push`,{method:'POST'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to queue device users.');setMessage(data.queued?`${data.queued} user${data.queued===1?'':'s'} queued for the device.`:'No new eligible users to push.');}catch(pushError){setMessage(pushError.message);}finally{setPushing(false);}}
  async function checkUsers(){setChecking(true);setMessage('');try{const response=await fetch(`/api/scheduler/devices/${deviceId}/users/check`,{method:'POST'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to check device users.');setCheck(data.check);setMessage('Device user check queued. Missing users will be pushed automatically.');}catch(checkError){setMessage(checkError.message);}finally{setChecking(false);}}
  const eligible=users.filter((user)=>user.eligible&&!['pending','running'].includes(user.status));
  const queuedUsers=users.filter((user)=>['pending','running'].includes(user.status)).length;
  const ineligibleUsers=users.filter((user)=>!user.eligible).length;
  const selectedDevice=devices.find((device)=>String(device.id)===String(deviceId));
  return <section className="device-user-push friendly-device-user-push">
    <div className="device-user-overview"><article><span>Attendance devices</span><strong>{devices.length}</strong><small>{selectedDevice?.name||'No device selected'}</small></article><article><span>Workforce users</span><strong>{loading?'—':users.length}</strong><small>Compared with this device</small></article><article className={eligible.length?'needs-action':''}><span>Ready to push</span><strong>{loading?'—':eligible.length}</strong><small>{eligible.length?'Missing or ready users':'Device is up to date'}</small></article><article><span>Queued</span><strong>{loading?'—':queuedUsers}</strong><small>{ineligibleUsers} ineligible IDs</small></article></div>
    <div className="device-user-workspace">
      <div className="section-heading"><div><span>User reconciliation</span><h3>Device user comparison</h3><p>Select a device, check its users, then push eligible workforce accounts that are missing.</p></div><div className="device-user-push-actions"><label><span>Attendance device</span><select value={deviceId} onChange={(event)=>setDeviceId(event.target.value)}><option value="">{devices.length?'Select a device':'No devices available'}</option>{devices.map((device)=><option key={device.id} value={device.id}>{device.name}</option>)}</select></label>{permission?.update&&<button type="button" onClick={checkUsers} disabled={!deviceId||checking||['pending','running'].includes(check?.status)}>{checking||['pending','running'].includes(check?.status)?'Checking…':'Check device'}</button>}{permission?.update&&<button className="primary-action" type="button" onClick={pushUsers} disabled={!deviceId||!eligible.length||pushing}>{pushing?'Queueing…':`Push ${eligible.length} user${eligible.length===1?'':'s'}`}</button>}</div></div>
      <div className="device-user-guide"><i>1</i><span><strong>Check before pushing</strong><small>The check compares employee IDs with device UIDs. Users already on the device are skipped automatically.</small></span></div>
      {check?.status==='completed'&&<p className="device-user-message success">Last check found {check.usersFound} device users and queued {check.usersQueued} missing site users.</p>}{check?.status==='failed'&&<p className="device-user-message form-error">Check failed: {check.error}</p>}
      <div className="device-user-list"><div className="device-user-list-head"><span>Employee</span><span>Device role</span><span>Sync status</span></div>{users.map((user)=><article key={user.id}><div><i>{user.firstName[0]}{user.lastName[0]}</i><span><strong>{user.firstName} {user.lastName}</strong><small>Employee ID / UID: {user.employeeId}</small></span></div><span>Normal User</span><b className={user.eligible?(user.status||'ready'):'ineligible'}>{user.eligible?(user.status||'Ready'):'Ineligible ID'}</b>{user.error&&<small>{user.error}</small>}</article>)}{!loading&&deviceId&&!users.length&&<div className="device-user-empty"><i>✓</i><strong>This device is up to date</strong><small>No eligible workforce users are missing.</small></div>}{!loading&&!deviceId&&<div className="device-user-empty"><i>⌕</i><strong>Select an attendance device</strong><small>User comparison results will appear here.</small></div>}{loading&&<div className="device-user-empty"><i>↻</i><strong>Loading device users…</strong><small>Comparing workforce and device records.</small></div>}</div>
    </div>
  </section>;
}

function ModulePlaceholder({ moduleKey, category = 'Module' }) {
  const [title, description] = moduleCopy[moduleKey];
  return <section className="overview-view"><div className="module-title"><div><span>{category}</span><h1>{title}</h1><p>{description}</p></div></div><div className="module-placeholder"><strong>Coming soon</strong><p>Your access is configured and this module has a clear landing page while its workflows are built.</p></div></section>;
}

function Requests({ user }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewingRequestId, setReviewingRequestId] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => { const today=new Date(); return new Date(today.getFullYear(),today.getMonth(),1); });
  const [, setMessage] = useModalMessage();
  const permission = effectiveModulePermission(user, 'requests');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/requests', { signal:controller.signal, cache:'no-store' })
      .then(async (response) => { const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to load employee requests.'); setRequests(data.requests||[]); })
      .catch((error) => { if(error.name!=='AbortError')setMessage(error.message); })
      .finally(() => { if(!controller.signal.aborted)setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!calendarOpen) return undefined;
    const closeOnEscape = (event) => { if(event.key==='Escape')setCalendarOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [calendarOpen]);

  async function reviewRequest(employeeRequest, status) {
    const approving = status === 'approved';
    const requestName = `${leaveTypeLabels[employeeRequest.leaveType]||'Leave'} request`;
    const message = approving
      ? `Approve ${employeeName(employeeRequest)}'s ${requestName}? Reserved leave credits will remain deducted.`
      : `Reject ${employeeName(employeeRequest)}'s ${requestName}? Reserved leave credits will be restored.`;
    if (!await confirmModal(message, approving?'Approve employee request?':'Reject employee request?')) return;
    setReviewingRequestId(employeeRequest.id);
    setMessage('');
    try {
      const response = await fetch(`/api/requests/${employeeRequest.requestType}/${employeeRequest.id}/review`, {
        method:'PATCH', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ status })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error||'Unable to review the employee request.');
      setRequests((current)=>current.map((item)=>item.id===employeeRequest.id&&item.requestType===employeeRequest.requestType?{...item,status:data.request.status,reviewedAt:data.request.reviewedAt}:item));
      setMessage(`Employee request ${status} successfully.`);
    } catch (error) { setMessage(error.message); }
    finally { setReviewingRequestId(null); }
  }

  const pendingCount = requests.filter((request)=>request.status==='pending').length;
  const approvedCount = requests.filter((request)=>request.status==='approved').length;
  const closedCount = requests.filter((request)=>['rejected','cancelled'].includes(request.status)).length;
  const calendarStart = new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1-calendarMonth.getDay());
  const calendarDates = Array.from({length:42},(_,index)=>{const date=new Date(calendarStart);date.setDate(calendarStart.getDate()+index);return {date,value:localDateValue(date),outside:date.getMonth()!==calendarMonth.getMonth()};});
  const calendarTitle = calendarMonth.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const statusLabel = (status) => status==='pending'?'Requested':status==='cancelled'?'Withdrawn':status[0].toUpperCase()+status.slice(1);

  return <section className="overview-view manager-requests-view">
    <div className="module-title"><div><span>Timetracking</span><h1>Requests</h1><p>Review requests routed to you for approval.</p></div><button className="view-request-calendar" type="button" onClick={()=>setCalendarOpen(true)}>View Calendar</button></div>
    <div className="manager-request-summary"><article><span>Pending</span><strong>{loading?'—':pendingCount}</strong></article><article><span>Approved</span><strong>{loading?'—':approvedCount}</strong></article><article><span>Rejected or withdrawn</span><strong>{loading?'—':closedCount}</strong></article></div>
    <section className="leave-review-card"><div className="leave-request-heading"><span>Employee requests</span><h2>Submitted requests</h2><p>Pending requests can be approved or rejected. Leave credits are restored automatically when a request is rejected.</p></div><div className="leave-review-table"><div className="leave-review-row manager-request-row leave-review-head"><span>Employee</span><span>Request</span><span>Date range</span><span>Filed</span><span>Status</span><span>Action</span></div>{requests.map((employeeRequest)=><div className="leave-review-row manager-request-row" key={`${employeeRequest.requestType}-${employeeRequest.id}`}><div><strong>{employeeName(employeeRequest)}</strong><small>{employeeRequest.employeeNumber}{employeeRequest.department?` · ${employeeRequest.department}`:''}</small></div><span>{leaveTypeLabels[employeeRequest.leaveType]||'Leave Request'}<small>{Number(employeeRequest.requestedDays).toLocaleString(undefined,{maximumFractionDigits:2})} {Number(employeeRequest.requestedDays)===1?'day':'days'}</small></span><span>{formatLeaveRequestRange(employeeRequest)}</span><span>{new Date(employeeRequest.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span><b className={`leave-request-status status-${employeeRequest.status}`}>{employeeRequest.status==='cancelled'?'Withdrawn':employeeRequest.status}</b><div>{employeeRequest.status==='pending'&&permission?.update?<><button className="approve-leave" type="button" onClick={()=>reviewRequest(employeeRequest,'approved')} disabled={reviewingRequestId===employeeRequest.id}>{reviewingRequestId===employeeRequest.id?'Saving…':'Approve'}</button><button className="reject-leave" type="button" onClick={()=>reviewRequest(employeeRequest,'rejected')} disabled={reviewingRequestId===employeeRequest.id}>Reject</button></>:<span>—</span>}</div></div>)}{loading&&<div className="leave-review-empty"><strong>Loading employee requests…</strong></div>}{!loading&&!requests.length&&<div className="leave-review-empty"><strong>No submitted requests found.</strong></div>}</div></section>
    {calendarOpen&&<div className="request-calendar-modal" role="dialog" aria-modal="true" aria-labelledby="request-calendar-title"><button className="request-calendar-scrim" type="button" onClick={()=>setCalendarOpen(false)} aria-label="Close leave calendar" /><section className="request-calendar-dialog"><header><div><span>Employee leave schedule</span><h2 id="request-calendar-title">Leave Request Calendar</h2></div><button type="button" onClick={()=>setCalendarOpen(false)} aria-label="Close">×</button></header><div className="request-calendar-toolbar"><button type="button" onClick={()=>setCalendarMonth((current)=>new Date(current.getFullYear(),current.getMonth()-1,1))} aria-label="Previous month">‹</button><strong>{calendarTitle}</strong><button type="button" onClick={()=>setCalendarMonth((current)=>new Date(current.getFullYear(),current.getMonth()+1,1))} aria-label="Next month">›</button></div><div className="request-calendar-legend">{[['pending','Requested'],['approved','Approved'],['cancelled','Withdrawn'],['rejected','Rejected']].map(([status,label])=><span className={`calendar-status-${status}`} key={status}><i />{label}</span>)}</div><div className="request-calendar-grid">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day)=><strong className="request-calendar-weekday" key={day}>{day}</strong>)}{calendarDates.map((calendarDate)=>{const calendarDayName=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][calendarDate.date.getDay()];const dayRequests=requests.filter((employeeRequest)=>employeeRequest.startDate<=calendarDate.value&&employeeRequest.endDate>=calendarDate.value&&(employeeRequest.workDays||['monday','tuesday','wednesday','thursday','friday']).includes(calendarDayName));return <article className={calendarDate.outside?'outside-month':''} key={calendarDate.value}><time dateTime={calendarDate.value}>{calendarDate.date.getDate()}</time><div>{dayRequests.map((employeeRequest)=><span className={`request-calendar-event calendar-status-${employeeRequest.status}`} title={`${employeeName(employeeRequest)} · ${leaveTypeLabels[employeeRequest.leaveType]} · ${statusLabel(employeeRequest.status)}`} key={`${employeeRequest.requestType}-${employeeRequest.id}-${calendarDate.value}`}><strong>{employeeName(employeeRequest)}</strong><small>{leaveTypeLabels[employeeRequest.leaveType]} · {statusLabel(employeeRequest.status)}</small></span>)}</div></article>;})}</div></section></div>}
  </section>;
}

function LeaveApplication({ user }) {
  const [employee, setEmployee] = useState(null);
  const [leaveBalances, setLeaveBalances] = useState(null);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [approvalRequests, setApprovalRequests] = useState([]);
  const [leaveType, setLeaveType] = useState('vacation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawingRequestId, setWithdrawingRequestId] = useState(null);
  const [reviewingRequestId, setReviewingRequestId] = useState(null);
  const [, setMessage] = useModalMessage();
  const permission = effectiveModulePermission(user, 'leave_application');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/leave-requests/me', { signal:controller.signal, cache:'no-store' })
      .then(async (response) => { const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to load your leave information.'); setEmployee(data.employee); setLeaveBalances(data.leaveBalances); setLeaveRequests(data.requests||[]); setApprovalRequests(data.approvals||[]); })
      .catch((error) => { if(error.name!=='AbortError')setMessage(error.message); })
      .finally(() => { if(!controller.signal.aborted)setLoading(false); });
    return () => controller.abort();
  }, []);

  const rangeValid = Boolean(startDate&&endDate&&startDate<=endDate);
  const calendarDays = rangeValid ? Math.round((new Date(`${endDate}T00:00:00Z`)-new Date(`${startDate}T00:00:00Z`))/86400000)+1 : 0;
  const requestedDays = rangeValid ? countWorkingDays(startDate,endDate,employee?.workDays) : 0;
  const excludedRestDays = calendarDays-requestedDays;
  const selectedBalanceKey = `${leaveType}Leave`;

  async function fileLeaveRequest(event) {
    event.preventDefault();
    if (!rangeValid) return setMessage('End date must be on or after the start date.');
    if (!requestedDays) return setMessage('The selected range contains only rest days.');
    if (requestedDays > Number(leaveBalances?.[selectedBalanceKey]??0)) return setMessage(`This request exceeds your available ${leaveType} leave credits.`);
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/leave-requests', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ leaveType, startDate, endDate })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error||'Unable to file your leave request.');
      setLeaveRequests((current) => [data.request, ...current]);
      setLeaveBalances(data.balances);
      setStartDate('');
      setEndDate('');
      setMessage('Leave request filed successfully.');
    } catch (error) { setMessage(error.message); }
    finally { setSubmitting(false); }
  }

  async function withdrawLeaveRequest(leaveRequest) {
    if (!await confirmModal(`Withdraw your ${leaveTypeLabels[leaveRequest.leaveType]} request for ${formatLeaveRequestRange(leaveRequest)}?`, 'Withdraw leave request?')) return;
    setWithdrawingRequestId(leaveRequest.id);
    setMessage('');
    try {
      const response = await fetch(`/api/leave-requests/${leaveRequest.id}/withdraw`, { method:'PATCH' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error||'Unable to withdraw your leave request.');
      setLeaveRequests((current) => current.map((item) => item.id===leaveRequest.id ? { ...item, status:data.request.status } : item));
      if (data.balances) setLeaveBalances(data.balances);
      setMessage('Leave request withdrawn successfully.');
    } catch (error) { setMessage(error.message); }
    finally { setWithdrawingRequestId(null); }
  }

  async function reviewLeaveRequest(leaveRequest, status) {
    const approving = status==='approved';
    const message = approving
      ? `Approve ${employeeName(leaveRequest)}'s ${leaveTypeLabels[leaveRequest.leaveType]} request? The reserved credits will remain deducted.`
      : `Reject ${employeeName(leaveRequest)}'s ${leaveTypeLabels[leaveRequest.leaveType]} request and restore the reserved credits?`;
    if (!await confirmModal(message, approving?'Approve leave request?':'Reject leave request?')) return;
    setReviewingRequestId(leaveRequest.id);
    setMessage('');
    try {
      const response = await fetch(`/api/leave-requests/${leaveRequest.id}/review`, {
        method:'PATCH',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ status })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error||'Unable to review the leave request.');
      setApprovalRequests((current)=>current.map((item)=>item.id===leaveRequest.id?{...item,status:data.request.status}:item));
      setMessage(`Leave request ${status} successfully.`);
    } catch (error) { setMessage(error.message); }
    finally { setReviewingRequestId(null); }
  }

  const selectedBalance=Number(leaveBalances?.[selectedBalanceKey]??0);
  const remainingAfterRequest=selectedBalance-requestedDays;
  const pendingRequests=leaveRequests.filter((request)=>request.status==='pending').length;

  return <section className="overview-view leave-application-view friendly-leave-application">
    <div className="module-title"><div><span>Timetracking</span><h1>Leave Application</h1><p>Review your available credits and file a leave request.</p></div></div>
    <section className="leave-credit-section"><div className="leave-credit-heading"><span>Available balance</span><h2>{employee?`${employeeName(employee)}'s remaining leave credits`:'Remaining leave credits'}</h2></div><div className="leave-credit-cards">{leaveBalanceFields.map(([key,label])=>{const credit=leaveBalances?.[key];return <article key={key}><span>{label} leave</span><strong>{loading||credit==null?'—':Number(credit).toLocaleString(undefined,{maximumFractionDigits:2})}</strong><small>{loading||credit==null?'Balance unavailable':Number(credit)===1?'day remaining':'days remaining'}</small></article>;})}</div></section>
    <section className="leave-application-workspace"><div className="leave-request-card"><div className="leave-request-heading"><span>New request</span><h2>Plan your leave</h2><p>Complete the three steps below. Only scheduled workdays consume credits.</p></div><form onSubmit={fileLeaveRequest}>
      <section className="leave-form-step"><header><b>1</b><span><strong>Choose a leave type</strong><small>Your available balance updates automatically.</small></span></header><div className="leave-type-options">{[['vacation','Vacation','Planned time away'],['sick','Sick','Rest and recovery'],['emergency','Emergency','Unexpected absence']].map(([value,label,description])=><label className={leaveType===value?'selected':''} key={value}><input type="radio" name="leaveType" value={value} checked={leaveType===value} onChange={(event)=>setLeaveType(event.target.value)} disabled={submitting}/><i>{value==='vacation'?'☀':value==='sick'?'✚':'!'}</i><span><strong>{label}</strong><small>{description}</small></span><b>{Number(leaveBalances?.[`${value}Leave`]??0).toLocaleString(undefined,{maximumFractionDigits:2})} days</b></label>)}</div></section>
      <section className="leave-form-step"><header><b>2</b><span><strong>Select your dates</strong><small>The date range is inclusive.</small></span></header><div className="leave-request-dates"><label><span>First day of leave</span><input type="date" value={startDate} max={endDate||undefined} onChange={(event)=>setStartDate(event.target.value)} disabled={submitting} required /></label><i>→</i><label><span>Last day of leave</span><input type="date" value={endDate} min={startDate||undefined} onChange={(event)=>setEndDate(event.target.value)} disabled={submitting} required /></label></div></section>
      <section className="leave-form-step leave-review-step"><header><b>3</b><span><strong>Review and submit</strong><small>Your credits are reserved after filing.</small></span></header>{startDate&&endDate?<div className={rangeValid&&requestedDays?'leave-request-summary':'form-error'}>{!rangeValid?'End date must be on or after the start date.':!requestedDays?'The selected range contains only rest days.':<><strong>{requestedDays} working {requestedDays===1?'day':'days'}</strong><span>{excludedRestDays?`${excludedRestDays} rest ${excludedRestDays===1?'day is':'days are'} excluded.`:'No rest days fall within this range.'}</span></>}</div>:<div className="leave-request-placeholder">Select a start and end date to see your request summary.</div>}</section>
      {permission?.create?<button className="primary-action leave-submit-button" type="submit" disabled={loading||submitting||!rangeValid||!requestedDays||remainingAfterRequest<0}>{submitting?'Filing request…':remainingAfterRequest<0?'Insufficient leave credits':'Submit leave request'}</button>:<p className="rbac-message">You have view-only access to leave applications.</p>}
    </form></div><aside className="leave-application-summary"><span>Request summary</span><h3>{leaveTypeLabels[leaveType]}</h3><div className="leave-summary-balance"><small>Available balance</small><strong>{loading?'—':selectedBalance.toLocaleString(undefined,{maximumFractionDigits:2})}<i> days</i></strong></div><dl><div><dt>Requested</dt><dd>{requestedDays||0} days</dd></div><div><dt>Rest days excluded</dt><dd>{excludedRestDays>0?excludedRestDays:0}</dd></div><div className={remainingAfterRequest<0?'insufficient':''}><dt>Balance after filing</dt><dd>{rangeValid?remainingAfterRequest:selectedBalance} days</dd></div></dl><div className="leave-approval-route"><i>✓</i><span><strong>Approval route</strong><small>Your request will be sent to your primary direct manager.</small></span></div><div className="leave-pending-count"><span>Pending requests</span><strong>{pendingRequests}</strong></div></aside></section>
    <section className="submitted-leave-card"><div className="leave-request-heading"><span>Request history</span><h2>Submitted requests</h2><p>Track the status of your leave applications and withdraw pending requests.</p></div><div className="submitted-leave-table"><div className="submitted-leave-row submitted-leave-head"><span>Leave type</span><span>Date range</span><span>Days</span><span>Filed</span><span>Status</span><span>Action</span></div>{leaveRequests.map((leaveRequest)=><div className="submitted-leave-row" key={leaveRequest.id}><strong>{leaveTypeLabels[leaveRequest.leaveType]||leaveRequest.leaveType}</strong><span>{formatLeaveRequestRange(leaveRequest)}</span><span>{Number(leaveRequest.requestedDays).toLocaleString(undefined,{maximumFractionDigits:2})}</span><time>{new Date(leaveRequest.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time><b className={`leave-request-status status-${leaveRequest.status}`}>{leaveRequest.status==='cancelled'?'Withdrawn':leaveRequest.status}</b><div>{leaveRequest.status==='pending'&&permission?.update?<button type="button" onClick={()=>withdrawLeaveRequest(leaveRequest)} disabled={withdrawingRequestId===leaveRequest.id}>{withdrawingRequestId===leaveRequest.id?'Withdrawing…':'Withdraw'}</button>:<span>—</span>}</div></div>)}{!loading&&!leaveRequests.length&&<div className="submitted-leave-empty"><strong>No leave requests submitted yet.</strong></div>}{loading&&<div className="submitted-leave-empty"><strong>Loading submitted requests…</strong></div>}</div></section>
    {approvalRequests.length>0&&<section className="leave-review-card"><div className="leave-request-heading"><span>Routed approvals</span><h2>Requests for your approval</h2><p>These requests were routed to you as the employee's department manager or as an HR Manager fallback.</p></div><div className="leave-review-table"><div className="leave-review-row leave-review-head"><span>Employee</span><span>Leave type</span><span>Date range</span><span>Days</span><span>Status</span><span>Action</span></div>{approvalRequests.map((leaveRequest)=><div className="leave-review-row" key={leaveRequest.id}><div><strong>{employeeName(leaveRequest)}</strong><small>{leaveRequest.employeeNumber}</small></div><span>{leaveTypeLabels[leaveRequest.leaveType]||leaveRequest.leaveType}</span><span>{formatLeaveRequestRange(leaveRequest)}</span><span>{Number(leaveRequest.requestedDays).toLocaleString(undefined,{maximumFractionDigits:2})}</span><b className={`leave-request-status status-${leaveRequest.status}`}>{leaveRequest.status==='cancelled'?'Withdrawn':leaveRequest.status}</b><div>{leaveRequest.status==='pending'&&permission?.update?<><button className="approve-leave" type="button" onClick={()=>reviewLeaveRequest(leaveRequest,'approved')} disabled={reviewingRequestId===leaveRequest.id}>{reviewingRequestId===leaveRequest.id?'Saving…':'Approve'}</button><button className="reject-leave" type="button" onClick={()=>reviewLeaveRequest(leaveRequest,'rejected')} disabled={reviewingRequestId===leaveRequest.id}>Reject</button></>:<span>—</span>}</div></div>)}</div></section>}
  </section>;
}

function formatLeaveRequestRange(leaveRequest) {
  const format = (value) => new Date(`${String(value).slice(0,10)}T00:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  return `${format(leaveRequest.startDate)} – ${format(leaveRequest.endDate)}`;
}

function ShiftCalendarModule({ moduleKey }) {
  const today = new Date();
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const [startDate, setStartDate] = useState(localDateValue(weekStart));
  const [endDate, setEndDate] = useState(localDateValue(weekEnd));
  const [employee, setEmployee] = useState(null);
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useModalMessage('error');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setEmployee(null);
    setShift(null);
    setError('');
    fetch(`/api/time-tracking/my-shift-calendar/${moduleKey}`, { signal:controller.signal, cache:'no-store' })
      .then(async (response) => { const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to load your shift calendar.'); setEmployee(data.employee); setShift(data.shift); })
      .catch((loadError) => { if(loadError.name!=='AbortError')setError(loadError.message); })
      .finally(() => { if(!controller.signal.aborted)setLoading(false); });
    return () => controller.abort();
  }, [moduleKey]);

  const [title, description] = moduleCopy[moduleKey];
  const rangeError = startDate && endDate && startDate > endDate ? 'End date must be on or after the start date.' : '';
  const calendarDays = rangeError ? [] : datesInRange(startDate, endDate);
  const leadingDays = calendarDays.length ? new Date(`${calendarDays[0].value}T00:00:00`).getDay() : 0;
  const shiftRange = shift ? `${formatShiftTime(shift.startTime)}–${formatShiftTime(shift.endTime)}` : '';
  const weekdayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return <section className="overview-view shift-calendar-view">
    <div className="module-title"><div><span>Timetracking</span><h1>{title}</h1><p>{description}</p></div></div>
    <section className="shift-calendar-card">
      <div className="shift-calendar-heading"><div><span>Your shift calendar</span><h2>{employee?employeeName(employee):'Employee schedule'}</h2><p>{shift?`${shiftRange} on assigned working days.`:'No shift is currently assigned to your employee profile.'}</p></div><div className="date-range-controls"><label><span>From</span><input type="date" value={startDate} onChange={(event)=>setStartDate(event.target.value)} /></label><i>to</i><label><span>To</span><input type="date" value={endDate} onChange={(event)=>setEndDate(event.target.value)} /></label></div></div>
      {rangeError&&<p className="rbac-message" role="alert">{rangeError}</p>}
      {error&&<p className="shift-calendar-message form-error" role="alert">{error}</p>}
      {!rangeError&&!error&&<><div className="shift-calendar-summary"><span>{loading?'Loading your schedule…':`${calendarDays.length} ${calendarDays.length===1?'day':'days'} selected`}</span><span>{employee?.employeeNumber?`Employee ID ${employee.employeeNumber}`:''}</span></div><div className="shift-calendar-grid">{weekdayLabels.map((day)=><strong className="shift-calendar-weekday" key={day}>{day}</strong>)}{Array.from({length:leadingDays},(_,index)=><i className="shift-calendar-blank" key={`blank-${index}`} />)}{!loading&&calendarDays.map((date)=>{const scheduled=Boolean(shift?.workDays?.includes(date.dayName));return <article className={scheduled?'scheduled':'rest-day'} key={date.value}><time dateTime={date.value}><b>{date.weekday}</b><strong>{new Date(`${date.value}T00:00:00`).getDate()}</strong><small>{new Date(`${date.value}T00:00:00`).toLocaleDateString(undefined,{month:'short'})}</small></time><div><span>{shift?(scheduled?'Assigned shift':'Rest day'):'No shift assigned'}</span><strong>{scheduled?shiftRange:'—'}</strong></div></article>;})}</div></>}
    </section>
  </section>;
}

function Timetracking({ user, onNavigate }) {
  const canView=(moduleKey)=>Boolean(effectiveModulePermission(user,moduleKey)?.view);
  return <section className="overview-view"><div className="module-title"><div><span>Workforce time</span><h1>Timetracking</h1><p>Review attendance and employee requests.</p></div></div><div className="module-grid">{canView('time_entries')&&<button type="button" onClick={() => onNavigate('time_entries')}><strong>Time Entries</strong><span>Open submodule →</span></button>}{canView('exemption_report')&&<button type="button" onClick={() => onNavigate('exemption_report')}><strong>Exemption Report</strong><span>Open submodule →</span></button>}{canView('requests')&&<button type="button" onClick={() => onNavigate('requests')}><strong>Requests</strong><span>Open submodule →</span></button>}{canView('leave_application')&&<button type="button" onClick={() => onNavigate('leave_application')}><strong>Leave Application</strong><span>Open submodule →</span></button>}{canView('overtime_request')&&<button type="button" onClick={() => onNavigate('overtime_request')}><strong>Overtime Request</strong><span>Open submodule →</span></button>}{canView('shift_change')&&<button type="button" onClick={() => onNavigate('shift_change')}><strong>Shift Change</strong><span>Open submodule →</span></button>}</div></section>;
}

function ShiftManagement({ user }) {
  const weekdays = [['monday','Mon'],['tuesday','Tue'],['wednesday','Wed'],['thursday','Thu'],['friday','Fri'],['saturday','Sat'],['sunday','Sun']];
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [shiftType, setShiftType] = useState('eight_to_five');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [workDays, setWorkDays] = useState(['monday','tuesday','wednesday','thursday','friday']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useModalMessage();
  const permission = effectiveModulePermission(user,'shift_management');

  useEffect(() => {
    fetch('/api/time-tracking/shifts')
      .then(async (response) => { const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to load shifts.'); setEmployees(data.employees); if(data.employees.length)setEmployeeId(String(data.employees[0].id)); })
      .catch((loadError) => setMessage(loadError.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const employee = employees.find((item) => String(item.id) === employeeId);
    const nextType = employee?.shiftType || 'eight_to_five';
    setShiftType(nextType);
    setStartTime(employee?.startTime || (nextType === 'nine_to_six' ? '09:00' : '08:00'));
    setEndTime(employee?.endTime || (nextType === 'nine_to_six' ? '18:00' : '17:00'));
    setWorkDays(employee?.workDays || ['monday','tuesday','wednesday','thursday','friday']);
  }, [employeeId, employees]);

  function chooseShift(value) {
    setShiftType(value);
    if (value === 'eight_to_five') { setStartTime('08:00'); setEndTime('17:00'); }
    if (value === 'nine_to_six') { setStartTime('09:00'); setEndTime('18:00'); }
  }

  async function assignShift(event) {
    event.preventDefault(); setMessage('');
    if (startTime >= endTime) { setMessage('Shift end time must be after its start time.'); return; }
    if (!workDays.length) { setMessage('Select at least one working day.'); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/time-tracking/shifts/${employeeId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ shiftType, startTime, endTime, workDays }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to assign shift.');
      setEmployees((current) => current.map((employee) => String(employee.id) === employeeId ? { ...employee, ...data.assignment } : employee));
      setMessage('Shift assigned successfully.');
    } catch (saveError) { setMessage(saveError.message); }
    finally { setSaving(false); }
  }

  const selectedEmployee = employees.find((employee) => String(employee.id) === employeeId);
  const assignedEmployees = employees.filter((employee)=>employee.shiftType).length;
  const unassignedEmployees = employees.length-assignedEmployees;
  const shiftHours = startTime&&endTime&&startTime<endTime ? ((new Date(`2000-01-01T${endTime}`)-new Date(`2000-01-01T${startTime}`))/3600000) : 0;
  const selectedWorkDayLabels = weekdays.filter(([value])=>workDays.includes(value)).map(([,label])=>label).join(', ');
  const assignmentChanged = Boolean(selectedEmployee)&&(
    (selectedEmployee.shiftType||'eight_to_five')!==shiftType ||
    String(selectedEmployee.startTime||'08:00').slice(0,5)!==startTime ||
    String(selectedEmployee.endTime||'17:00').slice(0,5)!==endTime ||
    JSON.stringify(selectedEmployee.workDays||['monday','tuesday','wednesday','thursday','friday'])!==JSON.stringify(workDays)
  );
  return <section className="overview-view shift-management-view friendly-shift-management">
    <div className="module-title"><div><span>Setup</span><h1>Shift Management</h1><p>Choose an employee and define when they are expected to work.</p></div></div>
    <div className="shift-management-overview"><article><span>Active employees</span><strong>{loading?'—':employees.length}</strong><small>Available for scheduling</small></article><article><span>Assigned shifts</span><strong>{loading?'—':assignedEmployees}</strong><small>Employees with schedules</small></article><article className={unassignedEmployees?'needs-attention':''}><span>Without shifts</span><strong>{loading?'—':unassignedEmployees}</strong><small>{unassignedEmployees?'Require schedule assignment':'Everyone has a schedule'}</small></article><article className={assignmentChanged?'has-changes':''}><span>Current form</span><strong className="shift-form-state">{assignmentChanged?'Unsaved':'Up to date'}</strong><small>{assignmentChanged?'Save to apply changes':'No pending changes'}</small></article></div>
    <form className="shift-assignment-form friendly-shift-form" onSubmit={assignShift}>
      <section className="shift-employee-step"><div className="shift-step-heading"><b>1</b><span><strong>Choose an employee</strong><small>Select the person whose work schedule you want to manage.</small></span></div><label><span>Employee *</span><select value={employeeId} onChange={(event)=>setEmployeeId(event.target.value)} disabled={loading||saving} required><option value="">{loading?'Loading employees…':'Select an employee'}</option>{employees.map((employee)=><option key={employee.id} value={employee.id}>{employeeName(employee)} · {employee.employeeNumber} · {employee.department||'No department'}</option>)}</select></label>{selectedEmployee&&<div className="shift-selected-employee"><i>{selectedEmployee.firstName[0]}{selectedEmployee.lastName[0]}</i><span><strong>{employeeName(selectedEmployee)}</strong><small>{selectedEmployee.jobTitle||'No position'} · {selectedEmployee.department||'No department'}</small></span><b>{selectedEmployee.shiftType?'Shift assigned':'No shift yet'}</b></div>}</section>
      <section className="shift-schedule-step"><div className="shift-step-heading"><b>2</b><span><strong>Choose a shift</strong><small>Use a standard schedule or define a custom time range.</small></span></div><fieldset className="shift-type-options"><legend>Shift schedule</legend><label><input type="radio" name="shiftType" value="eight_to_five" checked={shiftType==='eight_to_five'} onChange={(event)=>chooseShift(event.target.value)}/><span><strong>8:00 AM – 5:00 PM</strong><small>Standard day shift · 9 hours</small></span></label><label><input type="radio" name="shiftType" value="nine_to_six" checked={shiftType==='nine_to_six'} onChange={(event)=>chooseShift(event.target.value)}/><span><strong>9:00 AM – 6:00 PM</strong><small>Late day shift · 9 hours</small></span></label><label><input type="radio" name="shiftType" value="custom" checked={shiftType==='custom'} onChange={(event)=>chooseShift(event.target.value)}/><span><strong>Custom shift</strong><small>Set a different start and end time</small></span></label></fieldset>{shiftType==='custom'&&<div className="custom-shift-range"><label><span>Starts at</span><input type="time" value={startTime} onChange={(event)=>setStartTime(event.target.value)} required/></label><i>to</i><label><span>Ends at</span><input type="time" value={endTime} onChange={(event)=>setEndTime(event.target.value)} required/></label></div>}</section>
      <section className="shift-days-step"><div className="shift-step-heading"><b>3</b><span><strong>Select working days</strong><small>Unchecked days will appear as rest days in the employee calendar.</small></span></div><fieldset className="work-days-fieldset"><legend>Working days</legend>{weekdays.map(([value,label])=><label key={value}><input type="checkbox" checked={workDays.includes(value)} onChange={(event)=>setWorkDays((current)=>event.target.checked?[...current,value]:current.filter((day)=>day!==value))}/><span><strong>{label}</strong></span></label>)}</fieldset></section>
      {selectedEmployee&&<div className="shift-assignment-summary"><div><span>Schedule preview</span><strong>{formatShiftTime(startTime)} – {formatShiftTime(endTime)}</strong><small>{shiftHours.toLocaleString(undefined,{maximumFractionDigits:2})} hours · {workDays.length} working {workDays.length===1?'day':'days'} per week</small></div><p>{selectedWorkDayLabels||'No working days selected'}</p></div>}
      {message&&<p className={`shift-feedback ${message.includes('successfully')?'success':'error'}`} role="status">{message}</p>}
      <div className="shift-form-actions">{!permission?.update?<p className="rbac-message">You have view-only access to shift assignments.</p>:<><small>{assignmentChanged?'You have unsaved schedule changes.':'Select an employee and adjust their schedule.'}</small><button className="primary-action" type="submit" disabled={!employeeId||saving||!assignmentChanged}>{saving?'Saving schedule…':'Save shift assignment'}</button></>}</div>
    </form>
  </section>;
}

function ExemptionReport() {
  const today=new Date(),initialMonday=new Date(today);initialMonday.setDate(today.getDate()-(today.getDay()===0?6:today.getDay()-1));
  const [view,setView]=useState('week');
  const [weekStart,setWeekStart]=useState(localDateValue(initialMonday));
  const [month,setMonth]=useState(localDateValue(new Date()).slice(0,7));
  const [report,setReport]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useModalMessage('error');
  const weekEndDate=new Date(`${weekStart}T00:00:00`);weekEndDate.setDate(weekEndDate.getDate()+6);const weekEnd=localDateValue(weekEndDate);
  useEffect(()=>{const controller=new AbortController();setLoading(true);const query=view==='week'?`startDate=${weekStart}&endDate=${weekEnd}`:`month=${month}`;fetch(`/api/time-tracking/exemption-report?${query}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load the exemption report.');setReport(data);setError('');}).catch(loadError=>{if(loadError.name!=='AbortError')setError(loadError.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[view,month,weekStart,weekEnd]);
  const summary=report?.summary||{};
  const employeeRows=(report?.employees||[]).map(employee=>{const records=(report?.days||[]).flatMap(day=>day.records.filter(record=>String(record.employeeId)===String(employee.id)).map(record=>({date:day.date,exceptions:record.exceptions})));const exceptions=records.flatMap(record=>record.exceptions);return {...employee,records,counts:{absent:exceptions.filter(value=>value==='Absent').length,late:exceptions.filter(value=>value.startsWith('Late')).length,incomplete:exceptions.filter(value=>value==='Incomplete').length,undertime:exceptions.filter(value=>value==='Undertime').length,break:exceptions.filter(value=>value.toLowerCase().includes('break')).length,total:exceptions.length}};});
  const periodLabel=view==='week'?`${new Date(`${weekStart}T00:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${new Date(`${weekEnd}T00:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`:new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined,{month:'long',year:'numeric'});
  return <section className="overview-view exemption-report-view"><div className="module-title"><div><span>Timetracking</span><h1>Exemption Report</h1><p>Review each employee's consolidated time-entry exemptions by week or month.</p></div><div className="report-period-controls"><div><button className={view==='week'?'active':''} type="button" onClick={()=>setView('week')}>Weekly</button><button className={view==='month'?'active':''} type="button" onClick={()=>setView('month')}>Monthly</button></div>{view==='week'?<label className="report-month"><span>Week starting</span><input type="date" value={weekStart} onChange={event=>setWeekStart(event.target.value)}/></label>:<label className="report-month"><span>Report month</span><input type="month" value={month} onChange={event=>setMonth(event.target.value)}/></label>}</div></div>
    <div className="exemption-summary">{[['Total exemptions',summary.total],['Absences',summary.absent],['Late entries',summary.late],['Incomplete',summary.incomplete],['Undertime',summary.undertime],['Break issues',summary.break]].map(([label,value])=><article key={label}><span>{label}</span><strong>{loading?'—':value||0}</strong><small>{summary.employees||0} active employees</small></article>)}</div>
    <section className="exemption-report-card"><div className="friendly-table-heading"><div><span>Employee {view==='week'?'weekly':'monthly'} view</span><h2>{periodLabel}</h2></div><small>{loading?'Loading report…':`${employeeRows.length} employees · ${summary.scheduledDays||0} scheduled employee-days`}</small></div>{error&&<p className="rbac-message">{error}</p>}<div className="exemption-report-table"><div className="exemption-report-row exemption-report-head"><span>Employee</span><span>Absent</span><span>Late</span><span>Incomplete</span><span>Undertime</span><span>Break</span><span>Total</span><span>Affected dates</span></div>{!loading&&employeeRows.map(employee=><div className={`exemption-report-row${employee.counts.total?' has-exemptions':''}`} key={employee.id}><div><strong>{employee.employeeName}</strong><small>{employee.employeeNumber}</small></div><b>{employee.counts.absent}</b><b>{employee.counts.late}</b><b>{employee.counts.incomplete}</b><b>{employee.counts.undertime}</b><b>{employee.counts.break}</b><strong>{employee.counts.total}</strong><div className="exemption-employee-list">{employee.records.length?employee.records.map(record=><span key={record.date}><strong>{new Date(`${record.date}T00:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</strong><small>{record.exceptions.join(' · ')}</small></span>):<i>Clear for this month</i>}</div></div>)}</div>{loading&&<div className="time-entry-empty-state"><strong>Loading monthly exemptions…</strong></div>}</section>
  </section>;
}

function TimeEntries({ user }) {
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showEmployeeSelector, setShowEmployeeSelector] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showEmployeeResults, setShowEmployeeResults] = useState(false);
  const [timeEntries, setTimeEntries] = useState([]);
  const [employeeShift, setEmployeeShift] = useState(null);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [error, setError] = useModalMessage('error');
  const today = new Date();
  const activeWeekStart = new Date(today); activeWeekStart.setDate(today.getDate() - today.getDay());
  const activeWeekEnd = new Date(activeWeekStart); activeWeekEnd.setDate(activeWeekStart.getDate() + 6);
  const [startDate, setStartDate] = useState(localDateValue(activeWeekStart));
  const [endDate, setEndDate] = useState(localDateValue(activeWeekEnd));
  const selfService = user.role === 'Employee';

  useEffect(() => {
    if (!selfService) return;
    const controller = new AbortController();
    fetch('/api/time-tracking/me', { signal:controller.signal, cache:'no-store' })
      .then(async (response) => { const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to load your employee profile.'); setSelectedEmployee(data.employee); })
      .catch((loadError) => { if(loadError.name!=='AbortError')setError(loadError.message); });
    return () => controller.abort();
  }, [selfService]);

  useEffect(() => {
    const query = search.trim();
    if (!query) { setEmployees([]); setSearching(false); return undefined; }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/time-tracking/employees?search=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to search employees.');
        setEmployees(data.employees);
        setShowEmployeeResults(true);
        setError('');
      } catch (searchError) {
        if (searchError.name !== 'AbortError') setError(searchError.message);
      } finally { if (!controller.signal.aborted) setSearching(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search]);

  useEffect(() => {
    if (!selectedEmployee || !startDate || !endDate || startDate > endDate) { setTimeEntries([]); setEmployeeShift(null); return undefined; }
    const controller = new AbortController(); setLoadingEntries(true); setEmployeeShift(null);
    const parameters = new URLSearchParams({ startDate, endDate });
    if (!selfService) parameters.set('employeeId', selectedEmployee.id);
    fetch(`/api/time-tracking/entries?${parameters}`, { signal: controller.signal })
      .then(async (response) => { const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to load time entries.'); setTimeEntries(data.entries); setEmployeeShift(data.shift); setError(''); })
      .catch((entryError) => { if(entryError.name!=='AbortError')setError(entryError.message); })
      .finally(() => { if(!controller.signal.aborted)setLoadingEntries(false); });
    return () => controller.abort();
  }, [selectedEmployee, startDate, endDate, selfService]);

  function selectEmployee(employee) {
    setSelectedEmployee(employee);
    setSearch('');
    setEmployees([]);
    setShowEmployeeResults(false);
    setShowEmployeeSelector(false);
  }

  async function showAllTimeEmployees() {
    setSearch('');
    setSearching(true);
    setError('');
    try {
      const response = await fetch('/api/time-tracking/employees?showAll=true');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load employees.');
      setEmployees(data.employees);
      setShowEmployeeResults(true);
    } catch (loadError) { setError(loadError.message); }
    finally { setSearching(false); }
  }

  function changeTimeEmployeeSearch(event) {
    const value = event.target.value;
    setSearch(value);
    if (!value.trim()) setShowEmployeeResults(false);
  }

  const rangeError = startDate && endDate && startDate > endDate ? 'End date must be on or after the start date.' : '';
  const dateRows = rangeError ? [] : datesInRange(startDate, endDate);
  const entriesByDate = timeEntries.reduce((entries, entry) => { const date=localDateValue(new Date(entry.timestamp)); if(!entries[date])entries[date]=[]; entries[date].push(entry.timestamp); return entries; }, {});
  const shiftRange = employeeShift ? `${formatShiftTime(employeeShift.startTime)}–${formatShiftTime(employeeShift.endTime)}` : '';
  const recordedDays = dateRows.filter((date)=>entriesByDate[date.value]?.length).length;
  const scheduledDays = dateRows.filter((date)=>employeeShift?.workDays?.includes(date.dayName)).length;
  const missingDays = dateRows.filter((date)=>employeeShift?.workDays?.includes(date.dayName)&&!entriesByDate[date.value]?.length).length;

  function selectDatePreset(preset) {
    const end = new Date();
    const start = new Date(end);
    if (preset === 'week') { start.setDate(end.getDate()-end.getDay()); end.setDate(start.getDate()+6); }
    if (preset === 'last7') start.setDate(end.getDate()-6);
    if (preset === 'month') start.setDate(1);
    setStartDate(localDateValue(start)); setEndDate(localDateValue(end));
  }

  return <section className="time-tracking-view friendly-time-entries">
    <div className="module-title"><div><span>Timetracking</span><h1>Time Entries</h1><p>{selfService?'Review your attendance and daily punches.':'Choose an employee, select a date range, and review their attendance.'}</p></div></div>
    {!selfService&&<div className="time-entry-employee-card">
      <div className="time-entry-step"><b>1</b><span><strong>Employee</strong><small>Whose records do you want to view?</small></span></div>
      {selectedEmployee?<div className="time-entry-person"><i>{selectedEmployee.firstName[0]}{selectedEmployee.lastName[0]}</i><span><strong>{employeeName(selectedEmployee)}</strong><small>{selectedEmployee.employeeNumber} · {selectedEmployee.jobTitle||'No position'} · {selectedEmployee.department||'No department'}</small></span><button type="button" onClick={()=>setShowEmployeeSelector(true)}>Change employee</button></div>:<button className="time-entry-choose-employee" type="button" onClick={()=>setShowEmployeeSelector(true)}>+ Choose an employee</button>}
    </div>}
    {showEmployeeSelector&&<div className="time-employee-selector-modal" role="dialog" aria-modal="true" aria-labelledby="time-employee-selector-title"><button className="time-employee-selector-scrim" type="button" onClick={()=>setShowEmployeeSelector(false)} aria-label="Close employee selector"/><div className="time-employee-selector-dialog"><div className="time-employee-selector-header"><div><span>Time entries</span><h2 id="time-employee-selector-title">Choose an employee</h2><p>Search by name, employee number, position, or department.</p></div><button type="button" onClick={()=>setShowEmployeeSelector(false)} aria-label="Close">×</button></div><div className="employee-selector-panel"><div className="time-search-actions"><div className="time-employee-search"><span>⌕</span><input id="time-employee-search" value={search} onChange={changeTimeEmployeeSearch} placeholder="Start typing an employee name…" autoComplete="off" autoFocus/>{searching&&<small>Searching…</small>}</div><button type="button" onClick={showAllTimeEmployees}>Browse all</button></div>{showEmployeeResults&&!searching&&<div className="time-employee-results" role="listbox" aria-label="Employee search results">{employees.map((employee)=><button type="button" role="option" aria-selected={selectedEmployee?.id===employee.id} key={employee.id} onClick={()=>selectEmployee(employee)}><i>{employee.firstName[0]}{employee.lastName[0]}</i><span><strong>{employeeName(employee)}</strong><small>{employee.employeeNumber} · {employee.jobTitle||'No position'} · {employee.department||'No department'}</small></span><b className={`status-${employee.employmentStatus}`}>{employee.employmentStatus}</b></button>)}{!employees.length&&<p>No employees match your search.</p>}</div>}</div></div></div>}
    <section className={`time-entry-section friendly-entry-card${!selectedEmployee?' awaiting-employee':''}`}>
      <div className="friendly-entry-controls">
        <div className="time-entry-step"><b>2</b><span><strong>Date range</strong><small>Choose the attendance period to review.</small></span></div>
        <div className="time-range-presets"><button type="button" onClick={()=>selectDatePreset('week')} disabled={!selectedEmployee}>This week</button><button type="button" onClick={()=>selectDatePreset('last7')} disabled={!selectedEmployee}>Last 7 days</button><button type="button" onClick={()=>selectDatePreset('month')} disabled={!selectedEmployee}>This month</button></div>
        <div className="date-range-controls"><label><span>Start date</span><input type="date" value={selectedEmployee?startDate:''} onChange={(event)=>setStartDate(event.target.value)} disabled={!selectedEmployee}/></label><i>to</i><label><span>End date</span><input type="date" value={selectedEmployee?endDate:''} onChange={(event)=>setEndDate(event.target.value)} disabled={!selectedEmployee}/></label></div>
      </div>
      {!selectedEmployee?<div className="time-entry-empty-state"><i>⌕</i><strong>Choose an employee to begin</strong><p>Their schedule, attendance summary, and daily punches will appear here.</p></div>:rangeError?<p className="rbac-message" role="alert">{rangeError}</p>:<>
        <div className="time-entry-overview"><article><span>Days selected</span><strong>{dateRows.length}</strong><small>{scheduledDays} scheduled</small></article><article><span>Days with records</span><strong>{loadingEntries?'—':recordedDays}</strong><small>{timeEntries.length} total punches</small></article><article className={missingDays?'needs-attention':''}><span>Missing records</span><strong>{loadingEntries?'—':missingDays}</strong><small>Scheduled days without punches</small></article><article><span>Assigned shift</span><strong className="shift-summary">{employeeShift?shiftRange:'None'}</strong><small>{employeeShift?'Based on current schedule':'No shift assigned'}</small></article></div>
        <div className="friendly-table-heading"><div><span>Daily attendance</span><h2>{employeeName(selectedEmployee)}</h2></div><small>{loadingEntries?'Loading records…':`${startDate} to ${endDate}`}</small></div>
        <div className="time-entry-table"><div className="time-entry-row time-entry-head"><span>Date</span><span>Schedule</span><span>First in<br/><small>Shift start</small></span><span>First out<br/><small>Lunch</small></span><span>Second in<br/><small>Lunch return</small></span><span>Second out<br/><small>Optional break</small></span><span>Third in<br/><small>Break return</small></span><span>Third out<br/><small>Shift end</small></span><span>Exceptions</span></div>{dateRows.map((date)=>{const punches=entriesByDate[date.value]||[];const displayedPunches=displayTimeEntryPunches(punches);const scheduled=employeeShift?.workDays?.includes(date.dayName);const exceptions=timeEntryExceptions(punches,employeeShift,scheduled);return <div className={`time-entry-row${scheduled&&!punches.length?' missing-entry':''}${exceptions.length?' has-exceptions':''}`} key={date.value}><div><strong>{date.weekday}</strong><small>{date.label}</small></div><span className="employee-shift-cell">{employeeShift?(scheduled?shiftRange:'Rest day'):'Not assigned'}</span>{Array.from({length:6},(_,index)=><span key={index}>{displayedPunches[index]?new Date(displayedPunches[index]).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—'}</span>)}<div className="time-entry-exceptions">{exceptions.length?exceptions.map((exception)=><b className={exception==='Absent'?'absent':''} key={exception}>{exception}</b>):<b className="clear">Clear</b>}</div></div>})}</div>
      </>}
    </section>
  </section>;
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function countWorkingDays(startDate, endDate, workDays = ['monday','tuesday','wednesday','thursday','friday']) {
  const allowedDays = new Set(workDays || ['monday','tuesday','wednesday','thursday','friday']);
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let count = 0;
  for (const date=new Date(start);date<=end;date.setUTCDate(date.getUTCDate()+1)) {
    if (allowedDays.has(dayNames[date.getUTCDay()])) count += 1;
  }
  return count;
}

function formatShiftTime(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function timeEntryExceptions(punches, shift, scheduled) {
  if (!scheduled) return [];
  if (!punches.length) return ['Absent'];
  const minutes = (value) => {
    const text = value.includes('T')
      ? new Date(value).toLocaleTimeString('en-GB', { timeZone:'Asia/Manila', hour:'2-digit', minute:'2-digit', hour12:false })
      : value;
    const [hour, minute] = text.slice(0, 5).split(':').map(Number);
    return hour * 60 + minute;
  };
  const exceptions = [];
  if (shift?.startTime && minutes(punches[0]) > minutes(shift.startTime)) exceptions.push('Late · First In');
  if (punches.length < 4 || punches.length % 2 !== 0) exceptions.push('Incomplete');
  if (punches.length >= 3) {
    const breakMinutes = minutes(punches[2]) - minutes(punches[1]);
    if (breakMinutes > 60) exceptions.push('Late · Break');
    if (breakMinutes < 60) exceptions.push('Missed 1-hour break');
  }
  if (shift?.endTime && punches.length >= 2 && minutes(punches[punches.length - 1]) < minutes(shift.endTime)) exceptions.push('Undertime');
  return exceptions;
}

function displayTimeEntryPunches(punches) {
  if (punches.length >= 6 || punches.length === 0) return punches.slice(0, 6);
  const displayed = Array(6).fill(null);
  punches.slice(0, -1).forEach((punch, index) => { displayed[index] = punch; });
  displayed[5] = punches[punches.length - 1];
  return displayed;
}

function datesInRange(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const dates = [];
  for (const date = start; date <= end; date.setDate(date.getDate() + 1)) {
    dates.push({ value: localDateValue(date), dayName: ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][date.getDay()], weekday: date.toLocaleDateString(undefined, { weekday: 'short' }), label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) });
  }
  return dates;
}

const emptyEmployee = {
  id: null, employeeNumber: '', firstName: '', middleName: '', lastName: '', suffix: '', preferredName: '',
  email: '', phone: '', address: '', dateOfBirth: '', gender: '', civilStatus: '',
  jobTitle: '', department: '', departmentId: '', positionId: '', managerEmployeeIds: [], assignmentCount: 0,
  hireDate: '', employmentStatus: 'active', profilePictureUrl: null, hasProfilePicture: false,
  emergencyContactName: '', emergencyContactRelationship: '', emergencyContactPhone: '',
  emergencyContactAlternatePhone: '', temporaryPassword: '', roleId: '', roleName: '',
  documents: [], hasLogin: false, loginEnabled: null, payroll: null, workSchedule: null
};

function employeeInitials(employee) {
  const firstInitial = String(employee?.firstName || '?').trim().charAt(0);
  const lastInitial = String(employee?.lastName || '?').trim().charAt(0);
  return `${firstInitial}${lastInitial}`.toUpperCase();
}

function EmployeeAvatar({ employee, className = '' }) {
  const source = employee?.profilePictureUrl || '';
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setImageFailed(false); }, [source]);
  return <span className={`employee-avatar ${className}`.trim()}>{source && !imageFailed
    ? <img src={source} alt={`${employeeName(employee)} profile`} onError={() => setImageFailed(true)} />
    : <b aria-hidden="true">{employeeInitials(employee)}</b>}</span>;
}

function employeeFormFromProfile(employee) {
  const assignment = employee?.organizationAssignment;
  const assignmentCount = Number(assignment?.assignmentCount || 0);
  return {
    ...emptyEmployee,
    ...employee,
    hireDate: employee?.hireDate ? String(employee.hireDate).slice(0, 10) : '',
    dateOfBirth: employee?.dateOfBirth ? String(employee.dateOfBirth).slice(0, 10) : '',
    roleId: employee?.roleId ? String(employee.roleId) : '',
    departmentId: assignmentCount === 1 ? String(assignment?.departmentIds?.[0] || '') : '',
    positionId: assignmentCount === 1 ? String(assignment?.positionId || '') : '',
    managerEmployeeIds: assignmentCount === 1 ? (assignment?.managerEmployeeIds || []).map(String) : [],
    assignmentCount
  };
}

function assignmentSignature(employee) {
  return JSON.stringify({
    departmentId: String(employee?.departmentId || ''),
    positionId: String(employee?.positionId || '')
  });
}

function formatEmployeeDate(value, style = { year:'numeric', month:'long', day:'numeric' }) {
  if (!value) return 'Not provided';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleDateString(undefined, style);
}

function Workforce({ user, onNavigate }) {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [showingAll, setShowingAll] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(emptyEmployee);
  const [message, setMessage] = useModalMessage();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [roleOptions, setRoleOptions] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [positionOptions, setPositionOptions] = useState([]);
  const assignmentSnapshotRef = useRef('');
  const profileRequestRef = useRef(null);
  const profileRequestIdRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);
  const permission = effectiveModulePermission(user,'workforce');
  const organizationPermission = effectiveModulePermission(user,'organization');
  const canManageOrganization = Boolean(organizationPermission?.update);
  const canViewPayroll = Boolean(effectiveModulePermission(user,'payroll_setup')?.view);
  const canViewSchedule = Boolean(effectiveModulePermission(user,'shift_management')?.view);

  useEffect(() => {
    showAllEmployees();
    return () => profileRequestRef.current?.abort();
  }, []);

  async function loadEmployees(query = search) {
    const response = await fetch(`/api/workforce?search=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load employees.');
    setEmployees(data.employees);
  }

  useEffect(() => {
    const query = search.trim();
    if (!query) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/workforce?search=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to search employees.');
        setEmployees(data.employees);
        setShowResults(true);
        setShowingAll(false);
        setMessage('');
      } catch (error) {
        if (error.name !== 'AbortError') setMessage(error.message);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search]);

  async function loadEditorOptions() {
    const requests = [fetch('/api/workforce/role-options')];
    if (canManageOrganization) {
      requests.push(fetch('/api/workforce/department-options'), fetch('/api/workforce/position-options'));
    }
    const responses = await Promise.all(requests);
    const data = await Promise.all(responses.map(async (response) => ({ response, data:await response.json().catch(() => ({})) })));
    const failed = data.find(({ response }) => !response.ok);
    if (failed) throw new Error(failed.data.error || 'Unable to load employee form options.');

    const roles = data[0].data.roles || [];
    setRoleOptions(roles);
    if (canManageOrganization) {
      setDepartmentOptions(data[1].data.departments || []);
      setPositionOptions(data[2].data.positions || []);
    } else {
      setDepartmentOptions([]);
      setPositionOptions([]);
    }
    return roles;
  }

  function applyLoadedProfile(employee) {
    const nextForm = employeeFormFromProfile(employee);
    assignmentSnapshotRef.current = assignmentSignature(nextForm);
    setForm(nextForm);
    return nextForm;
  }

  function cancelProfileRequest() {
    profileRequestIdRef.current += 1;
    profileRequestRef.current?.abort();
    profileRequestRef.current = null;
    setProfileLoading(false);
  }

  function closeEmployeeEditor() {
    if (saveInFlightRef.current || deleteInFlightRef.current) return;
    cancelProfileRequest();
    setEditor(null);
  }

  async function openCreate() {
    if (saveInFlightRef.current || deleteInFlightRef.current) return;
    cancelProfileRequest();
    const editorRequestId = profileRequestIdRef.current;
    assignmentSnapshotRef.current = assignmentSignature(emptyEmployee);
    setForm(emptyEmployee);
    setEditor({ mode: 'create' });
    setMessage('');
    try {
      const roles = await loadEditorOptions();
      if (editorRequestId !== profileRequestIdRef.current) return;
      const defaultRole = roles.find((role) => role.name === 'Employee' && role.assignable !== false)
        || roles.find((role) => role.assignable !== false);
      setForm((current) => ({ ...current, roleId: defaultRole ? String(defaultRole.id) : '' }));
    } catch (error) {
      if (editorRequestId === profileRequestIdRef.current) setMessage(error.message);
    }
  }

  async function openProfile(employee, mode = 'view') {
    if (saveInFlightRef.current || deleteInFlightRef.current) return;
    cancelProfileRequest();
    const requestId = profileRequestIdRef.current;
    const controller = new AbortController();
    profileRequestRef.current = controller;
    applyLoadedProfile(employee);
    setEditor({ mode, employee });
    setProfileLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/workforce/${employee.id}`, { signal:controller.signal });
      const data = await response.json();
      if (requestId !== profileRequestIdRef.current) return;
      if (!response.ok) throw new Error(data.error || 'Unable to load employee profile.');
      applyLoadedProfile(data.employee);
      setEditor({ mode, employee: data.employee });
    } catch (error) {
      if (error.name !== 'AbortError' && requestId === profileRequestIdRef.current) setMessage(error.message);
    } finally {
      if (requestId === profileRequestIdRef.current) {
        profileRequestRef.current = null;
        setProfileLoading(false);
      }
    }
  }

  async function beginEdit() {
    if (profileLoading || saveInFlightRef.current || deleteInFlightRef.current) return;
    const editorRequestId = profileRequestIdRef.current;
    setEditor((current) => ({ ...current, mode: 'edit' }));
    setMessage('');
    try {
      await loadEditorOptions();
    } catch (error) {
      if (editorRequestId === profileRequestIdRef.current) setMessage(error.message);
    }
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => {
      if (name === 'employmentStatus' && value === 'inactive') {
        let originalAssignment = { departmentId:'', positionId:'' };
        try { originalAssignment = JSON.parse(assignmentSnapshotRef.current) || originalAssignment; } catch {}
        return {
          ...current,
          employmentStatus:value,
          departmentId:String(originalAssignment.departmentId || ''),
          positionId:String(originalAssignment.positionId || '')
        };
      }
      return { ...current, [name]:value };
    });
  }

  async function submitProfile(event, documents = [], profilePicture = {}, onDocumentUploaded = () => {}) {
    event.preventDefault();
    if (saveInFlightRef.current || deleteInFlightRef.current || !editor) return;
    const assignmentCount = Number(form.assignmentCount || 0);
    const hasDepartment = Boolean(String(form.departmentId || ''));
    const hasPosition = Boolean(String(form.positionId || ''));
    if (canManageOrganization && assignmentCount <= 1 && hasDepartment !== hasPosition) {
      setMessage('Select both a department and a position before saving the employee.');
      return;
    }
    if (canManageOrganization && assignmentCount === 1 && (!hasDepartment || !hasPosition)) {
      setMessage('Remove an existing organization assignment from Setup → Organization.');
      return;
    }
    saveInFlightRef.current = true;
    setSaving(true);
    setMessage('');
    const editing = editor.mode === 'edit';
    let profileWasSaved = false;
    let uploadedDocumentCount = 0;
    const readResponse = async (response) => {
      try { return await response.json(); } catch { return {}; }
    };

    try {
      const profilePayload = {
        firstName:form.firstName, middleName:form.middleName, lastName:form.lastName, suffix:form.suffix,
        preferredName:form.preferredName, email:form.email, phone:form.phone, address:form.address,
        dateOfBirth:form.dateOfBirth, gender:form.gender, civilStatus:form.civilStatus, hireDate:form.hireDate,
        emergencyContactName:form.emergencyContactName, emergencyContactRelationship:form.emergencyContactRelationship,
        emergencyContactPhone:form.emergencyContactPhone, emergencyContactAlternatePhone:form.emergencyContactAlternatePhone,
        employmentStatus:form.employmentStatus, roleId:form.roleId, temporaryPassword:form.temporaryPassword,
        departmentId:form.departmentId, positionId:form.positionId
      };
      const payload = { ...profilePayload };
      if (profilePicture.clear) payload.clearProfilePicture = true;
      if (profilePicture.base64) {
        payload.profilePictureBase64 = profilePicture.base64;
        payload.profilePictureMimeType = profilePicture.mimeType;
      }
      const organizationChanged = canManageOrganization && form.employmentStatus === 'active' && (editing
        ? assignmentSignature(profilePayload) !== assignmentSnapshotRef.current
        : Boolean(profilePayload.departmentId || profilePayload.positionId));
      if (organizationChanged) payload.syncOrganizationAssignment = true;

      const response = await fetch(editing ? '/api/workforce/' + editor.employee.id : '/api/workforce', {
        method:editing ? 'PUT' : 'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(payload)
      });
      const data = await readResponse(response);
      if (!response.ok || !data.employee) throw new Error(data.error || 'Unable to save employee.');
      profileWasSaved = true;

      for (const document of documents) {
        const extension = document.name.split('.').pop()?.toLowerCase();
        const fallbackTypes = {
          pdf:'application/pdf',
          doc:'application/msword',
          docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          jpg:'image/jpeg',
          jpeg:'image/jpeg',
          png:'image/png'
        };
        const uploadResponse = await fetch('/api/workforce/' + data.employee.id + '/documents', {
          method:'POST',
          headers:{
            'Content-Type':'application/octet-stream',
            'X-File-Name':encodeURIComponent(document.name),
            'X-File-Type':document.type || fallbackTypes[extension] || ''
          },
          body:document
        });
        const uploadData = await readResponse(uploadResponse);
        if (!uploadResponse.ok) throw new Error(uploadData.error || 'Unable to upload ' + document.name + '.');
        uploadedDocumentCount += 1;
        onDocumentUploaded(document);
      }

      const detailResponse = await fetch('/api/workforce/' + data.employee.id);
      const detailData = await readResponse(detailResponse);
      if (!detailResponse.ok || !detailData.employee) {
        throw new Error(detailData.error || 'Unable to reload employee profile.');
      }
      await loadEmployees();
      setEditor({ mode:'view', employee:detailData.employee });
      applyLoadedProfile(detailData.employee);
      setMessage(editing ? 'Employee profile updated.' : 'Employee profile created.');
    } catch (error) {
      if (profileWasSaved) {
        loadEmployees().catch(() => {});
        const remainingDocumentCount = Math.max(0, documents.length - uploadedDocumentCount);
        const uploadedSummary = uploadedDocumentCount
          ? ` ${uploadedDocumentCount} ${uploadedDocumentCount === 1 ? 'document was' : 'documents were'} uploaded.`
          : '';
        const retrySummary = remainingDocumentCount
          ? ` ${remainingDocumentCount} ${remainingDocumentCount === 1 ? 'document remains' : 'documents remain'} selected; save again to retry only the remaining upload${remainingDocumentCount === 1 ? '' : 's'}.`
          : '';
        setMessage(`Employee profile was saved.${uploadedSummary} A follow-up step failed: ${error.message || 'The profile could not be reloaded.'}${retrySummary}`);
      } else {
        setMessage(error.message || 'Unable to save employee.');
      }
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

  async function deleteEmployee() {
    if (profileLoading || saveInFlightRef.current || deleteInFlightRef.current || !editor?.employee?.id) return;
    deleteInFlightRef.current = true;
    let deleted = false;
    try {
      if (!await confirmModal('Delete ' + form.firstName + ' ' + form.lastName + '\'s profile?', 'Delete employee profile?')) return;
      setDeleting(true);
      const response = await fetch('/api/workforce/' + editor.employee.id, { method:'DELETE' });
      let data = {};
      try { data = await response.json(); } catch {}
      if (!response.ok) throw new Error(data.error || 'Unable to delete employee.');
      deleted = true;
      cancelProfileRequest();
      setEditor(null);
      await loadEmployees();
      setMessage('Employee profile deleted.');
    } catch (error) {
      setMessage(deleted
        ? `Employee profile was deleted, but the directory could not be refreshed. ${error.message || ''}`.trim()
        : error.message || 'Unable to delete employee.');
    } finally {
      deleteInFlightRef.current = false;
      setDeleting(false);
    }
  }

  async function searchEmployees(event) {
    event.preventDefault();
    try {
      await loadEmployees(search);
      setShowResults(true);
      setShowingAll(!search.trim());
    } catch (error) { setMessage(error.message); }
  }

  function changeSearch(event) {
    const value = event.target.value;
    setSearch(value);
    setShowingAll(false);
    if (!value.trim()) setShowResults(false);
  }

  async function showAllEmployees() {
    setSearch('');
    try {
      await loadEmployees('');
      setShowResults(true);
      setShowingAll(true);
    } catch (error) { setMessage(error.message); }
  }

  function sortEmployees(key) {
    setSortConfig((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  }

  const sortedEmployees = [...employees].sort((left, right) => {
    const values = {
      name: [(left.preferredName || left.firstName) + ' ' + left.lastName, (right.preferredName || right.firstName) + ' ' + right.lastName],
      employeeNumber: [left.employeeNumber, right.employeeNumber],
      jobTitle: [left.jobTitle || '', right.jobTitle || ''],
      employmentStatus: [left.employmentStatus, right.employmentStatus]
    }[sortConfig.key];
    const comparison = values[0].localeCompare(values[1], undefined, { numeric: true, sensitivity: 'base' });
    return sortConfig.direction === 'asc' ? comparison : -comparison;
  });

  const sortIndicator = (key) => sortConfig.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕';
  const activeEmployees = employees.filter((employee)=>employee.employmentStatus==='active').length;
  const inactiveEmployees = employees.filter((employee)=>employee.employmentStatus==='inactive').length;
  const departmentCount = new Set(employees.map((employee)=>employee.department).filter(Boolean)).size;

  return (
    <section className="workforce-view friendly-workforce">
      <div className="module-title"><div><span>People directory</span><h1>Employees</h1><p>Find employees quickly and keep their work and contact information up to date.</p></div>{permission?.create&&<button onClick={openCreate}>+ Add employee</button>}</div>
      <div className="workforce-overview">
        <article><span>Total employees</span><strong>{showResults?employees.length:'—'}</strong><small>Profiles in this view</small></article>
        <article><span>Active</span><strong>{showResults?activeEmployees:'—'}</strong><small>Currently employed</small></article>
        <article><span>Inactive</span><strong>{showResults?inactiveEmployees:'—'}</strong><small>Archived profiles</small></article>
        <article><span>Departments</span><strong>{showResults?departmentCount:'—'}</strong><small>Represented in this view</small></article>
      </div>
      <section className="workforce-directory-card">
        <div className="workforce-directory-heading"><div><span>Employee directory</span><h2>People</h2><p>Search by employee name, number, email, position, or department.</p></div><b>{employees.length} {employees.length===1?'result':'results'}</b></div>
        <div className={`workforce-toolbar ${showResults?'has-results':''}`}>
          <form onSubmit={searchEmployees}><span>⌕</span><input value={search} onChange={changeSearch} placeholder="Search the employee directory…" aria-label="Search employees"/>{search&&<button className="clear-workforce-search" type="button" onClick={showAllEmployees}>×</button>}<button type="submit">Search</button></form>
          <div className="workforce-toolbar-actions"><button type="button" onClick={showAllEmployees}>View everyone</button></div>
        </div>
        {showResults&&<div className={`employee-table friendly-employee-table ${showingAll?'show-all-results':''}`}>
          <div className="employee-row employee-head">
            <button type="button" onClick={()=>sortEmployees('name')}>Employee <span>{sortIndicator('name')}</span></button>
            <button type="button" onClick={()=>sortEmployees('jobTitle')}>Work assignment <span>{sortIndicator('jobTitle')}</span></button>
            <button type="button" onClick={()=>sortEmployees('employeeNumber')}>Employee ID <span>{sortIndicator('employeeNumber')}</span></button>
            <button type="button" onClick={()=>sortEmployees('employmentStatus')}>Status <span>{sortIndicator('employmentStatus')}</span></button>
            <span>Profile</span>
          </div>
          {sortedEmployees.map((employee)=><button className="employee-row" type="button" key={employee.id} onClick={()=>openProfile(employee)}>
            <div className="employee-person"><EmployeeAvatar employee={employee}/><span className="employee-person-copy"><strong>{employeeName(employee)}</strong><small>{employee.email}</small></span></div>
            <div className="employee-assignment-cell"><strong>{employee.jobTitle||'No position assigned'}</strong><small>{employee.department||'No department assigned'}</small></div>
            <span className="employee-number-cell">{employee.employeeNumber}</span>
            <span className={`employment-status status-${employee.employmentStatus}`}><i/>{employee.employmentStatus.replace('_',' ')}</span>
            <span className="employee-row-action">View →</span>
          </button>)}
          {!employees.length&&<div className="empty-workforce"><span>⌕</span><strong>No employees match your search</strong><small>Try a name, employee number, position, or department.</small>{search&&<button type="button" onClick={showAllEmployees}>Clear search</button>}</div>}
        </div>}
      </section>
      {editor&&<div className="employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-editor-title" aria-busy={saving || deleting || profileLoading}><button className="modal-scrim" type="button" onClick={closeEmployeeEditor} aria-label="Close" disabled={saving || deleting}/><div className="employee-editor">
        <div className="editor-header workforce-editor-header"><div><span>{editor.mode==='create'?'New employee':editor.mode==='edit'?'Edit employee':'Employee profile'}</span><h2 id="employee-editor-title">{editor.mode==='create'?'Add employee':`${form.firstName} ${form.lastName}`}</h2>{editor.mode!=='create'&&<small>{form.employeeNumber} · {form.jobTitle||'No position'} · {form.department||'No department'}</small>}</div><div className="employee-editor-header-actions">{editor.mode==='view'&&permission?.update&&<button className="top-edit-employee" type="button" onClick={beginEdit} disabled={profileLoading || saving || deleting}>Edit employee</button>}<button className="employee-editor-close" type="button" onClick={closeEmployeeEditor} aria-label="Close" disabled={saving || deleting}>×</button></div></div>
        {profileLoading&&<p className="employee-profile-loading" role="status">Loading complete employee details…</p>}
        {editor.mode === 'view'
          ? <EmployeeDetails employee={form} onNavigate={onNavigate} canViewPayroll={canViewPayroll} canViewSchedule={canViewSchedule}/>
          : <EmployeeForm form={form} mode={editor.mode} updateField={updateField} onSubmit={submitProfile} saving={saving} roles={roleOptions} departments={departmentOptions} positions={positionOptions} canManageOrganization={canManageOrganization}/>
        }
        <div className="editor-actions">{editor.mode==='view'&&permission?.delete&&<button className="delete-profile" type="button" onClick={deleteEmployee} disabled={profileLoading || saving || deleting}>{deleting?'Deleting…':'Delete profile'}</button>}<span/><button className="secondary-action" type="button" onClick={closeEmployeeEditor} disabled={saving || deleting}>Close</button></div>
      </div></div>}
    </section>
  );
}

function EmployeeDetails({ employee, onNavigate, canViewPayroll, canViewSchedule }) {
  const employment = [
    ['Employee ID', employee.employeeNumber], ['Employment status', String(employee.employmentStatus || 'active').replace('_', ' ')],
    ['Position', employee.jobTitle || 'Not assigned'], ['Department', employee.department || 'Not assigned'],
    ['Date hired', formatEmployeeDate(employee.hireDate)]
  ];
  const personal = [
    ['First name', employee.firstName || 'Not provided'], ['Middle name', employee.middleName || 'Not provided'],
    ['Last name', employee.lastName || 'Not provided'], ['Suffix', employee.suffix || 'Not provided'],
    ['Preferred name', employee.preferredName || 'Not provided'], ['Date of birth', formatEmployeeDate(employee.dateOfBirth)],
    ['Gender', String(employee.gender || 'Not provided').replaceAll('_', ' ')],
    ['Civil status', String(employee.civilStatus || 'Not provided').replaceAll('_', ' ')],
    ['Email address', employee.email || 'Not provided'], ['Contact number', employee.phone || 'Not provided'],
    ['Address', employee.address || 'Not provided']
  ];
  const emergency = [['Contact name', employee.emergencyContactName || '—'], ['Relationship', employee.emergencyContactRelationship || '—'], ['Phone number', employee.emergencyContactPhone || '—'], ['Alternate phone', employee.emergencyContactAlternatePhone || '—']];
  const loginAccess = employee.loginEnabled === true ? 'Enabled' : employee.hasLogin ? 'Disabled' : 'Not provisioned';
  const access = [['Account role', employee.roleName || 'Not assigned'], ['Login access', loginAccess]];
  const basicPay = employee.payroll?.basicPay;
  const payroll = [
    ['Basic pay', basicPay == null ? 'Not configured' : `₱${Number(basicPay).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 })}`],
    ['Pay basis', employee.payroll?.payBasis ? String(employee.payroll.payBasis).replaceAll('_', ' ') : 'Not configured'],
    ['Pay frequency', employee.payroll?.payFrequency ? String(employee.payroll.payFrequency).replaceAll('_', ' ') : 'Not configured']
  ];
  const workDays = Array.isArray(employee.workSchedule?.workDays) ? employee.workSchedule.workDays.map((day) => String(day).slice(0, 3)).join(', ') : '';
  const schedule = [
    ['Schedule', employee.workSchedule ? `${employee.workSchedule.shiftType || 'Scheduled'} · ${employee.workSchedule.startTime || '—'}–${employee.workSchedule.endTime || '—'}` : 'Not configured'],
    ['Work days', workDays || 'Not configured']
  ];
  const displayName = [employee.preferredName || employee.firstName, employee.middleName, employee.lastName, employee.suffix].filter(Boolean).join(' ');
  const showCompensation = canViewPayroll || canViewSchedule;
  const status = String(employee.employmentStatus || 'active').replace('_', ' ');
  return <div className="employee-profile-sections friendly-profile">
    <section className="employee-profile-hero"><EmployeeAvatar employee={employee}/><div><span>Employee profile</span><h2>{displayName || 'Employee profile'}</h2><p>{employee.jobTitle||'No position assigned'} · {employee.department||'No department assigned'}</p></div><div className="profile-hero-badges"><b className={`employment-status status-${employee.employmentStatus || 'active'}`}><i />{status}</b><small>{loginAccess === 'Enabled' ? 'Login enabled' : loginAccess === 'Disabled' ? 'Login disabled' : 'No login access'}</small></div></section>
    <div className="employee-profile-highlights"><article><span>Employee ID</span><strong>{employee.employeeNumber}</strong></article><article><span>Email</span><strong>{employee.email}</strong></article><article><span>Phone</span><strong>{employee.phone||'Not provided'}</strong></article><article><span>Started</span><strong>{formatEmployeeDate(employee.hireDate, { year:'numeric', month:'short', day:'numeric' })}</strong></article></div>
    <ProfileSection number="01" title="Employment" description="Status and organizational assignment" details={employment} />
    <ProfileSection number="02" title="Personal and contact" description="Identity and contact details" details={personal} />
    <ProfileSection number="03" title="Emergency contact" description="Who to contact in an emergency" details={emergency} />
    {showCompensation && <section className="profile-section profile-source-section"><div className="profile-section-heading"><h3><span>04</span><i>Compensation and schedule</i></h3><small>Managed by the dedicated payroll and shift modules</small></div><div className="profile-source-details">{canViewPayroll&&<ProfileDetails details={payroll}/>} {canViewSchedule&&<ProfileDetails details={schedule}/>}</div><div className="profile-source-actions">{canViewPayroll&&<button type="button" onClick={()=>onNavigate('payroll_setup')}>Open Salary Setup</button>}{canViewSchedule&&<button type="button" onClick={()=>onNavigate('shift_management')}>Open Shift Management</button>}</div></section>}
    <ProfileSection number={showCompensation ? '05' : '04'} title="Account access" description="Application role and login availability" details={access} />
    <section className="profile-section profile-document-section"><div className="profile-section-heading"><h3><span>{showCompensation ? '06' : '05'}</span><i>Documents</i></h3><small>{employee.documents?.length||0} uploaded</small></div>{employee.documents?.length ? <ul className="profile-documents">{employee.documents.map((document) => <li key={document.id}><i>DOC</i><div><strong>{document.name}</strong><small>{(Number(document.size) / 1024 / 1024).toFixed(2)} MB · Uploaded {document.uploadedAt?new Date(document.uploadedAt).toLocaleDateString():'date unavailable'}</small></div><a href={`/api/workforce/documents/${document.id}/content`}>Download</a></li>)}</ul> : <div className="profile-empty-documents"><i>+</i><strong>No documents uploaded</strong><small>Documents can be added while editing this employee.</small></div>}</section>
  </div>;
}

function ProfileDetails({ details }) {
  return <div className="employee-details">{details.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function ProfileSection({ number, title, description, details }) {
  return <section className="profile-section"><div className="profile-section-heading"><h3><span>{number}</span><i>{title}</i></h3><small>{description}</small></div><ProfileDetails details={details}/></section>;
}


function employeeName(employee) { return employee ? [employee.preferredName || employee.firstName, employee.lastName].filter(Boolean).join(' ') || '—' : '—'; }


function EmployeeForm({ form, mode, updateField, onSubmit, saving, roles, departments, positions, canManageOrganization }) {
  const [documents, setDocuments] = useState([]);
  const [documentError, setDocumentError] = useState('');
  const [profilePicture, setProfilePicture] = useState({ preview:'', base64:'', mimeType:'', clear:false });
  const [profilePictureError, setProfilePictureError] = useState('');

  useEffect(() => {
    setDocuments([]);
    setDocumentError('');
    setProfilePicture({ preview:'', base64:'', mimeType:'', clear:false });
    setProfilePictureError('');
  }, [form.id, form.profilePictureUrl]);

  function generateTemporaryPassword() {
    const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?'];
    const randomCharacter = (characters) => characters[crypto.getRandomValues(new Uint32Array(1))[0] % characters.length];
    const characters = groups.map(randomCharacter);
    const allCharacters = groups.join('');
    while (characters.length < 16) characters.push(randomCharacter(allCharacters));
    for (let index = characters.length - 1; index > 0; index -= 1) {
      const swapIndex = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
      [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
    }
    updateField({ target: { name: 'temporaryPassword', value: characters.join('') } });
  }

  function selectDocuments(event) {
    const selected = Array.from(event.target.files || []);
    const oversized = selected.find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      setDocumentError(`${oversized.name} exceeds the 10 MB limit.`);
      setDocuments([]);
      return;
    }
    setDocumentError('');
    setDocuments(selected);
  }

  function markDocumentUploaded(uploadedDocument) {
    setDocuments((current) => current.filter((document) => document !== uploadedDocument));
  }

  function selectProfilePicture(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setProfilePictureError('Choose a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfilePictureError(`${file.name} exceeds the 2 MB profile-picture limit.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      if (!base64) {
        setProfilePictureError('Unable to read the selected profile picture.');
        return;
      }
      setProfilePicture({ preview:result, base64, mimeType:file.type, clear:false });
      setProfilePictureError('');
    };
    reader.onerror = () => setProfilePictureError('Unable to read the selected profile picture.');
    reader.readAsDataURL(file);
  }

  function removeProfilePicture() {
    setProfilePicture({ preview:'', base64:'', mimeType:'', clear:Boolean(form.hasProfilePicture || form.profilePictureUrl) });
    setProfilePictureError('');
  }

  const pictureUrl = profilePicture.preview || (profilePicture.clear ? '' : form.profilePictureUrl);
  const assignmentCount = Number(form.assignmentCount || 0);
  const assignmentIsComplex = assignmentCount > 1;
  const hasCurrentAssignment = assignmentCount === 1;
  const assignmentDisabled = form.employmentStatus !== 'active';
  const hasDepartment = Boolean(String(form.departmentId || ''));
  const hasPosition = Boolean(String(form.positionId || ''));
  const assignmentIncomplete = canManageOrganization && !assignmentIsComplex && hasDepartment !== hasPosition;
  const assignmentRemovalBlocked = canManageOrganization && hasCurrentAssignment && (!hasDepartment || !hasPosition);

  return <form className="employee-form" id="employee-form" onSubmit={(event) => onSubmit(event, documents, profilePicture, markDocumentUploaded)}>
    <fieldset className="form-section profile-picture-section"><legend><span>01</span><div><strong>Profile picture</strong><small>Shown in the employee directory and profile</small></div></legend><div className="profile-picture-picker"><EmployeeAvatar employee={{ ...form, profilePictureUrl:pictureUrl }} className="employee-avatar-editor"/><div><strong>Employee photo</strong><small>PNG, JPEG, or WebP · maximum 2 MB</small><div className="profile-picture-actions"><label className="secondary-action"><span>{pictureUrl ? 'Replace picture' : 'Upload picture'}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectProfilePicture}/></label>{pictureUrl && <button className="secondary-action" type="button" onClick={removeProfilePicture}>Remove picture</button>}</div>{profilePictureError&&<p className="document-error" role="alert">{profilePictureError}</p>}</div></div></fieldset>
    <fieldset className="form-section"><legend><span>02</span><div><strong>Personal information</strong><small>Identity, contact details, and demographics</small></div></legend><div className="form-section-grid">
      <label><span>First name *</span><input name="firstName" value={form.firstName} onChange={updateField} maxLength="100" required /></label>
      <label><span>Middle name</span><input name="middleName" value={form.middleName || ''} onChange={updateField} maxLength="100" /></label>
      <label><span>Last name *</span><input name="lastName" value={form.lastName} onChange={updateField} maxLength="100" required /></label>
      <label><span>Suffix</span><input name="suffix" value={form.suffix || ''} onChange={updateField} maxLength="30" placeholder="Jr., Sr., III" /></label>
      <label><span>Preferred name</span><input name="preferredName" value={form.preferredName} onChange={updateField} maxLength="100" /></label>
      <label><span>Date of birth</span><input type="date" name="dateOfBirth" value={form.dateOfBirth || ''} onChange={updateField} max={localDateValue(new Date())} /></label>
      <label><span>Gender</span><select name="gender" value={form.gender || ''} onChange={updateField}><option value="">Prefer not to specify</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
      <label><span>Civil status</span><select name="civilStatus" value={form.civilStatus || ''} onChange={updateField}><option value="">Prefer not to specify</option><option value="single">Single</option><option value="married">Married</option><option value="widowed">Widowed</option><option value="separated">Separated</option><option value="annulled">Annulled</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
      <label><span>Email address *</span><input type="email" name="email" value={form.email} onChange={updateField} maxLength="254" required autoComplete="email" /></label>
      <label><span>Contact number</span><input type="tel" name="phone" value={form.phone || ''} onChange={updateField} maxLength="40" placeholder="e.g. +63 912 345 6789" /></label>
      <label className="form-span-two"><span>Address</span><textarea name="address" value={form.address || ''} onChange={updateField} maxLength="600" rows="3" placeholder="House number, street, barangay, city, province" /></label>
    </div></fieldset>
    <fieldset className="form-section"><legend><span>03</span><div><strong>Employment and organization</strong><small>Company record and organizational assignment</small></div></legend><div className="form-section-grid">
      <label><span>Employee ID</span><input value={form.employeeNumber || 'Generated when saved'} readOnly aria-readonly="true" /></label>
      {mode === 'edit' && <label><span>Employment status</span><select name="employmentStatus" value={form.employmentStatus} onChange={updateField}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
      <label><span>Date hired *</span><input type="date" name="hireDate" value={form.hireDate || ''} onChange={updateField} required /></label>
      {canManageOrganization && !assignmentIsComplex && <><label><span>Department</span><select name="departmentId" value={form.departmentId || ''} onChange={updateField} disabled={assignmentDisabled || !departments.length} required={hasDepartment || hasPosition}><option value="" disabled={hasCurrentAssignment}>{departments.length ? hasCurrentAssignment ? 'Use Organization to remove assignment' : 'Select a department' : 'No departments available'}</option>{departments.map((department)=><option value={department.id} key={department.id}>{department.name}</option>)}</select></label><label><span>Position / job title</span><select name="positionId" value={form.positionId || ''} onChange={updateField} disabled={assignmentDisabled || !positions.length} required={hasDepartment || hasPosition}><option value="" disabled={hasCurrentAssignment}>{positions.length ? hasCurrentAssignment ? 'Use Organization to remove assignment' : 'Select a position' : 'No positions available'}</option>{positions.map((position)=><option value={position.id} key={position.id}>{position.name}</option>)}</select></label></>}
    </div>{assignmentIncomplete&&<p className="document-error assignment-validation-error" role="alert">Select both a department and a position before saving.</p>}{assignmentRemovalBlocked&&<p className="document-error assignment-validation-error" role="alert">Remove an existing assignment from Setup → Organization.</p>}{canManageOrganization && assignmentIsComplex ? <div className="organization-assignment-note"><i>i</i><span><strong>Multiple active assignments</strong><small>This employee belongs to more than one department. Manage their assignments in Setup → Organization to preserve the existing structure.</small></span></div> : canManageOrganization && assignmentDisabled ? <div className="organization-assignment-note"><i>i</i><span><strong>Assignment changes are unavailable for inactive employees</strong><small>Set the employee to Active before changing their department or position. Remove an existing assignment in Setup → Organization.</small></span></div> : canManageOrganization ? <div className="organization-assignment-note"><i>i</i><span><strong>Department and position use the company organization records</strong><small>Select both fields to assign this employee. Existing assignments can be changed here, but removal, managers, and multi-department assignments remain in Setup → Organization.</small></span></div> : <div className="organization-assignment-note"><i>i</i><span><strong>Organization assignment is access-controlled</strong><small>Department and position are displayed on the profile. An authorized administrator can update the company structure in Setup → Organization.</small></span></div>}</fieldset>
    <fieldset className="form-section"><legend><span>04</span><div><strong>Emergency contact</strong><small>Who to contact in case of an emergency</small></div></legend><div className="form-section-grid">
      <label><span>Contact name</span><input name="emergencyContactName" value={form.emergencyContactName || ''} onChange={updateField} maxLength="200" placeholder="Full name" /></label>
      <label><span>Relationship</span><input name="emergencyContactRelationship" value={form.emergencyContactRelationship || ''} onChange={updateField} maxLength="100" placeholder="Spouse or parent" /></label>
      <label><span>Phone number</span><input type="tel" name="emergencyContactPhone" value={form.emergencyContactPhone || ''} onChange={updateField} maxLength="40" placeholder="Primary phone number" /></label>
      <label><span>Alternate phone</span><input type="tel" name="emergencyContactAlternatePhone" value={form.emergencyContactAlternatePhone || ''} onChange={updateField} maxLength="40" placeholder="Optional" /></label>
    </div></fieldset>
    <fieldset className="form-section"><legend><span>05</span><div><strong>System access</strong><small>Configure account credentials and permissions</small></div></legend><div className="form-section-grid">
      <label><span>Role / system access *</span><select name="roleId" value={form.roleId || ''} onChange={updateField} required disabled={!roles.length}><option value="" disabled>{roles.length ? 'Select a role' : 'Loading roles…'}</option>{roles.map((role) => <option value={role.id} key={role.id} disabled={role.assignable === false && String(role.id) !== String(form.roleId || '')}>{role.name}{role.assignable === false && String(role.id) !== String(form.roleId || '') ? ' (managed in Roles & Access)' : ''}</option>)}</select><small>Determines this employee's access permissions.</small></label>
      <div className="password-input"><label htmlFor="temporary-password"><span>{mode === 'create' || !form.hasLogin ? 'Temporary password *' : 'New password (optional)'}</span></label><div className="password-control"><input id="temporary-password" type="text" name="temporaryPassword" value={form.temporaryPassword || ''} onChange={updateField} minLength="8" required={mode === 'create' || !form.hasLogin} autoComplete="new-password" placeholder="At least 8 characters" /><button type="button" onClick={generateTemporaryPassword}>Generate password</button></div><small>{mode === 'create' || !form.hasLogin ? 'The employee will use this password for their first login.' : 'Leave blank to keep the current password.'}</small></div>
    </div></fieldset>
    {mode === 'edit' && <fieldset className="form-section document-section"><legend><span>06</span><div><strong>Documents</strong><small>Add identification and employment records</small></div></legend>
      <label className="document-dropzone"><input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={selectDocuments} /><b aria-hidden="true">↑</b><strong>Choose files to upload</strong><small>PDF, DOC, DOCX, JPG or PNG · 10 MB maximum each</small></label>
      {documentError && <p className="document-error" role="alert">{documentError}</p>}
      {documents.length > 0 && <ul className="selected-documents" aria-label="Selected documents">{documents.map((file) => <li key={`${file.name}-${file.lastModified}`}><span>{file.name}</span><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></li>)}</ul>}
    </fieldset>}
    <button className="form-save" type="submit" disabled={saving || assignmentIncomplete || assignmentRemovalBlocked}>{saving ? 'Saving…' : 'Save employee'}</button>
  </form>;
}

function RoleAccess({ user }) {
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState({});
  const [message, setMessage] = useModalMessage();
  const [creating, setCreating] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');
  const permission = effectiveModulePermission(user,'roles');

  async function loadData(preferredId) {
    const [roleResponse, moduleResponse] = await Promise.all([fetch('/api/rbac/roles'), fetch('/api/rbac/modules')]);
    if (!roleResponse.ok || !moduleResponse.ok) throw new Error('Unable to load access controls.');
    const roleData = await roleResponse.json();
    const moduleData = await moduleResponse.json();
    setRoles(roleData.roles);
    setModules(moduleData.modules);
    const nextId = preferredId || selectedId || roleData.roles[0]?.id;
    setSelectedId(nextId);
    const selected = roleData.roles.find((role) => String(role.id) === String(nextId));
    setDraft(permissionMap(selected?.permissions || [], moduleData.modules));
  }

  useEffect(() => { loadData().catch((error) => setMessage(error.message)); }, []);

  function selectRole(role) {
    setSelectedId(role.id);
    setDraft(permissionMap(role.permissions, modules));
    setMessage('');
  }

  function toggleAccessModule(module, operation) {
    const permissionKeys = module.permissionKeys || [module.permissionKey || module.moduleKey];
    setDraft((current) => {
      const enable = !permissionKeys.every((key) => Boolean(current[key]?.[operation]));
      let next = permissionKeys.reduce((result, key) => ({ ...result, [key]: { ...result[key], [operation]: enable } }), current);
      for (const key of permissionKeys) {
        const parentKey = parentModuleByChild[key];
        if (enable && parentKey) next = { ...next, [parentKey]: { ...next[parentKey], [operation]:true } };
        if (!enable && !parentKey) {
          for (const [childKey, childParentKey] of Object.entries(parentModuleByChild)) {
            if (childParentKey === key) next = { ...next, [childKey]: { ...next[childKey], [operation]:false } };
          }
        }
      }
      return next;
    });
  }

  async function savePermissions() {
    setMessage('Saving…');
    const permissions = modules.map((module) => ({ moduleKey: module.moduleKey, ...draft[module.moduleKey] }));
    const response = await fetch(`/api/rbac/roles/${selectedId}/permissions`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions }) });
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) return setMessage(data.error || 'Unable to save permissions.');
    await loadData(selectedId);
    setMessage('Permissions saved.');
  }

  async function createRole(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/rbac/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), description: form.get('description') }) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error);
    setCreating(false);
    await loadData(data.role.id);
    setMessage('Role created. Set its permissions below.');
  }

  async function deleteRole() {
    if (!await confirmModal('Delete this role? This cannot be undone.', 'Delete role?')) return;
    const response = await fetch(`/api/rbac/roles/${selectedId}`, { method: 'DELETE' });
    if (!response.ok) return setMessage((await response.json()).error);
    setSelectedId(null);
    await loadData();
    setMessage('Role deleted.');
  }

  const selected = roles.find((role) => String(role.id) === String(selectedId));
  const accessModules = roleAccessModules(modules);
  const filteredRoles = roles.filter((role)=>`${role.name} ${role.description}`.toLowerCase().includes(roleSearch.trim().toLowerCase()));
  const enabledModuleCount = modules.filter((module)=>draft[module.moduleKey]?.view).length;
  return (
    <section className="rbac-view friendly-rbac">
      <div className="module-title"><div><span>Administration</span><h1>Roles & Access</h1><p>Choose a role, then decide which areas and actions its users can access.</p></div>{permission?.create&&<button onClick={()=>setCreating(!creating)}>{creating?'Cancel':'+ New role'}</button>}</div>
      <div className="rbac-overview"><article><span>Total roles</span><strong>{roles.length}</strong><small>Available access profiles</small></article><article><span>System roles</span><strong>{roles.filter((role)=>role.isSystem).length}</strong><small>Protected defaults</small></article><article><span>Custom roles</span><strong>{roles.filter((role)=>!role.isSystem).length}</strong><small>Created by administrators</small></article><article><span>Modules</span><strong>{modules.length}</strong><small>Permission-controlled areas</small></article></div>
      {creating&&<form className="new-role-form friendly-new-role" onSubmit={createRole}><div><span>Create access profile</span><h2>New role</h2><p>Give the role a recognizable name and explain who should receive it.</p></div><label><span>Role name *</span><input name="name" placeholder="Payroll Manager" required autoFocus/></label><label><span>Description</span><input name="description" placeholder="What should users with this role be responsible for?"/></label><button type="submit">Create and configure</button></form>}
      <div className="rbac-layout">
        <aside className="role-list"><div className="role-list-heading"><span>Roles</span><b>{filteredRoles.length}</b></div><div className="role-search"><span>⌕</span><input value={roleSearch} onChange={(event)=>setRoleSearch(event.target.value)} placeholder="Find a role…" aria-label="Find a role"/></div><div className="role-list-items">{filteredRoles.map((role)=><button className={String(role.id)===String(selectedId)?'selected':''} onClick={()=>selectRole(role)} key={role.id}><span><strong>{role.name}</strong><small>{role.description||'No description provided'}</small></span>{role.isSystem?<i>System</i>:<i>Custom</i>}</button>)}{!filteredRoles.length&&<p>No roles match your search.</p>}</div></aside>
        <div className="permission-panel">
          <div className="permission-heading"><div><span>Permission profile</span><h2>{selected?.name||'Select a role'}</h2><p>{selected?.description||'Choose a role from the list to review its access.'}</p>{selected&&<small>{enabledModuleCount} of {modules.length} modules visible</small>}</div><div>{selected&&!selected.isSystem&&permission?.delete&&<button className="delete-role" onClick={deleteRole}>Delete role</button>}{selected&&permission?.update&&<button className="save-access" onClick={savePermissions} disabled={selected?.name==='Administrator'}>{selected?.name==='Administrator'?'Full access':'Save changes'}</button>}</div></div>
          {selected&&<div className="permission-guide"><i>i</i><span><strong>How permissions work</strong><small>View lets users open a module. Create, Update, and Delete control what they can do inside it. Parent access is enabled automatically when a child module is selected.</small></span></div>}
          <div className="permission-table"><div className="permission-row permission-head"><span>Module</span>{['Create','View','Update','Delete'].map((operation)=><span key={operation}>{operation}</span>)}</div>{accessModules.map((module)=>{const permissionKeys=module.permissionKeys||[module.permissionKey||module.moduleKey];const administratorModuleLockedOff=selected?.name==='Administrator'&&administratorHiddenModuleKeys.has(module.moduleKey);return <div className={`permission-row ${module.isParent?'parent-module':''} ${module.isChild?'child-module':''}`} key={module.moduleKey}><div><strong>{module.name}</strong><small>{module.description}</small></div>{['create','view','update','delete'].map((operation)=><label key={operation} aria-label={`${module.name}: ${operation}`} title={administratorModuleLockedOff?'Employee self-service module hidden from Administrator':selected?.name==='Administrator'?'Administrator has full access':module.isParent?'Parent permission required by its child modules':undefined}><input type="checkbox" checked={!administratorModuleLockedOff&&(selected?.name==='Administrator'||permissionKeys.every((key)=>Boolean(draft[key]?.[operation])))} disabled={selected?.name==='Administrator'||!permission?.update} onChange={()=>toggleAccessModule(module,operation)}/><span/></label>)}</div>})}</div>
        </div>
      </div>
    </section>
  );
}

function roleAccessModules(modules) {
  const parentLabels = {
    company: 'Setup', site_settings: 'Setup', organization: 'Setup',
    workforce: 'Workforce', leave_management: 'Setup', roles: 'Setup',
    shift_management: 'Setup', time_entries: 'Timetracking', exemption_report: 'Timetracking', requests: 'Timetracking', leave_application: 'Timetracking', overtime_request: 'Timetracking', shift_change: 'Timetracking',
    scheduler: 'Utilities', device_users: 'Utilities',
    payroll_setup: 'Payroll', tax_configuration: 'Payroll', payout_view: 'Payroll'
  };
  const parentKeys = ['setup','workforce_module','maintenance','time_tracking','utilities','payroll'];
  return modules.map((module) => parentLabels[module.moduleKey]
    ? { ...module, isChild:true, parentLabel:parentLabels[module.moduleKey] }
    : { ...module, isParent:parentKeys.includes(module.moduleKey) });
}

function permissionMap(permissions, modules) {
  return Object.fromEntries(modules.map((module) => {
    const current = permissions.find((permission) => permission.moduleKey === module.moduleKey);
    return [module.moduleKey, { create: Boolean(current?.create), view: Boolean(current?.view), update: Boolean(current?.update), delete: Boolean(current?.delete) }];
  }));
}

function LogoutConfirmation({ branding = defaultSiteSettings, themeMode, onThemeModeChange }) {
  const [user, setUser] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useModalMessage('error');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => setUser(data.user))
      .catch(() => window.location.replace('/'));
  }, []);

  async function confirmLogout() {
    setProcessing(true);
    setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to sign out. Please try again.');
      window.location.replace('/');
    } catch (logoutError) {
      setError(logoutError.message);
      setProcessing(false);
    }
  }

  if (!user) return <div className="session-loading">Checking your session…</div>;
  const initials = user.displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="logout-page">
      <header className="site-header"><div className="site-header-inner"><Logo branding={branding} /><ThemeToggle mode={themeMode} onChange={onThemeModeChange} /></div></header>
      <main className="logout-main">
        <section className="logout-card" aria-labelledby="logout-title">
          <div className="logout-symbol" aria-hidden="true"><span>↪</span></div>
          <span className="eyebrow">Secure sign out</span>
          <h1 id="logout-title">Ready to leave?</h1>
          <p>You’ll need to sign in again to access your dashboard and account information.</p>
          <div className="logout-user"><i>{initials}</i><span><strong>{user.displayName}</strong><small>{user.email}</small></span></div>
          <div className="logout-actions">
            <button className="cancel-button" type="button" onClick={() => window.location.assign('/dashboard')} disabled={processing}>Cancel</button>
            <button className="confirm-button" type="button" onClick={confirmLogout} disabled={processing}>{processing ? 'Signing out…' : 'Yes, sign me out'} <span>→</span></button>
          </div>
        </section>
      </main>
      <footer><span>© 2026 {branding.siteName}</span><span>{branding.footerText}</span></footer>
    </div>
  );
}
