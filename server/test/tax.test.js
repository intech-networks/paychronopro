import test from 'node:test';import assert from 'node:assert/strict';import{calculateAnnualizedTax,calculatePhilippineWithholding,calculateProgressiveTax}from'../src/payroll/tax.js';
test('calculates tax from matching bracket',()=>assert.equal(calculateProgressiveTax(50000,0,[{lowerBound:0,upperBound:25000,baseTax:0,ratePercent:0},{lowerBound:25000,upperBound:null,baseTax:0,ratePercent:20}]).tax,5000));
test('deducts mandatory contributions before withholding',()=>{const result=calculatePhilippineWithholding({regularCompensation:50000,mandatoryContributions:2500,brackets:[{lowerBound:0,upperBound:20833,baseTax:0,ratePercent:0},{lowerBound:20833,upperBound:33333,baseTax:0,ratePercent:15},{lowerBound:33333,upperBound:66667,baseTax:1875,ratePercent:20}]});assert.equal(result.taxableIncome,47500);assert.equal(result.tax,4708.4);});
test('uses biweekly weekly-table conversion',()=>assert.equal(calculatePhilippineWithholding({regularCompensation:20000,frequency:'biweekly',brackets:[{lowerBound:0,upperBound:4808,baseTax:0,ratePercent:0},{lowerBound:4808,upperBound:7692,baseTax:0,ratePercent:15},{lowerBound:7692,upperBound:15385,baseTax:432.6,ratePercent:20}]}).tax,1788.4));
test('applies the configured per-table exemption before withholding',()=>{
  const result=calculatePhilippineWithholding({regularCompensation:30000,exemptionAmount:5000,brackets:[{lowerBound:0,upperBound:20000,baseTax:0,ratePercent:0},{lowerBound:20000,upperBound:null,baseTax:0,ratePercent:10}]});
  assert.equal(result.taxableIncome,25000);
  assert.equal(result.tax,500);
});
test('keeps non-taxable earnings in gross compensation without taxing them',()=>{
  const result=calculatePhilippineWithholding({regularCompensation:10000,supplementaryCompensation:3000,nonTaxableCompensation:1000,brackets:[{lowerBound:0,upperBound:null,baseTax:0,ratePercent:10}]});
  assert.equal(result.grossCompensation,13000);
  assert.equal(result.taxableIncome,12000);
  assert.equal(result.tax,1200);
});
test('uses the 2023 onwards annual table',()=>assert.equal(calculateAnnualizedTax(500000),42500));
