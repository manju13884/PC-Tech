import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Job Tracking is a permission-controlled ERP workflow backed by Job Cards', async () => {
  const [migration, outputMigration, secondOutputMigration, reelMigration, completionMigration, api, jobCardsApi, component, jobCardComponent, styles, dashboard] = await Promise.all([
    readFile('migrations/0029_create_job_card_process_entries.sql', 'utf8'),
    readFile('migrations/0030_add_job_card_process_outputs.sql', 'utf8'),
    readFile('migrations/0031_add_second_corrugation_process_outputs.sql', 'utf8'),
    readFile('migrations/0032_add_job_card_process_reel_details.sql', 'utf8'),
    readFile('migrations/0033_add_job_card_completion_details.sql', 'utf8'),
    readFile('functions/api/job-tracking.ts', 'utf8'),
    readFile('functions/api/job-cards.ts', 'utf8'),
    readFile('src/features/job-tracking/JobTracking.tsx', 'utf8'),
    readFile('src/features/job-cards/JobCards.tsx', 'utf8'),
    readFile('src/features/job-tracking/job-tracking.css', 'utf8'),
    readFile('src/Dashboard.tsx', 'utf8'),
  ])
  assert.match(migration, /CREATE TABLE IF NOT EXISTS job_card_process_entries/)
  assert.match(migration, /UNIQUE\(job_card_id, process_name\)/)
  assert.doesNotMatch(migration, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  for (const column of ['in_quantity', 'out_quantity', 'employee_name']) assert.match(outputMigration, new RegExp(`ADD COLUMN ${column}`))
  assert.doesNotMatch(outputMigration, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  for (const column of ['in_quantity_2', 'out_quantity_2', 'employee_name_2']) assert.match(secondOutputMigration, new RegExp(`ADD COLUMN ${column}`))
  assert.doesNotMatch(secondOutputMigration, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  for (const column of ['reel_number', 'in_reel_weight', 'out_reel_weight', 'remaining_reel_weight', 'reel_number_2', 'in_reel_weight_2', 'out_reel_weight_2', 'remaining_reel_weight_2']) assert.match(reelMigration, new RegExp(`ADD COLUMN ${column}`))
  assert.doesNotMatch(reelMigration, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  for (const column of ['supervisor_name', 'quality_name', 'dispatch_name', 'box_weight_kg', 'manufactured_quantity']) assert.match(completionMigration, new RegExp(`ADD COLUMN ${column}`))
  assert.doesNotMatch(completionMigration, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  assert.match(api, /menu_key = 'job-tracking'/)
  assert.match(api, /FROM job_cards card/)
  assert.match(api, /spec\.attributes_json/)
  assert.match(api, /UPDATE job_cards SET status = \?, updated_at = CURRENT_TIMESTAMP WHERE id = \?/)
  assert.match(api, /UPDATE job_cards SET \$\{footerField\} = \?, updated_at = CURRENT_TIMESTAMP WHERE id = \?/)
  assert.match(api, /INSERT INTO job_card_process_entries/)
  assert.match(api, /ON CONFLICT\(job_card_id, process_name\) DO UPDATE SET/)
  assert.match(api, /process_entries_json/)
  assert.match(api, /'in_quantity', entry\.in_quantity, 'out_quantity', entry\.out_quantity, 'employee_name', entry\.employee_name/)
  assert.match(api, /'reel_number', entry\.reel_number/)
  assert.match(jobCardsApi, /process_entries_json/)
  assert.doesNotMatch(api, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  for (const status of ['CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']) assert.match(api, new RegExp(`'${status}'`))
  assert.match(component, /Production Job Tracking/)
  assert.match(component, /aria-label="Job status filter"/)
  assert.match(component, /method: 'PATCH'/)
  assert.match(component, /body: JSON\.stringify\(\{ jobCardId, processName, field, value \}\)/)
  assert.match(component, /body: JSON\.stringify\(\{ jobCardId, footerField, value \}\)/)
  assert.match(component, /<JobCard line=\{job\} processEditable/)
  assert.match(jobCardComponent, /type="datetime-local"/)
  assert.match(jobCardComponent, /processDateTimeText\(entry\?\.start_datetime\)/)
  assert.match(jobCardComponent, /aria-label="Corrugation In Qty 2"/)
  assert.match(jobCardComponent, /aria-label="Corrugation Out Qty 2"/)
  assert.match(jobCardComponent, /aria-label="Corrugation Employee Name 2"/)
  assert.match(jobCardComponent, /onBlur=\{\(event\) => onProcessValueChange/)
  assert.match(jobCardComponent, /className="job-card-footer-entry"/)
  assert.match(jobCardComponent, /onBlur=\{\(event\) => onFooterValueChange\?\.\(field, event\.target\.value\)\}/)
  assert.match(component, /className="job-cards-groups"/)
  assert.match(component, /Production Tracking/)
  assert.match(component, /aria-expanded=\{expanded\.includes\(job\.job_card_id\)\}/)
  assert.match(component, /title=\{`\$\{expanded\.includes\(job\.job_card_id\) \? 'Collapse' : 'Expand'\} Job Card`\}/)
  assert.match(component, /<JobCard line=\{job\} processEditable/)
  assert.match(component, /className="job-tracking-detail-row"/)
  assert.match(component, /Product Name/)
  assert.match(component, /Product Description/)
  assert.match(styles, /\.job-tracking-status\.is-in_progress/)
  assert.match(styles, /input\[type="datetime-local"\]/)
  assert.match(styles, /\.job-tracking-expanded-card \.job-card-process-entry \{/)
  assert.match(styles, /\.job-tracking-expanded-card \.job-card-footer-entry \{/)
  assert.match(styles, /\.job-tracking-expanded-card \.job-card-process-entry-stack \{[^}]*place-items: center;[^}]*align-content: center;/s)
  assert.match(styles, /\.job-tracking-expanded-card \.job-card-process-entry-stack > \.job-card-process-entry \{ width: 100%; height: 25px; justify-self: center; align-self: center; \}/)
  assert.match(styles, /\.job-tracking-expanded-card \.job-card-sheet/)
  assert.match(styles, /\.job-tracking-expanded-card \.job-card-process \.job-card-corrugation-row td \{ height: 58px; \}/)
  assert.match(styles, /\.job-tracking-expanded-card \.job-card-process td\.job-card-split-reels \{ padding: 0; \}/)
  assert.match(styles, /\.job-tracking-expanded-card \.job-card-process td\.job-card-process-name \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/s)
  assert.match(styles, /\.job-tracking-expanded-card \.job-card-creasing-summary \{ display: grid; grid-template-columns: repeat\(6,minmax\(0,1fr\)\);/)
  assert.match(styles, /td\.job-card-split-reels::after,\.job-tracking-expanded-card \.job-card-process td\.job-card-split-process-values::after \{[^}]*top: 50%;[^}]*border-top: 1px solid #64748b;/s)
  assert.match(styles, /\.job-tracking-expand:hover/)
  assert.match(styles, /\.job-tracking-list td:first-child \{ text-align: center; vertical-align: middle; \}/)
  assert.match(styles, /\.job-tracking-expand \{[^}]*width: 20px[^}]*height: 20px[^}]*margin: 0 auto[^}]*background: #f59e0b[^}]*color: #5f2b00/s)
  assert.doesNotMatch(styles, /\.job-tracking-expand \{[^}]*linear-gradient/s)
  assert.match(styles, /tr\.is-expanded \.job-tracking-expand \{[^}]*background: #2563eb/s)
  assert.match(styles, /\.tracking-col-updated \{ width: 8%; \}/)
  assert.match(styles, /\.job-tracking-list td \{ height: 34px;[^}]*font-size: \.56rem/s)
  assert.match(styles, /tr:not\(\.job-tracking-detail-row\) td:nth-child\(13\) \{ white-space: nowrap;/s)
  assert.match(dashboard, /import JobTracking/)
  assert.match(dashboard, /selectedItem\.key === 'job-tracking'[\s\S]*?<JobTracking \/>/)
  assert.match(dashboard, /selectedItem\.key === 'job-tracking' \? ' document-form-page'/)
  const placeholders = dashboard.match(/const NEW_MODULE_MENU_KEYS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
  assert.doesNotMatch(placeholders, /'job-tracking'/)
})
