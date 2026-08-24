INSERT INTO modules (module_key, name, description, sort_order) VALUES
  ('payout_view', 'Payout View', 'Preview actual employee payout calculations by pay period.', 73)
ON CONFLICT (module_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,sort_order=EXCLUDED.sort_order,is_active=TRUE;

INSERT INTO role_permissions (role_id,module_id,can_create,can_view,can_update,can_delete)
SELECT source.role_id,payout.id,FALSE,source.can_view,FALSE,FALSE
FROM role_permissions source
JOIN modules setup ON setup.id=source.module_id AND setup.module_key='payroll_setup'
JOIN modules payout ON payout.module_key='payout_view'
ON CONFLICT (role_id,module_id) DO UPDATE SET can_view=role_permissions.can_view OR EXCLUDED.can_view,updated_at=NOW();
