import { useEffect, useState } from 'react';

function Logo() {
  return <a className="wordmark" href="/" aria-label="PayTimePro home"><span>PayTime</span><strong>Pro</strong></a>;
}

export default function App() {
  if (window.location.pathname === '/dashboard') return <Dashboard />;
  if (window.location.pathname === '/logout') return <LogoutConfirmation />;
  return <Login />;
}

function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
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
            {error && <p className="form-error" role="alert">{error}</p>}
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

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) throw new Error('unauthorized');
        return response.json();
      })
      .then((data) => {
        setUser(data.user);
        const visibleModules = data.user.permissions.filter((permission) => permission.view).map((permission) => permission.moduleKey);
        const maintenanceVisible = ['workforce', 'departments', 'roles'].some((moduleKey) => visibleModules.includes(moduleKey));
        const utilitiesVisible = visibleModules.includes('scheduler');
        let savedModule = '';
        try { savedModule = window.localStorage.getItem('paytimepro.activeModule') || ''; } catch {}
        const savedModuleAllowed = visibleModules.includes(savedModule)
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
  const canView = (moduleKey) => user.permissions.some((permission) => permission.moduleKey === moduleKey && permission.view);
  const maintenanceItems = [
    ['workforce', '♙', 'Workforce'],
    ['departments', '▦', 'Departments'],
    ['roles', '▦', 'Roles & Access']
  ].filter(([moduleKey]) => canView(moduleKey));
  const utilityItems = [
    ['scheduler', '▦', 'Sync Agent']
  ].filter(([moduleKey]) => canView(moduleKey));
  const navItems = [
    ['overview', '⌂', 'Overview'],
    ['time_tracking', '◷', 'Time Tracking'],
    ['payroll', '$', 'Payroll'],
    ['reports', '▤', 'Reports']
  ].filter(([moduleKey]) => canView(moduleKey));

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Logo />
        <nav aria-label="Dashboard navigation">
          {navItems.slice(0, 1).map(([moduleKey, icon, label]) => <button className={activeModule === moduleKey ? 'active' : ''} type="button" key={moduleKey} onClick={() => setActiveModule(moduleKey)}><span>{icon}</span>{label}</button>)}
          {maintenanceItems.length > 0 && <div className="sidebar-nav-group">
            <button className={activeModule === 'maintenance' || maintenanceItems.some(([moduleKey]) => moduleKey === activeModule) ? 'active group-active' : ''} type="button" onClick={() => { setMaintenanceOpen((current) => !current); setActiveModule('maintenance'); }} aria-expanded={maintenanceOpen}><span>⚙</span>Maintenance<b>{maintenanceOpen ? '⌃' : '⌄'}</b></button>
            {maintenanceOpen && <div className="sidebar-subnav">{maintenanceItems.map(([moduleKey, icon, label]) => <button className={activeModule === moduleKey ? 'active' : ''} type="button" key={moduleKey} onClick={() => setActiveModule(moduleKey)}><span>{icon}</span>{label}</button>)}</div>}
          </div>}
          {utilityItems.length > 0 && <div className="sidebar-nav-group">
            <button className={activeModule === 'utilities' || utilityItems.some(([moduleKey]) => moduleKey === activeModule) ? 'active group-active' : ''} type="button" onClick={() => { setUtilitiesOpen((current) => !current); setActiveModule('utilities'); }} aria-expanded={utilitiesOpen}><span>⌘</span>Utilities<b>{utilitiesOpen ? '⌃' : '⌄'}</b></button>
            {utilitiesOpen && <div className="sidebar-subnav">{utilityItems.map(([moduleKey, icon, label]) => <button className={activeModule === moduleKey ? 'active' : ''} type="button" key={moduleKey} onClick={() => setActiveModule(moduleKey)}><span>{icon}</span>{label}</button>)}</div>}
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
          {activeModule === 'departments' && <Departments user={user} />}
          {activeModule === 'time_tracking' && <TimeTracking />}
          {activeModule === 'scheduler' && <Scheduler user={user} />}
          {['payroll', 'reports'].includes(activeModule) && <ModulePlaceholder moduleKey={activeModule} />}
        </main>
      </div>
    </div>
  );
}

function Overview({ user, onNavigate }) {
  const visibleModules = user.permissions.filter((permission) => permission.view && permission.moduleKey !== 'overview');
  return <section className="overview-view"><div className="module-title"><div><span>Workspace</span><h1>Welcome, {user.displayName.split(' ')[0]}</h1><p>Choose a module to continue.</p></div></div><div className="module-grid">{visibleModules.map((permission) => <button type="button" key={permission.moduleKey} onClick={() => onNavigate(permission.moduleKey)}><strong>{permission.moduleName}</strong><span>Open module →</span></button>)}</div></section>;
}

function Maintenance({ user, onNavigate }) {
  const maintenanceModules = user.permissions.filter((permission) => ['workforce', 'departments', 'roles'].includes(permission.moduleKey) && permission.view);
  return <section className="overview-view"><div className="module-title"><div><span>Administration</span><h1>Maintenance</h1><p>Manage workforce records, departments, and access controls.</p></div></div><div className="module-grid">{maintenanceModules.map((permission) => <button type="button" key={permission.moduleKey} onClick={() => onNavigate(permission.moduleKey)}><strong>{permission.moduleName}</strong><span>Open submodule →</span></button>)}</div></section>;
}

function Utilities({ user, onNavigate }) {
  const utilityModules = user.permissions.filter((permission) => permission.moduleKey === 'scheduler' && permission.view);
  return <section className="overview-view"><div className="module-title"><div><span>Tools</span><h1>Utilities</h1><p>Access scheduling and other workforce utilities.</p></div></div><div className="module-grid">{utilityModules.map((permission) => <button type="button" key={permission.moduleKey} onClick={() => onNavigate(permission.moduleKey)}><strong>{permission.moduleName}</strong><span>Open utility →</span></button>)}</div></section>;
}

const moduleCopy = {
  time_tracking: ['Time Tracking', 'Clock-ins and timesheets are ready for the next implementation phase.'],
  payroll: ['Payroll', 'Payroll periods, calculations, and exports are ready for the next implementation phase.'],
  reports: ['Reports', 'Workforce and payroll reporting is ready for the next implementation phase.']
};

function Scheduler({ user }) {
  const [syncingDeviceId, setSyncingDeviceId] = useState(null);
  const [status, setStatus] = useState({ agent: null, jobs: [], backups: [], devices: [] });
  const [deviceForm, setDeviceForm] = useState({ name: '', ip: '', port: '4370' });
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [refreshingDeviceId, setRefreshingDeviceId] = useState(null);
  const [error, setError] = useState('');
  const permission = user.permissions.find((item) => item.moduleKey === 'scheduler');

  async function loadStatus() {
    const response = await fetch('/api/scheduler/status', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load synchronization status.');
    setStatus({ ...data, agent: data.agent ? { ...data.agent, lastError: '' } : null });
  }

  useEffect(() => {
    loadStatus().catch((loadError) => setError(loadError.message));
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
    } catch (pullError) {
      setError(pullError.message);
    } finally {
      setSyncingDeviceId(null);
    }
  }

  async function addDevice(event) {
    event.preventDefault(); setError('');
    try { const response=await fetch(editingDeviceId?`/api/scheduler/devices/${editingDeviceId}`:'/api/scheduler/devices',{method:editingDeviceId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(deviceForm)}); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to save device.'); setDeviceForm({name:'',ip:'',port:'4370'}); setEditingDeviceId(null); setShowDeviceForm(false); await loadStatus(); }
    catch(addError){setError(addError.message);}
  }

  function editDevice(device) {
    setDeviceForm({name:device.name,ip:device.ip,port:String(device.port)}); setEditingDeviceId(device.id); setShowDeviceForm(true); setError('');
  }

  function closeDeviceForm() {
    setShowDeviceForm(false); setEditingDeviceId(null); setDeviceForm({name:'',ip:'',port:'4370'});
  }

  async function removeDevice(device) {
    if(!window.confirm(`Remove ${device.name}? Its device association and job history will be removed.`))return;
    setError(''); try{const response=await fetch(`/api/scheduler/devices/${device.id}`,{method:'DELETE'}); if(!response.ok){const data=await response.json();throw new Error(data.error||'Unable to remove device.');}await loadStatus();}catch(removeError){setError(removeError.message);}
  }

  async function refreshDevice(deviceId) {
    setRefreshingDeviceId(deviceId); setError('');
    try { const response=await fetch(`/api/scheduler/devices/${deviceId}/refresh`,{method:'POST'}); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to refresh device status.'); await loadStatus(); }
    catch(refreshError){setError(refreshError.message);} finally {setRefreshingDeviceId(null);}
  }

  const online = status.agent?.lastSeenAt && Date.now() - new Date(status.agent.lastSeenAt).getTime() < 60000;
  return <section className="overview-view"><div className="module-title"><div><span>Utilities</span><h1>Sync Agent</h1><p>Synchronize users and attendance records through the on-site MB460 agent.</p></div></div><div className="module-placeholder scheduler-pull"><strong>Sync agent · {online ? 'Online' : 'Offline'}</strong><p>{status.agent?.lastSeenAt ? `Last contact: ${new Date(status.agent.lastSeenAt).toLocaleString()}` : 'The sync agent has not connected yet.'}</p>{error && <p className="form-error" role="alert">{error}</p>}{status.agent?.lastError && <p className="form-error" role="alert">{status.agent.lastError}</p>}</div><section className="device-registry"><div className="section-heading"><div><span>Local network</span><h3>Available devices</h3></div>{permission?.create&&<button type="button" onClick={()=>showDeviceForm?closeDeviceForm():setShowDeviceForm(true)}>{showDeviceForm?'Cancel':'Add device'}</button>}</div>{showDeviceForm&&<form className="device-add-form" onSubmit={addDevice}><label><span>Device name</span><input value={deviceForm.name} onChange={(event)=>setDeviceForm({...deviceForm,name:event.target.value})} placeholder="Main office MB460" required /></label><label><span>IP address</span><input value={deviceForm.ip} onChange={(event)=>setDeviceForm({...deviceForm,ip:event.target.value})} placeholder="192.168.1.11" required /></label><label><span>Port</span><input type="number" min="1" max="65535" value={deviceForm.port} onChange={(event)=>setDeviceForm({...deviceForm,port:event.target.value})} required /></label><button className="primary-action" type="submit">{editingDeviceId?'Save device':'Add device'}</button></form>}<div className="device-list">{status.devices.map((device)=>{const deviceJobs=status.jobs.filter((item)=>String(item.deviceId)===String(device.id));const job=deviceJobs.find((item)=>['pending','running'].includes(item.status));const backup=status.backups.find((item)=>String(item.deviceId)===String(device.id));return <article key={device.id}><i className={`device-dot ${device.status}`} /><div><strong>{device.name}</strong><small>{device.ip}:{device.port}</small></div><span className={`device-status ${device.status}`}>{device.status}</span><time>{device.lastCheckedAt?`Checked ${new Date(device.lastCheckedAt).toLocaleString()}`:device.status==='unknown'?'Checking connectivity…':'Not checked yet'}</time><div className="device-actions">{permission?.update&&<button className="device-sync-button" type="button" onClick={()=>requestSync(device.id)} disabled={!online||Boolean(job)||syncingDeviceId===device.id}>{job?`Sync ${job.status}…`:syncingDeviceId===device.id?'Requesting…':'Sync'}</button>}{permission?.update&&<button type="button" onClick={()=>refreshDevice(device.id)} disabled={!online||device.status==='unknown'||refreshingDeviceId===device.id}>{device.status==='unknown'||refreshingDeviceId===device.id?'Checking…':'Refresh'}</button>}{permission?.update&&<button type="button" onClick={()=>editDevice(device)}>Edit</button>}{permission?.delete&&<button className="remove-device" type="button" onClick={()=>removeDevice(device)}>Remove</button>}</div><DeviceSyncNotification job={deviceJobs[0]} backup={backup} />{device.lastError&&<p>{device.lastError}</p>}</article>;})}{!status.devices.length&&<p className="empty-device-list">No devices registered yet.</p>}</div></section></section>;
}

function DeviceSyncNotification({ job, backup }) {
  if (job?.status === 'pending') return <div className="device-sync-notice pending" role="status"><strong>Synchronization queued</strong><small>Waiting for the on-site agent.</small></div>;
  if (job?.status === 'running') return <div className="device-sync-notice running" role="status"><strong>Synchronization in progress</strong><small>The agent is reading this device.</small></div>;
  if (job?.status === 'failed') return <div className="device-sync-notice failed" role="alert"><strong>Synchronization failed</strong><small>{job.error || 'The device could not be synchronized.'}</small></div>;
  if (backup) return <div className="device-sync-notice completed" role="status"><strong>Last synchronized {new Date(backup.capturedAt).toLocaleString()}</strong><small>{backup.users} users · {backup.attendance} attendance records</small></div>;
  return <div className="device-sync-notice"><strong>Not synchronized yet</strong><small>Run Sync to create the first backup.</small></div>;
}

function ModulePlaceholder({ moduleKey }) {
  const [title, description] = moduleCopy[moduleKey];
  return <section className="overview-view"><div className="module-title"><div><span>Module</span><h1>{title}</h1><p>{description}</p></div></div><div className="module-placeholder"><strong>Coming soon</strong><p>Your access is configured and this module has a clear landing page while its workflows are built.</p></div></section>;
}

function TimeTracking() {
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [searching, setSearching] = useState(false);
  const [showEmployeeResults, setShowEmployeeResults] = useState(false);
  const [error, setError] = useState('');
  const today = new Date();
  const activeWeekStart = new Date(today); activeWeekStart.setDate(today.getDate() - today.getDay());
  const activeWeekEnd = new Date(activeWeekStart); activeWeekEnd.setDate(activeWeekStart.getDate() + 6);
  const [startDate, setStartDate] = useState(localDateValue(activeWeekStart));
  const [endDate, setEndDate] = useState(localDateValue(activeWeekEnd));

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

  function selectEmployee(employee) {
    setSelectedEmployee(employee);
    setSearch('');
    setEmployees([]);
    setShowEmployeeResults(false);
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

  return <section className="time-tracking-view">
    <div className="module-title"><div><span>Attendance</span><h1>Time Tracking</h1><p>Find an employee to view or manage their time records.</p></div></div>
    <div className="employee-selector-panel">
      <label htmlFor="time-employee-search">Select employee</label>
      <div className="time-search-actions"><div className="time-employee-search"><span>⌕</span><input id="time-employee-search" value={search} onChange={changeTimeEmployeeSearch} placeholder="Search by name, employee ID, role, department, or email…" autoComplete="off" />{searching && <small>Searching…</small>}</div><button type="button" onClick={showAllTimeEmployees}>Show all</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {showEmployeeResults && !searching && <div className="time-employee-results" role="listbox" aria-label="Employee search results">{employees.map((employee) => <button type="button" role="option" aria-selected={selectedEmployee?.id === employee.id} key={employee.id} onClick={() => selectEmployee(employee)}><i>{employee.firstName[0]}{employee.lastName[0]}</i><span><strong>{employeeName(employee)}</strong><small>{employee.employeeNumber} · {employee.jobTitle || 'No job title'} · {employee.department || 'No department'}</small></span><b className={`status-${employee.employmentStatus}`}>{employee.employmentStatus}</b></button>)}{!employees.length && <p>No employees match your search.</p>}</div>}
    </div>
    {selectedEmployee && <><div className="selected-time-employee"><span>Selected employee</span><div><i>{selectedEmployee.firstName[0]}{selectedEmployee.lastName[0]}</i><div><strong>{employeeName(selectedEmployee)}</strong><small>{selectedEmployee.employeeNumber} · {selectedEmployee.email}</small></div><p><strong>{selectedEmployee.jobTitle || 'No job title'}</strong><small>{selectedEmployee.department || 'No department'}</small></p><button type="button" onClick={() => setSelectedEmployee(null)}>Change employee</button></div></div>
      <section className="time-entry-section"><div className="time-entry-heading"><div><span>Time entries</span><h2>{employeeName(selectedEmployee)}</h2><p>One row is shown for every date in the selected range.</p></div><div className="date-range-controls"><label><span>From</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><i>to</i><label><span>To</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div></div>
      {rangeError ? <p className="rbac-message" role="alert">{rangeError}</p> : <><div className="time-entry-summary"><span>{dateRows.length} {dateRows.length === 1 ? 'day' : 'days'} in range</span><span>0 recorded entries</span></div><div className="time-entry-table"><div className="time-entry-row time-entry-head"><span>Date</span><span>Clock in</span><span>Clock out</span><span>Clock in</span><span>Clock out</span><span>Clock in</span><span>Clock out</span><span>Status</span></div>{dateRows.map((date) => <div className="time-entry-row" key={date.value}><div><strong>{date.weekday}</strong><small>{date.label}</small></div><span>—</span><span>—</span><span>—</span><span>—</span><span>—</span><span>—</span><b>No entry</b></div>)}</div></>}
      </section></>}
  </section>;
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function datesInRange(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const dates = [];
  for (const date = start; date <= end; date.setDate(date.getDate() + 1)) {
    dates.push({ value: localDateValue(date), weekday: date.toLocaleDateString(undefined, { weekday: 'short' }), label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) });
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
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [roleOptions, setRoleOptions] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const permission = user.permissions.find((item) => item.moduleKey === 'workforce');

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
    if (!window.confirm(`Delete ${form.firstName} ${form.lastName}'s profile?`)) return;
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
      {message && !editor && <p className="rbac-message" role="status">{message}</p>}
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
        {message && <p className="rbac-message" role="status">{message}</p>}
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
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const permission = user.permissions.find((item) => item.moduleKey === 'departments');

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
    if (!window.confirm(`Delete ${editor.department.name}? Employee assignments will be cleared.`)) return;
    const response = await fetch(`/api/departments/${editor.department.id}`, { method: 'DELETE' });
    if (!response.ok) return setMessage((await response.json()).error || 'Unable to delete department.');
    setEditor(null); await loadData(); setMessage('Department deleted.');
  }

  return <section className="departments-view">
    <div className="module-title"><div><span>Organization</span><h1>Departments</h1><p>Organize employees into teams and assign department leadership.</p></div>{permission?.create && <button onClick={openCreate}>+ Add department</button>}</div>
    {message && !editor && <p className="rbac-message" role="status">{message}</p>}
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
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const permission = user.permissions.find((item) => item.moduleKey === 'roles');

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

  function toggle(moduleKey, operation) {
    setDraft((current) => ({ ...current, [moduleKey]: { ...current[moduleKey], [operation]: !current[moduleKey]?.[operation] } }));
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
    if (!window.confirm('Delete this role? This cannot be undone.')) return;
    const response = await fetch(`/api/rbac/roles/${selectedId}`, { method: 'DELETE' });
    if (!response.ok) return setMessage((await response.json()).error);
    setSelectedId(null);
    await loadData();
    setMessage('Role deleted.');
  }

  const selected = roles.find((role) => String(role.id) === String(selectedId));
  return (
    <section className="rbac-view">
      <div className="module-title"><div><span>Administration</span><h1>Roles & Access</h1><p>Control which modules each role can access and what operations it can perform.</p></div>{permission?.create && <button onClick={() => setCreating(!creating)}>+ New role</button>}</div>
      {creating && <form className="new-role-form" onSubmit={createRole}><input name="name" placeholder="Role name" required /><input name="description" placeholder="Short description" /><button type="submit">Create role</button></form>}
      {message && <p className="rbac-message" role="status">{message}</p>}
      <div className="rbac-layout">
        <aside className="role-list"><span>Roles</span>{roles.map((role) => <button className={String(role.id) === String(selectedId) ? 'selected' : ''} onClick={() => selectRole(role)} key={role.id}><strong>{role.name}</strong><small>{role.description}</small>{role.isSystem && <i>System</i>}</button>)}</aside>
        <div className="permission-panel">
          <div className="permission-heading"><div><h2>{selected?.name || 'Select a role'}</h2><p>{selected?.description}</p></div><div>{selected && !selected.isSystem && permission?.delete && <button className="delete-role" onClick={deleteRole}>Delete</button>}{selected && permission?.update && <button className="save-access" onClick={savePermissions} disabled={selected?.name === 'Administrator'}>Save access</button>}</div></div>
          <div className="permission-table"><div className="permission-row permission-head"><span>Module</span>{['Create','View','Update','Delete'].map((operation) => <span key={operation}>{operation}</span>)}</div>{modules.map((module) => <div className="permission-row" key={module.moduleKey}><div><strong>{module.name}</strong><small>{module.description}</small></div>{['create','view','update','delete'].map((operation) => <label key={operation}><input type="checkbox" checked={Boolean(draft[module.moduleKey]?.[operation])} disabled={selected?.name === 'Administrator' || !permission?.update} onChange={() => toggle(module.moduleKey, operation)} /><span /></label>)}</div>)}</div>
        </div>
      </div>
    </section>
  );
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
  const [error, setError] = useState('');

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
          {error && <p className="form-error" role="alert">{error}</p>}
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
