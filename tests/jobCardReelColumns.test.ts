import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Job Cards and Job Tracking omit Out Reel Weight while retaining balance entry', async () => {
  const [jobCard, jobTracking] = await Promise.all([
    readFile('src/features/job-cards/JobCards.tsx', 'utf8'),
    readFile('src/features/job-tracking/JobTracking.tsx', 'utf8'),
  ])

  assert.doesNotMatch(jobCard, /<th>Out Reel Weight<\/th>/)
  assert.doesNotMatch(jobCard, /label="Out Reel Weight"/)
  assert.doesNotMatch(jobTracking, /<dt>Out Reel Weight<\/dt>/)
  assert.match(jobCard, /label === 'Remaining Reel Weight'/)
  assert.match(jobCard, /onReelConsume\?\.\(stage, slot, event\.target\.value\)/)
  assert.match(jobCard, /<th>Consumed Weight<\/th>/)
  assert.match(jobCard, /<th>Remaining Reel Weight<\/th>/)
})

test('Corrugation uses one entry per production-output cell in both shared views', async () => {
  const jobCard = await readFile('src/features/job-cards/JobCards.tsx', 'utf8')

  assert.doesNotMatch(jobCard, /aria-label="Corrugation (?:In Qty 2|Out Qty 2|Employee Name 2)"/)
  assert.doesNotMatch(jobCard, /stage === 'Corrugation' && <input key=\{`\$\{stage\}:(?:in2|out2|employee2):/)
  assert.match(jobCard, /aria-label=\{`\$\{stage\} In Qty`\}/)
  assert.match(jobCard, /aria-label=\{`\$\{stage\} Out Qty`\}/)
  assert.match(jobCard, /aria-label=\{`\$\{stage\} Employee Name`\}/)
})
