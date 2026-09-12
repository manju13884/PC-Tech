import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('reel consumption commits atomically at Process completion', async () => {
  const [migration,api,tracking,jobCard,report,ledger]=await Promise.all([
    readFile('migrations/0041_add_job_process_completion.sql','utf8'),
    readFile('functions/api/job-tracking.ts','utf8'),
    readFile('src/features/job-tracking/JobTracking.tsx','utf8'),
    readFile('src/features/job-cards/JobCards.tsx','utf8'),
    readFile('functions/api/stock-report.ts','utf8'),
    readFile('functions/api/stock-ledger.ts','utf8'),
  ])
  assert.doesNotMatch(migration,/\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  assert.match(migration,/ADD COLUMN process_status/)
  assert.match(migration,/NOT_STARTED.*IN_PROGRESS.*COMPLETED/s)
  assert.match(migration,/reference_type = 'JOB_PROCESS'/)
  assert.match(migration,/trg_job_process_ledger_validate/)
  assert.match(migration,/trg_job_process_ledger_apply/)
  assert.match(api,/const reelProcesses = \['Paper Cutting', 'Corrugation'\]/)
  assert.match(api,/body\.action === 'setProcessStatus'/)
  assert.match(api,/completeProcess/)
  assert.match(api,/VALUES \('PRODUCTION_CONSUMPTION', 'JOB_PROCESS'/)
  assert.match(api,/release_reason='PROCESS_COMPLETED'/)
  assert.match(api,/reservation was restored for this Process/)
  assert.match(api,/INSERT INTO inventory_reel_reservations/)
  assert.match(api,/already reserved for Job \$\{reservation\.job_number\}/)
  assert.match(api,/reservation\.process_entry_id !== value\.entry\.process_entry_id/)
  assert.match(api,/process_status='COMPLETED'/)
  assert.match(api,/Completed Process reel details are read-only/)
  assert.match(api,/Complete the \$\{activeReservation\.process_name\} Process before completing this Job/)
  assert.match(tracking,/Complete Process\?/)
  assert.match(tracking,/Completing this Process will update Inventory and release the/)
  assert.match(tracking,/Reel is now available/)
  assert.match(jobCard,/Not Started/)
  assert.match(jobCard,/In Progress/)
  assert.match(jobCard,/entry\?\.process_status !== 'COMPLETED'/)
  assert.match(report,/JOB_PROCESS/)
  assert.match(ledger,/JOB_PROCESS/)
})

test('Process status persists and is shared by Job Tracking and Job Cards', async () => {
  const [trackingApi, jobCardsApi] = await Promise.all([
    readFile('functions/api/job-tracking.ts', 'utf8'),
    readFile('functions/api/job-cards.ts', 'utf8'),
  ])
  assert.match(jobCardsApi, /'process_entry_id', entry\.id, 'process_status', entry\.process_status/)
  assert.match(trackingApi, /persisted\.process_status !== processStatus/)
  assert.match(trackingApi, /if \(processStatus === 'COMPLETED'\)/)
  assert.match(trackingApi, /movements: \[\]/)
})
