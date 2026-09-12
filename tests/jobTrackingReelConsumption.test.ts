import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Job Tracking reel consumption is inventory-backed, additive and ledger controlled', async () => {
  const [migration, processMigration, api, jobCard, tracking] = await Promise.all([
    readFile('migrations/0039_add_job_tracking_reel_consumption.sql', 'utf8'),
    readFile('migrations/0041_add_job_process_completion.sql', 'utf8'),
    readFile('functions/api/job-tracking.ts', 'utf8'),
    readFile('src/features/job-cards/JobCards.tsx', 'utf8'),
    readFile('src/features/job-tracking/JobTracking.tsx', 'utf8'),
  ])
  assert.doesNotMatch(migration, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS job_tracking_reel_consumptions/)
  assert.match(migration, /trg_job_tracking_ledger_validate/)
  assert.match(migration, /stock_balance_changed/)
  assert.match(migration, /trg_job_tracking_ledger_apply/)
  assert.match(api, /stock\.status = 'Available' AND stock\.reel_weight_kg > 0/)
  assert.match(api, /PRODUCTION_CONSUMPTION/)
  assert.match(api, /'JOB_PROCESS'/)
  assert.match(processMigration, /trg_job_process_ledger_validate/)
  assert.match(processMigration, /trg_job_process_ledger_apply/)
  assert.match(api, /Out Reel Weight cannot be greater than the available Reel Weight/)
  assert.match(api, /Available Reel weight has changed/)
  assert.match(api, /await db\.batch/)
  assert.match(jobCard, /Select Reel/)
  assert.match(jobCard, /readOnly value=\{entry\?\.\[inputField\]/)
  assert.match(jobCard, /onReelConsume/)
  assert.match(tracking, /action: 'selectReel'/)
  assert.match(api, /status === 'COMPLETED'/)
  assert.match(api, /completeProcess/)
  assert.match(tracking, /action: 'saveReelWeight'/)
  assert.match(tracking, /reelEditable=\{job\.job_status !== 'COMPLETED' && job\.job_status !== 'CANCELLED'\}/)
  assert.match(tracking, /Complete Process\?/)
  assert.match(tracking, /Completing this Process will update Inventory/)
  assert.match(tracking, /Reel is now available/)
  assert.match(jobCard, /Reel consumption will be updated when its Process is completed/)
  assert.match(jobCard, /process_status/)
  assert.match(api, /Process could not be completed because Inventory could not be updated\. No stock changes were made/)
})
