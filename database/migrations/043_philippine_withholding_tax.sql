ALTER TABLE tax_configurations DROP CONSTRAINT IF EXISTS tax_configurations_pay_frequency_check;
ALTER TABLE tax_configurations ADD CONSTRAINT tax_configurations_pay_frequency_check CHECK(pay_frequency IN ('daily','weekly','semi_monthly','monthly'));
ALTER TABLE employee_payroll_profiles ADD COLUMN IF NOT EXISTS is_minimum_wage_earner BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE employee_payroll_profiles ADD COLUMN IF NOT EXISTS sss_employee_share NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(sss_employee_share>=0);
ALTER TABLE employee_payroll_profiles ADD COLUMN IF NOT EXISTS philhealth_employee_share NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(philhealth_employee_share>=0);
ALTER TABLE employee_payroll_profiles ADD COLUMN IF NOT EXISTS pagibig_employee_share NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(pagibig_employee_share>=0);
ALTER TABLE employee_payroll_profiles ADD COLUMN IF NOT EXISTS union_dues NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(union_dues>=0);

WITH official(name,frequency) AS (VALUES ('BIR 2023 onwards — Daily','daily'),('BIR 2023 onwards — Weekly','weekly'),('BIR 2023 onwards — Semi-monthly','semi_monthly'),('BIR 2023 onwards — Monthly','monthly'))
INSERT INTO tax_configurations(name,effective_from,pay_frequency,exemption_amount,is_active)
SELECT name,'2023-01-01',frequency,0,TRUE FROM official
WHERE NOT EXISTS(SELECT 1 FROM tax_configurations existing WHERE existing.name=official.name);

WITH valueset(frequency,lower_bound,upper_bound,base_tax,rate_percent) AS (VALUES
('daily',0,685,0,0),('daily',685,1096,0,15),('daily',1096,2192,61.65,20),('daily',2192,5479,280.85,25),('daily',5479,21918,1102.60,30),('daily',21918,NULL,6034,35),
('weekly',0,4808,0,0),('weekly',4808,7692,0,15),('weekly',7692,15385,432.60,20),('weekly',15385,38462,1971.20,25),('weekly',38462,153846,7740.45,30),('weekly',153846,NULL,42355.65,35),
('semi_monthly',0,10417,0,0),('semi_monthly',10417,16667,0,15),('semi_monthly',16667,33333,937.50,20),('semi_monthly',33333,83333,4270.70,25),('semi_monthly',83333,333333,16770.70,30),('semi_monthly',333333,NULL,91770.70,35),
('monthly',0,20833,0,0),('monthly',20833,33333,0,15),('monthly',33333,66667,1875,20),('monthly',66667,166667,8541.80,25),('monthly',166667,666667,33541.80,30),('monthly',666667,NULL,183541.80,35))
INSERT INTO tax_brackets(configuration_id,lower_bound,upper_bound,base_tax,rate_percent)
SELECT configuration.id,value.lower_bound,value.upper_bound,value.base_tax,value.rate_percent FROM valueset value JOIN tax_configurations configuration ON configuration.name='BIR 2023 onwards — '||CASE value.frequency WHEN 'semi_monthly' THEN 'Semi-monthly' ELSE INITCAP(value.frequency) END
ON CONFLICT(configuration_id,lower_bound) DO UPDATE SET upper_bound=EXCLUDED.upper_bound,base_tax=EXCLUDED.base_tax,rate_percent=EXCLUDED.rate_percent;
