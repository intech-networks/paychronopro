import { useEffect, useRef, useState } from 'react';

const emptyCompany = {
  companyName:'',
  companyAddress:'',
  contactNumber:'',
  emailAddress:'',
  website:'',
  description:'',
  hasLogo:false,
  logoUrl:null,
  updatedAt:null
};
const supportedLogoTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maximumLogoBytes = 2 * 1024 * 1024;

function formFromCompany(company) {
  return {
    companyName:company.companyName || '',
    companyAddress:company.companyAddress || '',
    contactNumber:company.contactNumber || '',
    emailAddress:company.emailAddress || '',
    website:company.website || '',
    description:company.description || ''
  };
}

async function readApiResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};
  if (response.ok) return data;
  const unavailableMessage = response.status === 404
    ? 'Company Profile API is unavailable. Restart the backend and try again.'
    : fallbackMessage;
  throw new Error(data.error || unavailableMessage);
}

function friendlyRequestError(error, fallbackMessage) {
  if (error?.name === 'AbortError') return '';
  if (error?.message === 'Failed to fetch') return 'Unable to reach the company profile service.';
  return error?.message || fallbackMessage;
}

function validWebsite(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function validateForm(form) {
  if (!form.companyName.trim()) return 'Please enter the company name.';
  if (form.emailAddress.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.emailAddress.trim())) {
    return 'Please enter a valid company email address.';
  }
  if (!validWebsite(form.website.trim())) return 'Website must be a valid http:// or https:// address.';
  return '';
}

function unitTypeLabel(value) {
  return String(value || 'department')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function employeeInitials(employee) {
  const initials = String(employee.firstName || '').slice(0, 1) + String(employee.lastName || '').slice(0, 1);
  return initials.toUpperCase() || '•';
}

export function CompanyProfile({ permission, onNavigate, onNotify, canViewOrganization }) {
  const [company, setCompany] = useState(emptyCompany);
  const [form, setForm] = useState(formFromCompany(emptyCompany));
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoBase64, setLogoBase64] = useState('');
  const [logoMimeType, setLogoMimeType] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [clearLogo, setClearLogo] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const mountedRef = useRef(false);
  const requestControllerRef = useRef(null);
  const readOnly = !permission?.update;

  function applyCompany(nextCompany) {
    const normalized = { ...emptyCompany, ...nextCompany };
    setCompany(normalized);
    setForm(formFromCompany(normalized));
    setLogoBase64('');
    setLogoMimeType('');
    setLogoPreview('');
    setClearLogo(false);
    setLogoFailed(false);
  }

  async function load({ showLoading = true } = {}) {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    if (showLoading && mountedRef.current) setLoading(true);

    try {
      const response = await fetch('/api/company/profile', {
        cache:'no-store',
        signal:controller.signal
      });
      const data = await readApiResponse(response, 'Unable to load the company profile.');
      if (!data.company) throw new Error('The company profile response is incomplete.');
      if (!mountedRef.current || requestControllerRef.current !== controller) return false;

      applyCompany(data.company);
      setDepartments(Array.isArray(data.departments) ? data.departments : []);
      setEmployees(Array.isArray(data.employees) ? data.employees : []);
      setLoadError('');
      return true;
    } catch (error) {
      if (!mountedRef.current || requestControllerRef.current !== controller || error?.name === 'AbortError') return false;
      setLoadError(friendlyRequestError(error, 'Unable to load the company profile.'));
      return false;
    } finally {
      if (mountedRef.current && requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        if (showLoading) setLoading(false);
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
      requestControllerRef.current?.abort();
    };
  }, []);

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]:value }));
    setSaveError('');
    setSaveSuccess('');
  }

  function removeLogo() {
    setClearLogo(true);
    setLogoBase64('');
    setLogoMimeType('');
    setLogoPreview('');
    setLogoFailed(false);
    setSaveError('');
    setSaveSuccess('');
  }

  function handleLogoChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!supportedLogoTypes.includes(file.type)) {
      setSaveError('Logo must be a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > maximumLogoBytes) {
      setSaveError('Logo must be no larger than 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      if (mountedRef.current) setSaveError('Unable to read the selected logo.');
    };
    reader.onload = () => {
      if (!mountedRef.current || typeof reader.result !== 'string') return;
      const separator = reader.result.indexOf(',');
      const encoded = separator >= 0 ? reader.result.slice(separator + 1) : '';
      if (!encoded) {
        setSaveError('Unable to read the selected logo.');
        return;
      }
      setLogoBase64(encoded);
      setLogoMimeType(file.type);
      setLogoPreview(reader.result);
      setClearLogo(false);
      setLogoFailed(false);
      setSaveError('');
      setSaveSuccess('');
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (saving || readOnly) return;

    const formError = validateForm(form);
    if (formError) {
      setSaveError(formError);
      return;
    }

    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    const payload = { ...form };
    if (clearLogo) payload.clearLogo = true;
    if (logoBase64) {
      payload.logoBase64 = logoBase64;
      payload.logoMimeType = logoMimeType;
    }

    try {
      const response = await fetch('/api/company/profile', {
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(payload)
      });
      const data = await readApiResponse(response, 'Unable to save the company profile.');
      if (!data.company) throw new Error('The company profile response is incomplete.');
      if (!mountedRef.current) return;

      applyCompany(data.company);
      setSaveSuccess('Company profile saved.');
      onNotify?.('notification', 'Company profile saved.', 'Saved');
    } catch (error) {
      if (mountedRef.current) setSaveError(friendlyRequestError(error, 'Unable to save the company profile.'));
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  const logoSource = logoPreview || (!clearLogo && !logoFailed ? company.logoUrl : '');
  const hasLogo = Boolean(logoSource);
  const assignedEmployeeCount = employees.filter((employee) => employee.unitNames).length;

  return (
    <section className="company-profile-view">
      <div className="module-title company-profile-title">
        <div>
          <span>Setup</span>
          <h1>Company Profile</h1>
          <p>Maintain company details and review the current workforce structure.</p>
        </div>
        {canViewOrganization && <button className="company-organization-link" type="button" onClick={() => onNavigate('organization')}>Open Organization</button>}
      </div>

      {loading && <div className="company-profile-loading" role="status"><strong>Loading company profile…</strong><span>Retrieving company, department, and assignment information.</span></div>}

      {!loading && loadError && <div className="company-profile-error" role="alert"><div><strong>Unable to load the company profile</strong><span>{loadError}</span></div><button type="button" onClick={() => load()}>Try again</button></div>}

      {!loading && !loadError && <>
        {saveError && <p className="company-profile-feedback error" role="alert">{saveError}</p>}
        {saveSuccess && <p className="company-profile-feedback success" role="status">{saveSuccess}</p>}

        <div className="company-profile-layout">
          <form className="company-profile-form" onSubmit={saveProfile}>
            <div className="company-profile-form-heading">
              <div>
                <span>Company details</span>
                <h2>Business information</h2>
                <p>These details are stored in the company profile and remain available after refresh.</p>
              </div>
              {readOnly && <small>View-only access</small>}
            </div>

            <div className="company-logo-field">
              <div className={'company-logo-preview' + (hasLogo ? ' has-logo' : '')}>
                {hasLogo ? <img src={logoSource} alt={form.companyName ? form.companyName + ' logo' : 'Company logo'} onError={() => setLogoFailed(true)} /> : <span aria-hidden="true">▣</span>}
              </div>
              <div className="company-logo-copy">
                <strong>Company logo</strong>
                <p>PNG, JPEG, or WebP up to 2 MB.</p>
                <div className="company-logo-actions">
                  <label className={'company-upload-button' + (readOnly || saving ? ' is-disabled' : '')} htmlFor="company-logo-upload">Choose logo</label>
                  <input id="company-logo-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} disabled={readOnly || saving} />
                  {(logoPreview || (company.hasLogo && !clearLogo)) && !readOnly && <button type="button" onClick={removeLogo} disabled={saving}>Remove logo</button>}
                </div>
              </div>
            </div>

            <div className="company-profile-fields">
              <label className="company-field-wide">
                <span>Company name <b>*</b></span>
                <input value={form.companyName} onChange={(event) => updateForm('companyName', event.target.value)} maxLength="160" required disabled={readOnly || saving} />
              </label>
              <label className="company-field-wide">
                <span>Company address</span>
                <textarea value={form.companyAddress} onChange={(event) => updateForm('companyAddress', event.target.value)} maxLength="600" rows="3" disabled={readOnly || saving} />
              </label>
              <label>
                <span>Contact number</span>
                <input type="tel" value={form.contactNumber} onChange={(event) => updateForm('contactNumber', event.target.value)} maxLength="60" disabled={readOnly || saving} />
              </label>
              <label>
                <span>Email address</span>
                <input type="email" value={form.emailAddress} onChange={(event) => updateForm('emailAddress', event.target.value)} maxLength="254" autoComplete="email" disabled={readOnly || saving} />
              </label>
              <label className="company-field-wide">
                <span>Website</span>
                <input type="url" value={form.website} onChange={(event) => updateForm('website', event.target.value)} maxLength="255" autoComplete="url" disabled={readOnly || saving} />
              </label>
              <label className="company-field-wide">
                <span>Company description</span>
                <textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} maxLength="2000" rows="5" disabled={readOnly || saving} />
              </label>
            </div>

            <div className="company-profile-save">
              <small>{readOnly ? 'Your role can view this profile but cannot make changes.' : 'Save updates to make them available throughout the application.'}</small>
              <button className="primary-action" type="submit" disabled={saving || readOnly}>{saving ? 'Saving changes…' : 'Save Changes'}</button>
            </div>
          </form>

          <aside className="company-profile-summary" aria-label="Organization summary">
            <article>
              <span>Departments / teams</span>
              <strong>{departments.length}</strong>
              <small>Configured in Organization</small>
            </article>
            <article>
              <span>Active employees</span>
              <strong>{employees.length}</strong>
              <small>From workforce records</small>
            </article>
            <article>
              <span>Assigned employees</span>
              <strong>{assignedEmployeeCount}</strong>
              <small>With a current department or team</small>
            </article>
            <div className="company-assignment-note">
              <strong>Assignment management</strong>
              <p>Department, position, and reporting-line changes are managed in Organization so assignment history stays intact.</p>
              {canViewOrganization && <button type="button" onClick={() => onNavigate('organization')}>Review assignments →</button>}
            </div>
          </aside>
        </div>

        <section className="company-departments-card" aria-labelledby="company-departments-title">
          <div className="company-section-heading">
            <div>
              <span>Organization</span>
              <h2 id="company-departments-title">Departments and teams</h2>
              <p>Current units are read directly from the organization structure.</p>
            </div>
          </div>
          {departments.length ? <div className="company-department-list">
            {departments.map((department) => <article key={department.id}>
              <div>
                <span>{unitTypeLabel(department.unitType)}</span>
                <strong>{department.name}</strong>
                {department.description && <p>{department.description}</p>}
              </div>
              <b><strong>{department.employeeCount}</strong><small>active employees</small></b>
            </article>)}
          </div> : <div className="company-empty-state"><strong>No departments or teams are configured.</strong>{canViewOrganization && <button type="button" onClick={() => onNavigate('organization')}>Open Organization</button>}</div>}
        </section>

        <section className="company-directory-card" aria-labelledby="company-directory-title">
          <div className="company-section-heading">
            <div>
              <span>Workforce</span>
              <h2 id="company-directory-title">Employee assignments</h2>
              <p>Position and department / team values come from each employee’s current organization assignment.</p>
            </div>
            <small>{employees.length} active {employees.length === 1 ? 'employee' : 'employees'}</small>
          </div>
          {employees.length ? <div className="company-directory-table" tabIndex="0">
            <table>
              <thead>
                <tr><th>Employee</th><th>Position</th><th>Department / team</th></tr>
              </thead>
              <tbody>
                {employees.map((employee) => <tr key={employee.employeeId}>
                  <td>
                    <div className="company-employee-name">
                      <i aria-hidden="true">{employeeInitials(employee)}</i>
                      <span><strong>{employee.firstName} {employee.lastName}</strong>{employee.employeeNumber && <small>{employee.employeeNumber}</small>}</span>
                    </div>
                  </td>
                  <td>{employee.positionName || <em>Not assigned</em>}</td>
                  <td>{employee.unitNames || <em>Not assigned</em>}</td>
                </tr>)}
              </tbody>
            </table>
          </div> : <div className="company-empty-state"><strong>No active employees are available.</strong><span>Employee records will appear here when they are active.</span></div>}
        </section>
      </>}
    </section>
  );
}
