import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { calculateTwoPlyQuantity } from '../src/features/production-planning/productionPlanningCalculations.ts'

test('Production Planning reuses the existing menu and supports multi-order planning', async () => {
  const [dashboard, component] = await Promise.all([
    readFile('src/Dashboard.tsx', 'utf8'),
    readFile('src/features/production-planning/ProductionPlanning.tsx', 'utf8'),
  ])
  assert.equal((dashboard.match(/key: 'production-planning'/g) ?? []).length, 1)
  assert.match(dashboard, /<ProductionPlanning \/>/)
  assert.match(component, /nextSelected\.map/)
  assert.match(component, /salesOrderIds: nextSelected\.map/)
  assert.match(component, /lines\.map\(renderPlanningRow\)/)
  assert.match(component, /busy \? 'Saving…' : 'Save'/)
  assert.match(component, /Take for Production/)
  assert.doesNotMatch(component, /Add Sales Order/)
  assert.match(component, /const removeLine = \(line: PlanLine\)/)
  assert.match(component, /className="production-row-remove"/)
  assert.match(component, /aria-label=\{`Remove \$\{v\.salesOrderNumber\} \$\{v\.itemName\}`\}/)
  assert.match(component, /Save as Draft/)
  assert.match(component, /Generate Production Plan/)
  assert.match(component, /SPECIFICATION_MISSING/)
  assert.match(component, /productionQuantity > v\.balanceQuantity/)
  assert.match(component, /calculateTwoPlyQuantity\(value\.productionQuantity, value\.ply\)/)
  assert.match(component, /aria-label="2 Ply Qty"/)
  assert.match(component, /value=\{v\.twoPlyQuantity \?\? calculateTwoPlyQuantity\(v\.productionQuantity, v\.ply\) \?\? ''\}/)
  assert.match(component, /aria-label="Deckle Size"/)
  assert.match(component, /type="text" value=\{v\.deckleSize \?\? preloadedDeckleSize\(v\)\}/)
  assert.match(component, /layer\.deckle_size\?\.trim\(\)/)
  assert.match(component, /x\.salesOrderId === v\.salesOrderId && x\.lineItemId === v\.lineItemId/)
})

test('2 Ply Qty scales with the number of corrugated two-ply webs', () => {
  assert.equal(calculateTwoPlyQuantity(1_000, 2), 1_000)
  assert.equal(calculateTwoPlyQuantity(1_000, 3), 1_000)
  assert.equal(calculateTwoPlyQuantity(1_000, 5), 2_000)
  assert.equal(calculateTwoPlyQuantity(1_000, 7), 3_000)
  assert.equal(calculateTwoPlyQuantity(1_000, 9), 4_000)
  assert.equal(calculateTwoPlyQuantity(1_000, null), null)
})

test('Production Plan persistence is additive, audited, and concurrency guarded', async () => {
  const [migration, permissionMigration, prepareApi, saveApi, plannedComponent, plannedStyles, dashboard] = await Promise.all([
    readFile('migrations/0024_create_production_planning.sql', 'utf8'),
    readFile('migrations/0025_add_production_planned_permission.sql', 'utf8'),
    readFile('functions/api/production-planning/prepare.ts', 'utf8'),
    readFile('functions/api/production-plans.ts', 'utf8'),
    readFile('src/features/production-planned/ProductionPlanned.tsx', 'utf8'),
    readFile('src/features/production-planned/production-planned.css', 'utf8'),
    readFile('src/Dashboard.tsx', 'utf8'),
  ])
  assert.match(migration, /CREATE TABLE IF NOT EXISTS production_plans/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS production_plan_lines/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS production_plan_status_history/)
  assert.match(migration, /production_quantity_exceeds_balance/)
  assert.doesNotMatch(migration, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  assert.match(prepareApi, /SUM\(line\.production_quantity\)/)
  assert.match(prepareApi, /SPECIFICATION_MISSING/)
  assert.match(saveApi, /getZohoSalesOrderById/)
  assert.match(saveApi, /Production quantity cannot exceed the available Sales Order balance/)
  assert.match(saveApi, /approved_specification_revision_id/)
  assert.match(saveApi, /db\.batch\(statements\)/)
  assert.equal((saveApi.match(/INSERT INTO production_plans \(plan_number/g) ?? []).length, 2)
  assert.equal((saveApi.match(/VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/g) ?? []).length, 2)
  assert.match(permissionMigration, /'production-planned'/)
  assert.doesNotMatch(permissionMigration, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  assert.match(dashboard, /key: 'production-planned'/)
  assert.match(dashboard, /<ProductionPlanned \/>/)
  assert.match(plannedComponent, /Sales Orders for Production/)
  assert.match(plannedComponent, /\/api\/production-plans\?view=lines/)
  assert.match(plannedComponent, /<GridColumns\s*\/>\s*<GridHeader\s*\/>/)
  assert.match(plannedComponent, /colSpan=\{30\}/)
  for (const option of ['All Statuses', 'DRAFT', "Yesterday's Production", "Today's Production", "Tomorrow's Production", 'Custom Date Production']) assert.match(plannedComponent, new RegExp(option))
  assert.match(plannedComponent, /line\.plan_date >= customFromDate/)
  assert.match(plannedComponent, /line\.plan_date <= customToDate/)
  assert.match(plannedComponent, />From<\/span>/)
  assert.match(plannedComponent, />To<\/span>/)
  assert.match(plannedComponent, /formatIstDate\(customFromDate, ["']DD-MMM-YYYY["']\)/)
  assert.match(plannedComponent, /formatIstDate\(customToDate, ["']DD-MMM-YYYY["']\)/)
  assert.doesNotMatch(plannedComponent, /aria-label="Select Production Plan"/)
  assert.match(plannedComponent, /Print \/ Save PDF/)
  assert.match(plannedComponent, /window\.print\(\)/)
  assert.match(plannedComponent, /disabled=\{filtered\.length === 0\}/)
  assert.match(plannedComponent, /printFilterLabel/)
  assert.match(plannedStyles, /@page \{ size: A4 landscape; margin: 5mm 7mm; \}/)
  assert.match(plannedStyles, /padding-right: 4mm !important; padding-left: 4mm !important;/)
  assert.match(plannedStyles, /outline: \.6pt solid #94a3b8;/)
  assert.match(saveApi, /searchParams\.get\('id'\)/)
  assert.match(saveApi, /FROM production_plan_lines line/)
  assert.match(saveApi, /two_ply_quantity/)
  assert.match(saveApi, /deckle_size/)
})
