export const currentOrganizationJoin = `
  LEFT JOIN LATERAL (
    SELECT STRING_AGG(DISTINCT unit.name, ', ' ORDER BY unit.name) AS department,
           STRING_AGG(DISTINCT position.name, ', ' ORDER BY position.name) AS job_title
    FROM organization_assignments assignment
    JOIN organization_departments unit ON unit.id=assignment.unit_id
    JOIN organization_positions position ON position.id=assignment.position_id
    WHERE assignment.employee_id=employee.id
      AND assignment.effective_from<=CURRENT_DATE
      AND (assignment.effective_to IS NULL OR assignment.effective_to>=CURRENT_DATE)
  ) current_organization ON TRUE`;

export const currentJobTitleSql = "COALESCE(current_organization.job_title, '')";
export const currentDepartmentSql = "COALESCE(current_organization.department, '')";
