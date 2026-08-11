import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationDirectory = resolve('migrations')
const checksumPath = resolve(migrationDirectory, 'checksums.json')
const expectedChecksums = JSON.parse(readFileSync(checksumPath, 'utf8'))
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .sort()

const errors = []
for (const [index, fileName] of migrationFiles.entries()) {
  const expectedSequence = String(index + 1).padStart(4, '0')
  if (!fileName.startsWith(`${expectedSequence}_`)) {
    errors.push(`${fileName}: expected migration sequence ${expectedSequence}`)
  }

  const sql = readFileSync(resolve(migrationDirectory, fileName), 'utf8')
  if (/\b(?:DROP\s+(?:TABLE|DATABASE|INDEX)|TRUNCATE|DELETE\s+FROM)\b/i.test(sql)) {
    errors.push(`${fileName}: destructive SQL is prohibited`)
  }

  const expectedHash = expectedChecksums[fileName]
  const actualHash = createHash('sha256').update(sql).digest('hex')
  if (!expectedHash) {
    errors.push(`${fileName}: checksum is not registered`)
  } else if (actualHash !== expectedHash) {
    errors.push(`${fileName}: an existing migration was modified; create a new migration instead`)
  }
}

for (const lockedFile of Object.keys(expectedChecksums)) {
  if (!migrationFiles.includes(lockedFile)) errors.push(`${lockedFile}: locked migration is missing`)
}

if (errors.length > 0) {
  console.error(['D1 migration audit failed:', ...errors.map((error) => `- ${error}`)].join('\n'))
  process.exit(1)
}

console.log(`D1 migration audit passed (${migrationFiles.length} additive, checksum-locked migrations).`)
