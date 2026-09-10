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
  assert.match(component, /customer\.customer_name} - \$\{customer\.gst_number}/)
  assert.match(component, /\{customerDisplayName\(v\)\}/)
  assert.match(component, /salesOrderIds: nextSelected\.map/)
  assert.match(component, /lines\.map\(renderPlanningRow\)/)
  assert.match(component, /busy \? 'Pushing…' : 'Push to Production'/)
  assert.match(component, /onClick=\{\(\) => void submit\('generate'\)\}/)
  assert.match(component, /disabled=\{!included\.length \|\| invalid \|\| busy\}/)
  assert.equal((component.match(/className="production-required-mark"/g) ?? []).length, 4)
  assert.match(component, /Mandatory to push/)
  assert.match(component, /Take for Production/)
  assert.doesNotMatch(component, /Add Sales Order/)
  assert.match(component, /const removeLine = \(line: PlanLine\)/)
  assert.match(component, /className="production-row-remove"/)
  assert.match(component, /aria-label=\{`Remove \$\{v\.salesOrderNumber\} \$\{v\.itemName\}`\}/)
  assert.match(component, /Save as Draft/)
  assert.match(component, /Generate Production Plan/)
  assert.match(component, /SPECIFICATION_MISSING/)
  assert.match(component, /productionQuantity > v\.balanceQuantity/)
  assert.match(component, /v\.filter\(isProductionSalesOrder\)/)
  assert.match(component, /status === 'open' \|\| status === 'partiallyinvoiced' \|\| status === 'overdue'/)
  assert.doesNotMatch(component, /v\.deliveryDate < todayIso\(\)/)
  assert.doesNotMatch(component, /aria-label="Delivery Date" type="date" min=/)
  assert.match(component, /max=\{v\.balanceQuantity\}/)
  assert.match(component, /aria-label="Box Qty"/)
  assert.match(component, /calculateTwoPlyQuantity\(value\.productionQuantity, value\.ply\)/)
  assert.match(component, /aria-label="2 Ply Qty"/)
  assert.match(component, /value=\{v\.twoPlyQuantity \?\? calculateTwoPlyQuantity\(v\.productionQuantity, v\.ply\) \?\? ''\}/)
  assert.match(component, /aria-label="Deckle Size"/)
  assert.match(component, /type="text" value=\{v\.deckleSize \?\? preloadedDeckleSize\(v\)\}/)
  assert.match(component, /layer\.deckle_size\?\.trim\(\)/)
  assert.match(component, /x\.salesOrderId === v\.salesOrderId && x\.lineItemId === v\.lineItemId/)
})

test('Additional SO products propagate through planning, planned, Job Cards and Job Tracking', async () => {
  const [prepareApi, plansApi, plannedApi, jobCardsApi, trackingApi] = await Promise.all([
    readFile('functions/api/production-planning/prepare.ts', 'utf8'),
    readFile('functions/api/production-plans.ts', 'utf8'),
    readFile('src/features/production-planned/ProductionPlanned.tsx', 'utf8'),
    readFile('functions/api/job-cards.ts', 'utf8'),
    readFile('functions/api/job-tracking.ts', 'utf8'),
  ])
  assert.match(prepareApi, /FROM so_line_child_specifications child/)
  assert.match(prepareApi, /':child:' \|\| child\.product_specification_id/)
  assert.match(prepareApi, /Additional Product for/)
  assert.match(plansApi, /FROM so_line_child_specifications child/)
  assert.match(plansApi, /mapping\.is_additional/)
  assert.match(plannedApi, /production_quantity/)
  assert.match(jobCardsApi, /(?:FROM|JOIN) production_plan_lines line/)
  assert.match(trackingApi, /(?:FROM|JOIN) production_plan_lines line/)
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
  assert.match(prepareApi, /orderedQuantity - invoicedQuantity/)
  assert.match(prepareApi, /remainingQuantity - childPreviouslyPlanned/)
  assert.match(prepareApi, /\['open', 'partiallyinvoiced', 'overdue'\]/)
  assert.match(prepareApi, /SPECIFICATION_MISSING/)
  assert.match(saveApi, /getZohoSalesOrderById/)
  assert.match(saveApi, /Box Qty cannot exceed the available Remaining Qty/)
  assert.match(saveApi, /remote\.line\.quantity - remote\.line\.quantity_invoiced/)
  assert.match(saveApi, /\['open', 'partiallyinvoiced', 'overdue'\]/)
  assert.match(saveApi, /if \(productionDate < minimumDate\)/)
  assert.doesNotMatch(saveApi, /productionDate < minimumDate \|\| deliveryDate < minimumDate/)
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
  assert.match(plannedComponent, /const printProductionPlan = \(\) =>/)
  assert.match(plannedComponent, /Production-Planned-\$\{firstDate\}-to-\$\{lastDate\}/)
  assert.match(plannedComponent, /window\.addEventListener\("afterprint"/)
  assert.match(plannedComponent, /onClick=\{printProductionPlan\}/)
  assert.match(plannedComponent, /disabled=\{filtered\.length === 0\}/)
  assert.match(plannedComponent, /printFilterLabel/)
  assert.match(plannedComponent, /src="\/assets\/PC-Bord-Logo-only-transparent\.png" alt="PolarCanvas"/)
  assert.match(plannedStyles, /@page \{ size: A4 landscape; margin: 5mm; \}/)
  assert.match(plannedStyles, /\.production-planned-grid-panel \{[^}]*font-family: Arial[^}]*print-color-adjust: exact/s)
  assert.match(plannedStyles, /\.production-planned-grid-panel \.production-lines-scroll td \{[^}]*font-size: 5pt[^}]*font-weight: 700/s)
  assert.match(plannedStyles, /\.production-planned-grid-panel \.production-lines-scroll th \{[^}]*font-size: 4\.35pt[^}]*font-weight: 800/s)
  assert.match(plannedStyles, /\.col-order-number \{ width: 6\.5%; \}/)
  assert.match(plannedStyles, /td:nth-child\(2\) strong \{ white-space: nowrap;/)
  assert.match(plannedStyles, /tbody tr:nth-child\(even\) td \{ background: #eaf1f7 !important; \}/)
  assert.match(plannedStyles, /\.production-planned-print-heading h1 \{[^}]*left: 50%[^}]*translateX\(-50%\)[^}]*text-align: center/s)
  assert.match(plannedStyles, /\.production-planned-print-heading img \{[^}]*left: 0[^}]*width: 9mm/s)
  assert.match(plannedStyles, /padding-right: 2mm !important; padding-left: 2mm !important;/)
  assert.match(plannedStyles, /outline: \.8pt solid #475569;/)
  assert.match(saveApi, /searchParams\.get\('id'\)/)
  assert.match(saveApi, /FROM production_plan_lines line/)
  assert.match(saveApi, /two_ply_quantity/)
  assert.match(saveApi, /deckle_size/)
})
