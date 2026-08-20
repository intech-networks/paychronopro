import { createContext, useContext, useEffect, useState } from 'react';

const DeviceUsersModuleContext = createContext(false);
const administratorHiddenModuleKeys = new Set(['leave_application', 'overtime_request', 'shift_change']);
const leaveBalanceFields = [
  ['vacationLeave', 'Vacation'],
  ['sickLeave', 'Sick'],
  ['emergencyLeave', 'Emergency']
];
const leaveTypeLabels = { vacation:'Vacation Leave', sick:'Sick Leave', emergency:'Emergency Leave' };

const parentModuleByChild = {
  workforce:'maintenance', leave_management:'maintenance', departments:'maintenance', roles:'maintenance',
  time_entries:'time_tracking', shift_management:'time_tracking', requests:'time_tracking', leave_application:'time_tracking', overtime_request:'time_tracking', shift_change:'time_tracking',
  scheduler:'utilities', device_users:'utilities'
};

function effectiveModulePermission(user, moduleKey) {
  const permission = user.permissions.find((item) => item.moduleKey === moduleKey);
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

function Logo() {
  return <a className="wordmark" href="/" aria-label="PayTimePro home"><span>PayTime</span><strong>Pro</strong></a>;
}

export default function App() {
  const page = window.location.pathname === '/dashboard' ? <Dashboard /> : window.location.pathname === '/logout' ? <LogoutConfirmation /> : <Login />;
  return <>{page}<NotificationModal /></>;
}

function Login() {
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
      <header className="site-header"><Logo /></header>
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
          <p className="support">Need access? <a href="mailto:hello@paytimepro.com">Contact your administrator</a></p>
        </section>
      </main>
      <footer><span>© 2026 PayTimePro</span><span>Secure workforce access</span></footer>
    </div>
  );
}

function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState('overview');
  const [maintenanceOpen, setMaintenanceOpen] = useState(true);
  const [utilitiesOpen, setUtilitiesOpen] = useState(true);
  const [timeTrackingOpen, setTimeTrackingOpen] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) throw new Error('unauthorized');
        return response.json();
      })
      .then((data) => {
        setUser(data.user);
        const visibleModules = data.user.permissions.filter((permission) => permission.view && !(data.user.role === 'Administrator' && administratorHiddenModuleKeys.has(permission.moduleKey))).map((permission) => permission.moduleKey);
        const parentByChild = { workforce:'maintenance', leave_management:'maintenance', departments:'maintenance', roles:'maintenance', time_entries:'time_tracking', shift_management:'time_tracking', requests:'time_tracking', leave_application:'time_tracking', overtime_request:'time_tracking', shift_change:'time_tracking', scheduler:'utilities', device_users:'utilities' };
        const maintenanceVisible = visibleModules.includes('maintenance') && ['workforce', 'departments', 'roles'].some((moduleKey) => visibleModules.includes(moduleKey));
        const utilitiesVisible = visibleModules.includes('utilities') && ['scheduler', 'device_users'].some((moduleKey) => visibleModules.includes(moduleKey));
        let savedModule = '';
        try { savedModule = window.localStorage.getItem('paytimepro.activeModule') || ''; } catch {}
        const savedParent = parentByChild[savedModule];
        const savedModuleAllowed = (visibleModules.includes(savedModule) && (!savedParent || visibleModules.includes(savedParent)))
          || (savedModule === 'maintenance' && maintenanceVisible)
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

  if (loading) return <div className="session-loading">Loading your session…</div>;
  const initials = user.displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const canView = (moduleKey) => Boolean(effectiveModulePermission(user,moduleKey)?.view);
  const maintenanceItems = [
    ['workforce', '♙', 'Workforce'],
    ['leave_management', '▦', 'Leave Management'],
    ['departments', '▦', 'Departments'],
    ['roles', '▦', 'Roles & Access']
  ].filter(([moduleKey]) => canView(moduleKey));
  const utilityItems = [
    ['scheduler', '▦', 'Sync Agent']
  ].filter(([moduleKey]) => canView(moduleKey));
  const navItems = [
    ['overview', '⌂', 'Overview'],
    ['payroll', '$', 'Payroll'],
    ['reports', '▤', 'Reports']
  ].filter(([moduleKey]) => canView(moduleKey));

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Logo />
        <nav aria-label="Dashboard navigation">
          {navItems.slice(0, 1).map(([moduleKey, icon, label]) => <button className={activeModule === moduleKey ? 'active' : ''} type="button" key={moduleKey} onClick={() => setActiveModule(moduleKey)}><span>{icon}</span>{label}</button>)}
          {canView('maintenance') && maintenanceItems.length > 0 && <div className="sidebar-nav-group">
            <button className={activeModule === 'maintenance' || maintenanceItems.some(([moduleKey]) => moduleKey === activeModule) ? 'active group-active' : ''} type="button" onClick={() => { setMaintenanceOpen((current) => !current); setActiveModule('maintenance'); }} aria-expanded={maintenanceOpen}><span>⚙</span>Maintenance<b>{maintenanceOpen ? '⌃' : '⌄'}</b></button>
            {maintenanceOpen && <div className="sidebar-subnav">{maintenanceItems.map(([moduleKey, icon, label]) => <button className={activeModule === moduleKey ? 'active' : ''} type="button" key={moduleKey} onClick={() => setActiveModule(moduleKey)}><span>{icon}</span>{label}</button>)}</div>}
          </div>}
          {canView('utilities') && (utilityItems.length > 0 || canView('device_users')) && <div className="sidebar-nav-group">
            <button className={activeModule === 'utilities' || activeModule === 'device_users' || utilityItems.some(([moduleKey]) => moduleKey === activeModule) ? 'active group-active' : ''} type="button" onClick={() => { setUtilitiesOpen((current) => !current); setActiveModule('utilities'); }} aria-expanded={utilitiesOpen}><span>⌘</span>Utilities<b>{utilitiesOpen ? '⌃' : '⌄'}</b></button>
            {utilitiesOpen && <div className="sidebar-subnav">{utilityItems.map(([moduleKey, icon, label]) => <button className={activeModule === moduleKey ? 'active' : ''} type="button" key={moduleKey} onClick={() => setActiveModule(moduleKey)}><span>{icon}</span>{label}</button>)}{canView('device_users')&&<button className={activeModule === 'device_users' ? 'active' : ''} type="button" onClick={() => setActiveModule('device_users')}><span>•</span>Device Users</button>}</div>}
          </div>}
          {canView('time_tracking') && ['time_entries','shift_management','requests','leave_application','overtime_request','shift_change'].some(canView) && <div className="sidebar-nav-group">
            <button className={['time_tracking', 'time_entries', 'shift_management', 'requests', 'leave_application', 'overtime_request', 'shift_change'].includes(activeModule) ? 'active group-active' : ''} type="button" onClick={() => { setTimeTrackingOpen((current) => !current); setActiveModule('time_tracking'); }} aria-expanded={timeTrackingOpen}><span>◷</span>Timetracking<b>{timeTrackingOpen ? '⌃' : '⌄'}</b></button>
            {timeTrackingOpen && <div className="sidebar-subnav">{canView('time_entries')&&<button className={activeModule === 'time_entries' ? 'active' : ''} type="button" onClick={() => setActiveModule('time_entries')}><span>•</span>Time Entries</button>}{canView('shift_management')&&<button className={activeModule === 'shift_management' ? 'active' : ''} type="button" onClick={() => setActiveModule('shift_management')}><span>•</span>Shift Management</button>}{canView('requests')&&<button className={activeModule === 'requests' ? 'active' : ''} type="button" onClick={() => setActiveModule('requests')}><span>•</span>Requests</button>}{canView('leave_application')&&<button className={activeModule === 'leave_application' ? 'active' : ''} type="button" onClick={() => setActiveModule('leave_application')}><span>•</span>Leave Application</button>}{canView('overtime_request')&&<button className={activeModule === 'overtime_request' ? 'active' : ''} type="button" onClick={() => setActiveModule('overtime_request')}><span>•</span>Overtime Request</button>}{canView('shift_change')&&<button className={activeModule === 'shift_change' ? 'active' : ''} type="button" onClick={() => setActiveModule('shift_change')}><span>•</span>Shift Change</button>}</div>}
          </div>}
          {navItems.slice(1).map(([moduleKey, icon, label]) => <button className={activeModule === moduleKey ? 'active' : ''} type="button" key={moduleKey} onClick={() => setActiveModule(moduleKey)}><span>{icon}</span>{label}</button>)}
        </nav>
      </aside>
      <div className="dashboard-content">
        <header className="dashboard-topbar" aria-label="Dashboard header">
          <div className="header-user">
            <i>{initials}</i>
            <span><strong>{user.displayName}</strong><small>{user.role}</small></span>
            <button type="button" onClick={() => window.location.assign('/logout')} aria-label="Sign out">Sign out <b>↪</b></button>
          </div>
        </header>
        <main className="dashboard-main" id={activeModule} aria-label={`${activeModule} module`}>
          {activeModule === 'overview' && <Overview user={user} onNavigate={setActiveModule} />}
          {activeModule === 'maintenance' && <Maintenance user={user} onNavigate={setActiveModule} />}
          {activeModule === 'utilities' && <Utilities user={user} onNavigate={setActiveModule} />}
          {activeModule === 'roles' && <RoleAccess user={user} />}
          {activeModule === 'workforce' && <Workforce user={user} />}
          {activeModule === 'leave_management' && <LeaveManagement user={user} />}
          {activeModule === 'departments' && <Departments user={user} />}
          {activeModule === 'time_tracking' && <Timetracking user={user} onNavigate={setActiveModule} />}
          {activeModule === 'time_entries' && <TimeEntries user={user} />}
          {activeModule === 'shift_management' && <ShiftManagement user={user} />}
          {activeModule === 'requests' && <Requests user={user} />}
          {activeModule === 'leave_application' && <LeaveApplication user={user} />}
          {['overtime_request', 'shift_change'].includes(activeModule) && <ShiftCalendarModule moduleKey={activeModule} />}
          {activeModule === 'scheduler' && <Scheduler user={user} />}
          {activeModule === 'device_users' && <DeviceUsers user={user} />}
          {['payroll', 'reports'].includes(activeModule) && <ModulePlaceholder moduleKey={activeModule} />}
        </main>
      </div>
    </div>
  );
}

function Overview({ user, onNavigate }) {
  const childModuleKeys = ['workforce','leave_management','departments','roles','time_entries','shift_management','requests','leave_application','overtime_request','shift_change','scheduler','device_users'];
  const visibleModules = user.permissions.filter((permission) => permission.view && permission.moduleKey !== 'overview' && !childModuleKeys.includes(permission.moduleKey));
  return <section className="overview-view"><div className="module-title"><div><span>Workspace</span><h1>Welcome, {user.displayName.split(' ')[0]}</h1><p>Choose a module to continue.</p></div></div><div className="module-grid">{visibleModules.map((permission) => <button type="button" key={permission.moduleKey} onClick={() => onNavigate(permission.moduleKey)}><strong>{permission.moduleName}</strong><span>Open module →</span></button>)}</div></section>;
}

function Maintenance({ user, onNavigate }) {
  const maintenanceModules = user.permissions.filter((permission) => ['workforce', 'leave_management', 'departments', 'roles'].includes(permission.moduleKey) && effectiveModulePermission(user,permission.moduleKey)?.view);
  return <section className="overview-view"><div className="module-title"><div><span>Administration</span><h1>Maintenance</h1><p>Manage workforce records, leave, departments, and access controls.</p></div></div><div className="module-grid">{maintenanceModules.map((permission) => <button type="button" key={permission.moduleKey} onClick={() => onNavigate(permission.moduleKey)}><strong>{permission.moduleName}</strong><span>Open submodule →</span></button>)}</div></section>;
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

  return <section className="leave-management-view">
    <div className="module-title"><div><span>Maintenance</span><h1>Leave Management</h1><p>Assign available leave-day balances to active employees.</p></div></div>
    <div className="leave-management-toolbar"><form onSubmit={searchEmployees}><span>⌕</span><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search by employee name, ID, department, role, or email…" /><button type="submit" disabled={loading}>Search</button></form><div><span>{loading?'Loading…':`${employees.length} active ${employees.length===1?'employee':'employees'}`}</span><button type="button" onClick={showAllEmployees} disabled={loading}>Show all</button></div></div>
    <div className="leave-balance-table">
      <div className="leave-balance-row leave-balance-head"><span>Employee</span><span>Employee ID</span>{leaveBalanceFields.map(([,label])=><span key={label}>{label} leave</span>)}<span>{permission?.update?'Action':'Access'}</span></div>
      {!loading&&employees.map((employee)=><form className="leave-balance-row" key={employee.id} onSubmit={(event)=>saveBalances(event,employee)}><div className="leave-employee-cell"><i>{employee.firstName[0]}{employee.lastName[0]}</i><span><strong>{employeeName(employee)}</strong><small>{employee.department||'No department'} · {employee.jobTitle||'No role'}</small></span></div><span className="leave-employee-number">{employee.employeeNumber}</span>{leaveBalanceFields.map(([key,label])=><label key={key}><span>{label} leave days</span><input type="number" min="0" max="999" step="0.5" value={drafts[employee.id]?.[key]??''} onChange={(event)=>updateBalance(employee.id,key,event.target.value)} disabled={!permission?.update||savingEmployeeId===employee.id} aria-label={`${label} leave days for ${employeeName(employee)}`} required /></label>)}{permission?.update?<button type="submit" disabled={!hasChanges(employee)||savingEmployeeId===employee.id}>{savingEmployeeId===employee.id?'Saving…':'Save'}</button>:<small className="leave-view-only">View only</small>}</form>)}
      {loading&&<div className="leave-balance-empty"><strong>Loading active employees…</strong></div>}
      {!loading&&!employees.length&&<div className="leave-balance-empty"><strong>No active employees found.</strong><small>Try another search or select Show all.</small></div>}
    </div>
  </section>;
}

function Utilities({ user, onNavigate }) {
  const utilityModules = user.permissions.filter((permission) => ['scheduler','device_users'].includes(permission.moduleKey) && effectiveModulePermission(user,permission.moduleKey)?.view);
  return <section className="overview-view"><div className="module-title"><div><span>Tools</span><h1>Utilities</h1><p>Access synchronization and other workforce utilities.</p></div></div><div className="module-grid">{utilityModules.map((permission) => <button type="button" key={permission.moduleKey} onClick={() => onNavigate(permission.moduleKey)}><strong>{permission.moduleName}</strong><span>Open utility →</span></button>)}</div></section>;
}

const moduleCopy = {
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
    setStatus({ ...data, agent: data.agent ? { ...data.agent, lastError: '' } : null });
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
  return <section className="overview-view"><div className="module-title"><div><span>Utilities</span><h1>Sync Agent</h1><p>Synchronize users and attendance records through the on-site MB460 agent.</p></div></div><SchedulerOverview online={online} status={status} error={error} permission={permission} syncConfiguration={syncConfiguration} setSyncConfiguration={setSyncConfiguration} savingConfiguration={savingConfiguration} onSave={saveSyncConfiguration} /><section className="device-registry"><div className="section-heading"><div><span>Local network</span><h3>Available devices</h3></div>{permission?.create&&<button type="button" onClick={()=>showDeviceForm?closeDeviceForm():setShowDeviceForm(true)}>{showDeviceForm?'Cancel':'Add device'}</button>}</div>{showDeviceForm&&<form className="device-add-form" onSubmit={addDevice}><label><span>Device name</span><input value={deviceForm.name} onChange={(event)=>setDeviceForm({...deviceForm,name:event.target.value})} placeholder="Main office MB460" required /></label><label><span>IP address</span><input value={deviceForm.ip} onChange={(event)=>setDeviceForm({...deviceForm,ip:event.target.value})} placeholder="192.168.1.11" required /></label><label><span>Port</span><input type="number" min="1" max="65535" value={deviceForm.port} onChange={(event)=>setDeviceForm({...deviceForm,port:event.target.value})} required /></label><button className="primary-action" type="submit">{editingDeviceId?'Save device':'Add device'}</button></form>}<div className="device-list">{status.devices.map((device)=>{const deviceJobs=status.jobs.filter((item)=>String(item.deviceId)===String(device.id));const job=deviceJobs.find((item)=>['pending','running'].includes(item.status));const backup=status.backups.find((item)=>String(item.deviceId)===String(device.id));return <article key={device.id}><i className={`device-dot ${device.status}`} /><div><strong>{device.name}</strong><small>{device.ip}:{device.port}</small></div><span className={`device-status ${device.status}`}>{device.status}</span><time>{device.lastCheckedAt?`Checked ${new Date(device.lastCheckedAt).toLocaleString()}`:device.status==='unknown'?'Checking connectivity…':'Not checked yet'}</time><div className="device-actions">{permission?.update&&<button className="device-sync-button" type="button" onClick={()=>requestSync(device.id)} disabled={!online||Boolean(job)||syncingDeviceId===device.id}>{job?`Sync ${job.status}…`:syncingDeviceId===device.id?'Requesting…':'Sync'}</button>}{permission?.update&&<button type="button" onClick={()=>refreshDevice(device.id)} disabled={!online||device.status==='unknown'||refreshingDeviceId===device.id}>{device.status==='unknown'||refreshingDeviceId===device.id?'Checking…':'Refresh'}</button>}{permission?.update&&<button type="button" onClick={()=>editDevice(device)}>Edit</button>}{permission?.delete&&<button className="remove-device" type="button" onClick={()=>removeDevice(device)}>Remove</button>}</div><DeviceSyncNotification job={deviceJobs[0]} backup={backup} />{device.lastError&&<p>{device.lastError}</p>}</article>;})}{!status.devices.length&&<p className="empty-device-list">No devices registered yet.</p>}</div></section></section>;
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
  return <DeviceUsersModuleContext.Provider value><section className="overview-view"><div className="module-title"><div><span>Utilities</span><h1>Device Users</h1><p>Push employees to attendance devices and reconcile device user records.</p></div></div><DeviceUserPushSection devices={devices} permission={permission} /></section></DeviceUsersModuleContext.Provider>;
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
  return <section className="device-user-push"><div className="section-heading"><div><span>Device users</span><h3>Push and reconcile users</h3><p>Employee ID is used for both device identifiers. Role is always Normal User.</p></div><div className="device-user-push-actions"><select value={deviceId} onChange={(event)=>setDeviceId(event.target.value)}>{devices.map((device)=><option key={device.id} value={device.id}>{device.name}</option>)}</select>{permission?.update&&<button type="button" onClick={checkUsers} disabled={!deviceId||checking||['pending','running'].includes(check?.status)}>{checking||['pending','running'].includes(check?.status)?'Checking…':'Check device users'}</button>}{permission?.update&&<button className="primary-action" type="button" onClick={pushUsers} disabled={!deviceId||!eligible.length||pushing}>{pushing?'Queueing…':`Push ${eligible.length} new user${eligible.length===1?'':'s'}`}</button>}</div></div>{check?.status==='completed'&&<p className="device-user-message">Last check found {check.usersFound} device users and queued {check.usersQueued} missing site users.</p>}{check?.status==='failed'&&<p className="device-user-message form-error">Check failed: {check.error}</p>}<div className="device-user-list">{users.map((user)=><article key={user.id}><div><strong>{user.firstName} {user.lastName}</strong><small>Employee ID / UID: {user.employeeId}</small></div><span>Normal User</span><b className={user.eligible?(user.status||'ready'):'ineligible'}>{user.eligible?(user.status||'Ready'):'Ineligible ID'}</b>{user.error&&<small>{user.error}</small>}</article>)}{!loading&&!users.length&&<p>All eligible site users currently exist on this device.</p>}{loading&&<p>Loading users…</p>}</div></section>;
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
    <div className="module-title"><div><span>Timetracking</span><h1>Requests</h1><p>Review requests submitted by employees assigned to your department.</p></div><button className="view-request-calendar" type="button" onClick={()=>setCalendarOpen(true)}>View Calendar</button></div>
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

  return <section className="overview-view leave-application-view">
    <div className="module-title"><div><span>Timetracking</span><h1>Leave Application</h1><p>Review your available credits and file a leave request.</p></div></div>
    <section className="leave-credit-section"><div className="leave-credit-heading"><span>Available balance</span><h2>{employee?`${employeeName(employee)}'s remaining leave credits`:'Remaining leave credits'}</h2></div><div className="leave-credit-cards">{leaveBalanceFields.map(([key,label])=>{const credit=leaveBalances?.[key];return <article key={key}><span>{label} leave</span><strong>{loading||credit==null?'—':Number(credit).toLocaleString(undefined,{maximumFractionDigits:2})}</strong><small>{loading||credit==null?'Balance unavailable':Number(credit)===1?'day remaining':'days remaining'}</small></article>;})}</div></section>
    <section className="leave-request-card"><div className="leave-request-heading"><span>New request</span><h2>File a leave request</h2><p>Choose the leave type and inclusive date range. Credits are reserved when the request is filed.</p></div><form onSubmit={fileLeaveRequest}><label><span>Leave type</span><select value={leaveType} onChange={(event)=>setLeaveType(event.target.value)} disabled={submitting}><option value="vacation">Vacation Leave</option><option value="sick">Sick Leave</option><option value="emergency">Emergency Leave</option></select></label><div className="leave-request-dates"><label><span>From</span><input type="date" value={startDate} max={endDate||undefined} onChange={(event)=>setStartDate(event.target.value)} disabled={submitting} required /></label><i>to</i><label><span>To</span><input type="date" value={endDate} min={startDate||undefined} onChange={(event)=>setEndDate(event.target.value)} disabled={submitting} required /></label></div>{startDate&&endDate&&<p className={rangeValid&&requestedDays?'leave-request-summary':'form-error'}>{!rangeValid?'End date must be on or after the start date.':!requestedDays?'The selected range contains only rest days.':`${requestedDays} working ${requestedDays===1?'day':'days'} will be deducted. ${excludedRestDays?`${excludedRestDays} rest ${excludedRestDays===1?'day is':'days are'} excluded.`:'No rest days fall within this range.'}`}</p>}{permission?.create?<button className="primary-action" type="submit" disabled={loading||submitting||!rangeValid||!requestedDays}>{submitting?'Filing request…':'File leave request'}</button>:<p className="rbac-message">You have view-only access to leave applications.</p>}</form></section>
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
  return <section className="overview-view"><div className="module-title"><div><span>Workforce time</span><h1>Timetracking</h1><p>Review attendance, shifts, and employee requests.</p></div></div><div className="module-grid">{canView('time_entries')&&<button type="button" onClick={() => onNavigate('time_entries')}><strong>Time Entries</strong><span>Open submodule →</span></button>}{canView('shift_management')&&<button type="button" onClick={() => onNavigate('shift_management')}><strong>Shift Management</strong><span>Open submodule →</span></button>}{canView('requests')&&<button type="button" onClick={() => onNavigate('requests')}><strong>Requests</strong><span>Open submodule →</span></button>}{canView('leave_application')&&<button type="button" onClick={() => onNavigate('leave_application')}><strong>Leave Application</strong><span>Open submodule →</span></button>}{canView('overtime_request')&&<button type="button" onClick={() => onNavigate('overtime_request')}><strong>Overtime Request</strong><span>Open submodule →</span></button>}{canView('shift_change')&&<button type="button" onClick={() => onNavigate('shift_change')}><strong>Shift Change</strong><span>Open submodule →</span></button>}</div></section>;
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
  return <section className="overview-view shift-management-view"><div className="module-title"><div><span>Timetracking</span><h1>Shift Management</h1><p>Assign a standard or custom work shift to each employee.</p></div></div><form className="shift-assignment-form" onSubmit={assignShift}><div className="shift-form-heading"><div><span>Shift assignment</span><h2>{selectedEmployee ? employeeName(selectedEmployee) : 'Select an employee'}</h2></div></div><label><span>Employee</span><select value={employeeId} onChange={(event)=>setEmployeeId(event.target.value)} disabled={loading||saving} required><option value="">{loading?'Loading employees…':'Select an employee'}</option>{employees.map((employee)=><option key={employee.id} value={employee.id}>{employeeName(employee)} · {employee.employeeNumber}</option>)}</select></label><fieldset><legend>Shift</legend><label><input type="radio" name="shiftType" value="eight_to_five" checked={shiftType==='eight_to_five'} onChange={(event)=>chooseShift(event.target.value)} /><span><strong>8:00 AM to 5:00 PM</strong><small>Standard day shift</small></span></label><label><input type="radio" name="shiftType" value="nine_to_six" checked={shiftType==='nine_to_six'} onChange={(event)=>chooseShift(event.target.value)} /><span><strong>9:00 AM to 6:00 PM</strong><small>Late day shift</small></span></label><label><input type="radio" name="shiftType" value="custom" checked={shiftType==='custom'} onChange={(event)=>chooseShift(event.target.value)} /><span><strong>Custom shift</strong><small>Define a custom time range</small></span></label></fieldset>{shiftType==='custom'&&<div className="custom-shift-range"><label><span>Starts at</span><input type="time" value={startTime} onChange={(event)=>setStartTime(event.target.value)} required /></label><i>to</i><label><span>Ends at</span><input type="time" value={endTime} onChange={(event)=>setEndTime(event.target.value)} required /></label></div>}<fieldset className="work-days-fieldset"><legend>Working days</legend>{weekdays.map(([value,label])=><label key={value}><input type="checkbox" checked={workDays.includes(value)} onChange={(event)=>setWorkDays((current)=>event.target.checked?[...current,value]:current.filter((day)=>day!==value))} /><span><strong>{label}</strong></span></label>)}</fieldset>{message&&<p className={message.includes('successfully')?'form-success':'form-error'} role="status">{message}</p>}{permission?.update&&<button className="primary-action" type="submit" disabled={!employeeId||saving}>{saving?'Assigning…':'Assign shift'}</button>}{!permission?.update&&<p className="rbac-message">You have view-only access to shift assignments.</p>}</form></section>;
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
  const departmentManager = user.role === 'Department Manager';

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

  return <section className="time-tracking-view">
    <div className="module-title"><div><span>Timetracking</span><h1>Time Entries</h1><p>{selfService?'Review your attendance records.':departmentManager?'Select an employee assigned to your department to review their time records.':'Find an employee to view or manage their time records.'}</p></div></div>
    {!selfService&&<>
    <div className="time-employee-panels has-selection">
    <div className="selected-time-employee"><span>Selected employee</span><div><i className={selectedEmployee?'':'empty'}>{selectedEmployee?`${selectedEmployee.firstName[0]}${selectedEmployee.lastName[0]}`:''}</i><div><strong>{selectedEmployee?employeeName(selectedEmployee):''}</strong><small>{selectedEmployee?`${selectedEmployee.employeeNumber} · ${selectedEmployee.email}`:''}</small></div><p><strong>{selectedEmployee?(selectedEmployee.jobTitle||'No job title'):''}</strong><small>{selectedEmployee?(selectedEmployee.department||'No department'):''}</small></p><button type="button" onClick={() => setShowEmployeeSelector(true)}>Select</button></div></div>
    {showEmployeeSelector&&<div className="time-employee-selector-modal" role="dialog" aria-modal="true" aria-labelledby="time-employee-selector-title"><button className="time-employee-selector-scrim" type="button" onClick={()=>setShowEmployeeSelector(false)} aria-label="Close employee selector" /><div className="time-employee-selector-dialog"><div className="time-employee-selector-header"><div><span>Time entries</span><h2 id="time-employee-selector-title">Select employee</h2></div><button type="button" onClick={()=>setShowEmployeeSelector(false)} aria-label="Close">×</button></div>
    <div className="employee-selector-panel">
      <label htmlFor="time-employee-search">{departmentManager?'Select an employee from your department':'Select employee'}</label>
      <div className="time-search-actions"><div className="time-employee-search"><span>⌕</span><input id="time-employee-search" value={search} onChange={changeTimeEmployeeSearch} placeholder="Search by name, employee ID, role, department, or email…" autoComplete="off" />{searching && <small>Searching…</small>}</div><button type="button" onClick={showAllTimeEmployees}>Show all</button></div>
      {showEmployeeResults && !searching && <div className="time-employee-results" role="listbox" aria-label="Employee search results">{employees.map((employee) => <button type="button" role="option" aria-selected={selectedEmployee?.id === employee.id} key={employee.id} onClick={() => selectEmployee(employee)}><i>{employee.firstName[0]}{employee.lastName[0]}</i><span><strong>{employeeName(employee)}</strong><small>{employee.employeeNumber} · {employee.jobTitle || 'No job title'} · {employee.department || 'No department'}</small></span><b className={`status-${employee.employmentStatus}`}>{employee.employmentStatus}</b></button>)}{!employees.length && <p>No employees match your search.</p>}</div>}
    </div>
    </div></div>}
    </div>
    </>}
    <section className="time-entry-section"><div className="time-entry-heading"><div><span>Time entries</span><h2>{selectedEmployee?employeeName(selectedEmployee):''}</h2><p>{selectedEmployee?'One row is shown for every date in the selected range.':''}</p></div><div className="date-range-controls"><label><span>From</span><input type="date" value={selectedEmployee?startDate:''} onChange={(event) => setStartDate(event.target.value)} disabled={!selectedEmployee} /></label><i>to</i><label><span>To</span><input type="date" value={selectedEmployee?endDate:''} onChange={(event) => setEndDate(event.target.value)} disabled={!selectedEmployee} /></label></div></div>
      {selectedEmployee&&rangeError ? <p className="rbac-message" role="alert">{rangeError}</p> : <><div className="time-entry-summary"><span>{selectedEmployee?`${dateRows.length} ${dateRows.length===1?'day':'days'} in range`:''}</span><span>{selectedEmployee?(loadingEntries?'Loading entries…':`${timeEntries.length} recorded ${timeEntries.length===1?'entry':'entries'}`):''}</span></div><div className="time-entry-table"><div className="time-entry-row time-entry-head"><span>Date</span><span>Shift</span><span>Clock in</span><span>Clock out</span><span>Clock in</span><span>Clock out</span><span>Clock in</span><span>Clock out</span></div>{selectedEmployee&&dateRows.map((date) => {const punches=entriesByDate[date.value]||[];const scheduled=employeeShift?.workDays?.includes(date.dayName);return <div className="time-entry-row" key={date.value}><div><strong>{date.weekday}</strong><small>{date.label}</small></div><span className="employee-shift-cell">{employeeShift?(scheduled?shiftRange:'Rest day'):'Not assigned'}</span>{Array.from({length:6},(_,index)=><span key={index}>{punches[index]?new Date(punches[index]).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—'}</span>)}</div>;})}</div></>}
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
  employeeNumber: '', firstName: '', lastName: '', preferredName: '', email: '',
  phone: '', jobTitle: '', department: '', hireDate: '', employmentStatus: 'active',
  emergencyContactName: '', emergencyContactRelationship: '', emergencyContactPhone: '',
  emergencyContactAlternatePhone: '', temporaryPassword: '', roleId: '', roleName: '',
  documents: [], hasLogin: false
};

function Workforce({ user }) {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [showingAll, setShowingAll] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(emptyEmployee);
  const [message, setMessage] = useModalMessage();
  const [saving, setSaving] = useState(false);
  const [roleOptions, setRoleOptions] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const permission = effectiveModulePermission(user,'workforce');

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

  async function openCreate() {
    setForm(emptyEmployee);
    setEditor({ mode: 'create' });
    setMessage('');
    try {
      const [roleResponse, departmentResponse] = await Promise.all([fetch('/api/workforce/role-options'), fetch('/api/workforce/department-options')]);
      const roleData = await roleResponse.json();
      const departmentData = await departmentResponse.json();
      if (!roleResponse.ok || !departmentResponse.ok) throw new Error(roleData.error || departmentData.error || 'Unable to load employee options.');
      setRoleOptions(roleData.roles);
      setDepartmentOptions(departmentData.departments);
      const defaultRole = roleData.roles.find((role) => role.name === 'Employee') || roleData.roles[0];
      setForm((current) => ({ ...current, roleId: defaultRole ? String(defaultRole.id) : '' }));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function openProfile(employee, mode = 'view') {
    setForm({ ...emptyEmployee, ...employee, hireDate: employee.hireDate ? employee.hireDate.slice(0, 10) : '' });
    setEditor({ mode, employee });
    setMessage('');
    try {
      const response = await fetch(`/api/workforce/${employee.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load employee profile.');
      setForm({ ...emptyEmployee, ...data.employee, hireDate: data.employee.hireDate ? data.employee.hireDate.slice(0, 10) : '' });
      setEditor({ mode, employee: data.employee });
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function beginEdit() {
    setEditor((current) => ({ ...current, mode: 'edit' }));
    setMessage('');
    try {
      const [roleResponse, departmentResponse] = await Promise.all([fetch('/api/workforce/role-options'), fetch('/api/workforce/department-options')]);
      const roleData = await roleResponse.json();
      const departmentData = await departmentResponse.json();
      if (!roleResponse.ok || !departmentResponse.ok) throw new Error(roleData.error || departmentData.error || 'Unable to load employee options.');
      setRoleOptions(roleData.roles);
      setDepartmentOptions(departmentData.departments);
    } catch (error) {
      setMessage(error.message);
    }
  }

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submitProfile(event, documents = []) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const editing = editor.mode === 'edit';
    const response = await fetch(editing ? `/api/workforce/${editor.employee.id}` : '/api/workforce', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await response.json();
    if (!response.ok) { setSaving(false); return setMessage(data.error || 'Unable to save employee.'); }
    for (const document of documents) {
      const extension = document.name.split('.').pop()?.toLowerCase();
      const fallbackTypes = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
      const uploadResponse = await fetch(`/api/workforce/${data.employee.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(document.name), 'X-File-Type': document.type || fallbackTypes[extension] || '' },
        body: document
      });
      if (!uploadResponse.ok) {
        setSaving(false);
        return setMessage((await uploadResponse.json()).error || `Unable to upload ${document.name}.`);
      }
    }
    const detailResponse = await fetch(`/api/workforce/${data.employee.id}`);
    const detailData = await detailResponse.json();
    setSaving(false);
    if (!detailResponse.ok) return setMessage(detailData.error || 'Unable to reload employee profile.');
    await loadEmployees();
    setEditor({ mode: 'view', employee: detailData.employee });
    setForm({ ...emptyEmployee, ...detailData.employee, hireDate: detailData.employee.hireDate ? detailData.employee.hireDate.slice(0, 10) : '' });
    setMessage(editing ? 'Employee profile updated.' : 'Employee profile created.');
  }

  async function deleteEmployee() {
    if (!await confirmModal(`Delete ${form.firstName} ${form.lastName}'s profile?`, 'Delete employee profile?')) return;
    const response = await fetch(`/api/workforce/${editor.employee.id}`, { method: 'DELETE' });
    if (!response.ok) return setMessage((await response.json()).error || 'Unable to delete employee.');
    setEditor(null);
    await loadEmployees();
    setMessage('Employee profile deleted.');
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
      department: [left.department || '', right.department || ''],
      jobTitle: [left.jobTitle || '', right.jobTitle || ''],
      employmentStatus: [left.employmentStatus, right.employmentStatus]
    }[sortConfig.key];
    const comparison = values[0].localeCompare(values[1], undefined, { numeric: true, sensitivity: 'base' });
    return sortConfig.direction === 'asc' ? comparison : -comparison;
  });

  const sortIndicator = (key) => sortConfig.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕';

  return (
    <section className="workforce-view">
      <div className="module-title"><div><span>People directory</span><h1>Workforce</h1><p>Create and manage employee profiles across your organization.</p></div>{permission?.create && <button onClick={openCreate}>+ Add employee</button>}</div>
      <div className={`workforce-toolbar ${showResults ? 'has-results' : ''}`}>
        <form onSubmit={searchEmployees}><span>⌕</span><input value={search} onChange={changeSearch} placeholder="Search employees, roles, departments…" /><button type="submit">Search</button></form>
        <div className="workforce-toolbar-actions">{showResults && <span>{employees.length} {employees.length === 1 ? 'employee' : 'employees'}</span>}<button type="button" onClick={showAllEmployees}>Show all</button></div>
      </div>
      {showResults && <div className={`employee-table ${showingAll ? 'show-all-results' : ''}`}>
        <div className="employee-row employee-head">
          <button type="button" onClick={() => sortEmployees('name')}>Employee <span>{sortIndicator('name')}</span></button>
          <button type="button" onClick={() => sortEmployees('employeeNumber')}>Employee ID <span>{sortIndicator('employeeNumber')}</span></button>
          <button type="button" onClick={() => sortEmployees('department')}>Department <span>{sortIndicator('department')}</span></button>
          <button type="button" onClick={() => sortEmployees('jobTitle')}>Job title <span>{sortIndicator('jobTitle')}</span></button>
          <button type="button" onClick={() => sortEmployees('employmentStatus')}>Status <span>{sortIndicator('employmentStatus')}</span></button>
        </div>
        {sortedEmployees.map((employee) => (
          <button className="employee-row" type="button" key={employee.id} onClick={() => openProfile(employee)}>
            <div className="employee-person"><i>{employee.firstName[0]}{employee.lastName[0]}</i><span><strong>{employee.preferredName || employee.firstName} {employee.lastName}</strong><small>{employee.email}</small></span></div>
            <span>{employee.employeeNumber}</span><span>{employee.department || '—'}</span><span>{employee.jobTitle || '—'}</span>
            <span className={`employment-status status-${employee.employmentStatus}`}><i />{employee.employmentStatus.replace('_', ' ')}</span>
          </button>
        ))}
        {!employees.length && <div className="empty-workforce"><span>♙</span><strong>No employee profiles found</strong><small>Add an employee or change your search.</small></div>}
      </div>}

      {editor && <div className="employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-editor-title"><button className="modal-scrim" onClick={() => setEditor(null)} aria-label="Close" /><div className="employee-editor">
        <div className="editor-header"><div><span>{editor.mode === 'create' ? 'New profile' : editor.mode === 'edit' ? 'Edit profile' : form.employeeNumber}</span><h2 id="employee-editor-title">{editor.mode === 'create' ? 'Add employee' : `${form.firstName} ${form.lastName}`}</h2></div><button onClick={() => setEditor(null)} aria-label="Close">×</button></div>
        {editor.mode === 'view' ? <EmployeeDetails employee={form} /> : <EmployeeForm form={form} mode={editor.mode} updateField={updateField} onSubmit={submitProfile} saving={saving} roles={roleOptions} departments={departmentOptions} />}
        <div className="editor-actions">
          {editor.mode === 'view' && permission?.delete && <button className="delete-profile" onClick={deleteEmployee}>Delete profile</button>}
          <span />
          <button className="secondary-action" onClick={() => setEditor(null)}>Close</button>
          {editor.mode === 'view' && permission?.update && <button className="primary-action" onClick={beginEdit}>Edit profile</button>}
        </div>
      </div></div>}
    </section>
  );
}

function EmployeeDetails({ employee }) {
  const personal = [['Employee ID', employee.employeeNumber], ['First name', employee.firstName], ['Last name', employee.lastName], ['Preferred name', employee.preferredName || '—'], ['Phone', employee.phone || '—'], ['Job title', employee.jobTitle || '—'], ['Department', employee.department || '—'], ['Hire date', employee.hireDate || '—'], ['Status', employee.employmentStatus.replace('_', ' ')]];
  const emergency = [['Contact name', employee.emergencyContactName || '—'], ['Relationship', employee.emergencyContactRelationship || '—'], ['Phone number', employee.emergencyContactPhone || '—'], ['Alternate phone', employee.emergencyContactAlternatePhone || '—']];
  const access = [['Email', employee.email], ['Account role', employee.roleName || '—'], ['Login access', employee.hasLogin ? 'Enabled' : 'Not provisioned']];
  return <div className="employee-profile-sections">
    <ProfileSection number="01" title="Personal information" details={personal} />
    <ProfileSection number="02" title="Emergency contact" details={emergency} />
    <ProfileSection number="03" title="Access Control" details={access} />
    <section className="profile-section"><h3><span>04</span>Documents</h3>{employee.documents?.length ? <ul className="profile-documents">{employee.documents.map((document) => <li key={document.id}><div><strong>{document.name}</strong><small>{(Number(document.size) / 1024 / 1024).toFixed(2)} MB</small></div><a href={`/api/workforce/documents/${document.id}/content`}>Download</a></li>)}</ul> : <p className="no-profile-data">No documents uploaded.</p>}</section>
  </div>;
}

function ProfileSection({ number, title, details }) {
  return <section className="profile-section"><h3><span>{number}</span>{title}</h3><div className="employee-details">{details.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>;
}

const emptyDepartment = { name: '', description: '', managerId: '', assistantManagerId: '', memberIds: [] };

function Departments({ user }) {
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(emptyDepartment);
  const [message, setMessage] = useModalMessage();
  const [saving, setSaving] = useState(false);
  const permission = effectiveModulePermission(user,'departments');

  async function loadData() {
    const [departmentResponse, employeeResponse] = await Promise.all([fetch('/api/departments'), fetch('/api/departments/employees')]);
    const departmentData = await departmentResponse.json();
    const employeeData = await employeeResponse.json();
    if (!departmentResponse.ok || !employeeResponse.ok) throw new Error(departmentData.error || employeeData.error || 'Unable to load departments.');
    setDepartments(departmentData.departments);
    setEmployees(employeeData.employees);
  }

  useEffect(() => { loadData().catch((error) => setMessage(error.message)); }, []);

  function formFromDepartment(department) {
    return { name: department.name, description: department.description || '', managerId: department.manager ? String(department.manager.id) : '', assistantManagerId: department.assistantManager ? String(department.assistantManager.id) : '', memberIds: department.teamMembers.map((employee) => String(employee.id)) };
  }

  function openCreate() { setForm(emptyDepartment); setEditor({ mode: 'create' }); setMessage(''); }
  function openDepartment(department) { setForm(formFromDepartment(department)); setEditor({ mode: 'view', department }); setMessage(''); }
  function beginEdit() { setForm(formFromDepartment(editor.department)); setEditor((current) => ({ ...current, mode: 'edit' })); setMessage(''); }
  function updateField(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }

  function updateLeader(field, value) {
    const otherField = field === 'managerId' ? 'assistantManagerId' : 'managerId';
    setForm((current) => ({ ...current, [field]: value, [otherField]: value && current[otherField] === value ? '' : current[otherField], memberIds: current.memberIds.filter((id) => id !== value) }));
  }

  function toggleMember(employeeId) {
    setForm((current) => ({ ...current, memberIds: current.memberIds.includes(employeeId) ? current.memberIds.filter((id) => id !== employeeId) : [...current.memberIds, employeeId] }));
  }

  async function saveDepartment(event) {
    event.preventDefault(); setSaving(true); setMessage('');
    const editing = editor.mode === 'edit';
    try {
      const response = await fetch(editing ? `/api/departments/${editor.department.id}` : '/api/departments', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save department.');
      await loadData(); setEditor({ mode: 'view', department: data.department }); setForm(formFromDepartment(data.department)); setMessage(editing ? 'Department updated.' : 'Department created.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function deleteDepartment() {
    if (!await confirmModal(`Delete ${editor.department.name}? Employee assignments will be cleared.`, 'Delete department?')) return;
    const response = await fetch(`/api/departments/${editor.department.id}`, { method: 'DELETE' });
    if (!response.ok) return setMessage((await response.json()).error || 'Unable to delete department.');
    setEditor(null); await loadData(); setMessage('Department deleted.');
  }

  return <section className="departments-view">
    <div className="module-title"><div><span>Organization</span><h1>Departments</h1><p>Organize employees into teams and assign department leadership.</p></div>{permission?.create && <button onClick={openCreate}>+ Add department</button>}</div>
    <div className="department-table"><div className="department-row department-head"><span>Department</span><span>Manager</span><span>Assistant manager</span><span>Team members</span></div>{departments.map((department) => <button type="button" className="department-row" key={department.id} onClick={() => openDepartment(department)}><div><strong>{department.name}</strong><small>{department.description || 'No description'}</small></div><span>{employeeName(department.manager)}</span><span>{employeeName(department.assistantManager)}</span><span>{department.teamMembers.length}</span></button>)}{!departments.length && <div className="empty-departments"><strong>No departments created</strong><small>Create a department to begin assigning employees.</small></div>}</div>
    {editor && <div className="employee-modal" role="dialog" aria-modal="true" aria-labelledby="department-editor-title"><button className="modal-scrim" onClick={() => setEditor(null)} aria-label="Close" /><div className="employee-editor department-editor"><div className="editor-header"><div><span>{editor.mode === 'create' ? 'New department' : editor.mode === 'edit' ? 'Edit department' : 'Department profile'}</span><h2 id="department-editor-title">{editor.mode === 'create' ? 'Add department' : form.name}</h2></div><button onClick={() => setEditor(null)} aria-label="Close">×</button></div>{message && <p className="rbac-message" role="status">{message}</p>}{editor.mode === 'view' ? <DepartmentDetails department={editor.department} /> : <DepartmentForm form={form} employees={employees} updateField={updateField} updateLeader={updateLeader} toggleMember={toggleMember} onSubmit={saveDepartment} saving={saving} />}<div className="editor-actions">{editor.mode === 'view' && permission?.delete && <button className="delete-profile" onClick={deleteDepartment}>Delete department</button>}<span /><button className="secondary-action" onClick={() => setEditor(null)}>Close</button>{editor.mode === 'view' && permission?.update && <button className="primary-action" onClick={beginEdit}>Edit department</button>}</div></div></div>}
  </section>;
}

function employeeName(employee) { return employee ? `${employee.preferredName || employee.firstName} ${employee.lastName}` : '—'; }

function DepartmentDetails({ department }) {
  return <div className="department-profile"><section><span>Description</span><p>{department.description || 'No description provided.'}</p></section><div className="department-leaders"><article><span>Manager</span><strong>{employeeName(department.manager)}</strong><small>{department.manager?.jobTitle || 'Not assigned'}</small></article><article><span>Assistant manager</span><strong>{employeeName(department.assistantManager)}</strong><small>{department.assistantManager?.jobTitle || 'Not assigned'}</small></article></div><section><span>Team members · {department.teamMembers.length}</span>{department.teamMembers.length ? <div className="department-member-list">{department.teamMembers.map((employee) => <article key={employee.id}><i>{employee.firstName[0]}{employee.lastName[0]}</i><div><strong>{employeeName(employee)}</strong><small>{employee.jobTitle || employee.email}</small></div></article>)}</div> : <p>No team members assigned.</p>}</section></div>;
}

function DepartmentForm({ form, employees, updateField, updateLeader, toggleMember, onSubmit, saving }) {
  const [memberSearch, setMemberSearch] = useState('');
  const selectedMembers = employees.filter((employee) => form.memberIds.includes(String(employee.id)));
  const searchValue = memberSearch.trim().toLowerCase();
  const filteredEmployees = employees.filter((employee) => !searchValue || [employeeName(employee), employee.employeeNumber, employee.jobTitle, employee.email].some((value) => String(value || '').toLowerCase().includes(searchValue)));

  return <form className="department-form" onSubmit={onSubmit}><div className="department-form-grid"><label><span>Department name *</span><input name="name" value={form.name} onChange={updateField} required maxLength="120" /></label><label><span>Description</span><input name="description" value={form.description} onChange={updateField} maxLength="1000" placeholder="Purpose or responsibility" /></label></div><fieldset><legend>Leadership</legend><div className="department-form-grid"><label><span>Manager</span><select value={form.managerId} onChange={(event) => updateLeader('managerId', event.target.value)}><option value="">Not assigned</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employeeName(employee)} · {employee.employeeNumber}</option>)}</select></label><label><span>Assistant manager</span><select value={form.assistantManagerId} onChange={(event) => updateLeader('assistantManagerId', event.target.value)}><option value="">Not assigned</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employeeName(employee)} · {employee.employeeNumber}</option>)}</select></label></div></fieldset><fieldset><legend>Team members</legend>
    <div className="selected-member-area"><div><strong>Added team members</strong><span>{selectedMembers.length} selected</span></div>{selectedMembers.length ? <div className="selected-member-chips">{selectedMembers.map((employee) => <span key={employee.id}>{employeeName(employee)}<button type="button" onClick={() => toggleMember(String(employee.id))} aria-label={`Remove ${employeeName(employee)}`}>×</button></span>)}</div> : <p>No team members added yet.</p>}</div>
    <label className="member-search"><span>Search registered employees</span><div><b>⌕</b><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search by name, ID, role, or email…" /></div></label>
    <div className="member-picker">{filteredEmployees.map((employee) => { const employeeId = String(employee.id); const isLeader = employeeId === form.managerId || employeeId === form.assistantManagerId; return <label className={isLeader ? 'leader-selected' : ''} key={employee.id}><input type="checkbox" checked={form.memberIds.includes(employeeId)} disabled={isLeader} onChange={() => toggleMember(employeeId)} /><i>{employee.firstName[0]}{employee.lastName[0]}</i><span><strong>{employeeName(employee)}</strong><small>{isLeader ? 'Assigned as leader' : employee.jobTitle || employee.email}</small></span></label>; })}{!filteredEmployees.length && <p className="no-member-results">No registered employees match your search.</p>}</div>
  </fieldset><button className="form-save" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save department'}</button></form>;
}

function EmployeeForm({ form, mode, updateField, onSubmit, saving, roles, departments }) {
  const [documents, setDocuments] = useState([]);
  const [documentError, setDocumentError] = useState('');

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

  return <form className="employee-form" id="employee-form" onSubmit={(event) => onSubmit(event, documents)}>
    <fieldset className="form-section"><legend><span>01</span><div><strong>Personal information</strong><small>Basic identity and contact details</small></div></legend><div className="form-section-grid">
    {mode === 'edit' && <label><span>Employment status</span><select name="employmentStatus" value={form.employmentStatus} onChange={updateField}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
    <label><span>First name *</span><input name="firstName" value={form.firstName} onChange={updateField} required /></label>
    <label><span>Last name *</span><input name="lastName" value={form.lastName} onChange={updateField} required /></label>
    <label><span>Preferred name</span><input name="preferredName" value={form.preferredName} onChange={updateField} /></label>
    <label><span>Phone</span><input name="phone" value={form.phone} onChange={updateField} /></label>
    <label><span>Hire date</span><input type="date" name="hireDate" value={form.hireDate || ''} onChange={updateField} /></label>
    <label><span>Job title</span><input name="jobTitle" value={form.jobTitle} onChange={updateField} /></label>
    <label><span>Department</span><select name="department" value={form.department || ''} onChange={updateField}><option value="">Not assigned</option>{departments.map((department) => <option value={department.name} key={department.id}>{department.name}</option>)}</select></label>
    </div></fieldset>
    <fieldset className="form-section"><legend><span>02</span><div><strong>Emergency contact</strong><small>Who to contact in case of an emergency</small></div></legend><div className="form-section-grid">
      <label><span>Contact name</span><input name="emergencyContactName" value={form.emergencyContactName || ''} onChange={updateField} placeholder="Full name" /></label>
      <label><span>Relationship</span><input name="emergencyContactRelationship" value={form.emergencyContactRelationship || ''} onChange={updateField} placeholder="e.g. Spouse, parent" /></label>
      <label><span>Phone number</span><input type="tel" name="emergencyContactPhone" value={form.emergencyContactPhone || ''} onChange={updateField} placeholder="Primary phone number" /></label>
      <label><span>Alternate phone</span><input type="tel" name="emergencyContactAlternatePhone" value={form.emergencyContactAlternatePhone || ''} onChange={updateField} placeholder="Optional" /></label>
    </div></fieldset>
    <fieldset className="form-section"><legend><span>03</span><div><strong>Access Control</strong><small>Configure account credentials and permissions</small></div></legend><div className="form-section-grid">
      <label><span>Email *</span><input type="email" name="email" value={form.email} onChange={updateField} required autoComplete="email" /></label>
      <label><span>Account role *</span><select name="roleId" value={form.roleId || ''} onChange={updateField} required disabled={!roles.length}><option value="" disabled>{roles.length ? 'Select a role' : 'Loading roles…'}</option>{roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}</select><small>Determines this employee's access permissions.</small></label>
      <div className="password-input"><label htmlFor="temporary-password"><span>{mode === 'create' || !form.hasLogin ? 'Temporary password *' : 'New password (optional)'}</span></label><div className="password-control"><input id="temporary-password" type="text" name="temporaryPassword" value={form.temporaryPassword || ''} onChange={updateField} minLength="8" required={mode === 'create' || !form.hasLogin} autoComplete="new-password" placeholder="At least 8 characters" /><button type="button" onClick={generateTemporaryPassword}>Generate password</button></div><small>{mode === 'create' || !form.hasLogin ? 'The employee will use this password for their first login.' : 'Leave blank to keep the current password.'}</small></div>
    </div></fieldset>
    {mode === 'edit' && <fieldset className="form-section document-section"><legend><span>04</span><div><strong>Documents</strong><small>Add identification and employment records</small></div></legend>
      <label className="document-dropzone"><input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={selectDocuments} /><b aria-hidden="true">↑</b><strong>Choose files to upload</strong><small>PDF, DOC, DOCX, JPG or PNG · 10 MB maximum each</small></label>
      {documentError && <p className="document-error" role="alert">{documentError}</p>}
      {documents.length > 0 && <ul className="selected-documents" aria-label="Selected documents">{documents.map((file) => <li key={`${file.name}-${file.lastModified}`}><span>{file.name}</span><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></li>)}</ul>}
    </fieldset>}
    <button className="form-save" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save employee'}</button>
  </form>;
}

function RoleAccess({ user }) {
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState({});
  const [message, setMessage] = useModalMessage();
  const [creating, setCreating] = useState(false);
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
  return (
    <section className="rbac-view">
      <div className="module-title"><div><span>Administration</span><h1>Roles & Access</h1><p>Control which modules each role can access and what operations it can perform.</p></div>{permission?.create && <button onClick={() => setCreating(!creating)}>+ New role</button>}</div>
      {creating && <form className="new-role-form" onSubmit={createRole}><input name="name" placeholder="Role name" required /><input name="description" placeholder="Short description" /><button type="submit">Create role</button></form>}
      <div className="rbac-layout">
        <aside className="role-list"><span>Roles</span>{roles.map((role) => <button className={String(role.id) === String(selectedId) ? 'selected' : ''} onClick={() => selectRole(role)} key={role.id}><strong>{role.name}</strong><small>{role.description}</small>{role.isSystem && <i>System</i>}</button>)}</aside>
        <div className="permission-panel">
          <div className="permission-heading"><div><h2>{selected?.name || 'Select a role'}</h2><p>{selected?.description}</p></div><div>{selected && !selected.isSystem && permission?.delete && <button className="delete-role" onClick={deleteRole}>Delete</button>}{selected && permission?.update && <button className="save-access" onClick={savePermissions} disabled={selected?.name === 'Administrator'}>Save access</button>}</div></div>
          <div className="permission-table"><div className="permission-row permission-head"><span>Module</span>{['Create','View','Update','Delete'].map((operation) => <span key={operation}>{operation}</span>)}</div>{accessModules.map((module) => {const permissionKeys=module.permissionKeys||[module.permissionKey||module.moduleKey];const administratorModuleLockedOff=selected?.name==='Administrator'&&administratorHiddenModuleKeys.has(module.moduleKey);return <div className={`permission-row ${module.isParent?'parent-module':''} ${module.isChild?'child-module':''}`} key={module.moduleKey}><div><strong>{module.name}</strong><small>{module.description}</small></div>{['create','view','update','delete'].map((operation) => <label key={operation} title={administratorModuleLockedOff?'Employee self-service module hidden from Administrator':selected?.name==='Administrator'?'Administrator has full access':module.isParent?'Parent permission required by its child modules':undefined}><input type="checkbox" checked={!administratorModuleLockedOff&&(selected?.name==='Administrator'||permissionKeys.every((key)=>Boolean(draft[key]?.[operation])))} disabled={selected?.name==='Administrator'||!permission?.update} onChange={()=>toggleAccessModule(module,operation)} /><span /></label>)}</div>;})}</div>
        </div>
      </div>
    </section>
  );
}

function roleAccessModules(modules) {
  const parentLabels = {
    workforce: 'Maintenance', leave_management: 'Maintenance', departments: 'Maintenance', roles: 'Maintenance',
    time_entries: 'Timetracking', shift_management: 'Timetracking', requests: 'Timetracking', leave_application: 'Timetracking', overtime_request: 'Timetracking', shift_change: 'Timetracking',
    scheduler: 'Utilities', device_users: 'Utilities'
  };
  const parentKeys = ['maintenance','time_tracking','utilities'];
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

function LogoutConfirmation() {
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
      <header className="site-header"><Logo /></header>
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
      <footer><span>© 2026 PayTimePro</span><span>Secure workforce access</span></footer>
    </div>
  );
}
