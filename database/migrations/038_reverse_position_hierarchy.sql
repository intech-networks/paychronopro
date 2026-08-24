WITH position_scale AS (
  SELECT COALESCE(MAX(sort_order), 1) AS maximum
  FROM organization_positions
)
UPDATE organization_positions position
SET level = position_scale.maximum + 1 - position.sort_order,
    updated_at = NOW()
FROM position_scale
WHERE position.sort_order > 0;

UPDATE organization_positions
SET level = CASE name
  WHEN 'Chief Executive Officer' THEN 1
  WHEN 'President' THEN 2
  WHEN 'Vice President' THEN 3
  WHEN 'Senior Manager' THEN 4
  WHEN 'Area Manager' THEN 5
  WHEN 'Department Manager' THEN 6
  WHEN 'Department Supervisor' THEN 7
  WHEN 'Rank and File' THEN 8
  ELSE level END,
  updated_at = NOW()
WHERE name IN (
  'Chief Executive Officer', 'President', 'Vice President', 'Senior Manager',
  'Area Manager', 'Department Manager', 'Department Supervisor', 'Rank and File'
);
