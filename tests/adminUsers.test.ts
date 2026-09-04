import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('inactive users are retained with blank display email and activation requires email', async () => {
  const [createApi, updateApi, service, dashboard, migration] = await Promise.all([
    readFile('functions/api/auth/users.ts', 'utf8'),
    readFile('functions/api/auth/users/[id].ts', 'utf8'),
    readFile('src/adminUsersService.ts', 'utf8'),
    readFile('src/Dashboard.tsx', 'utf8'),
    readFile('migrations/0022_archive_inactive_user_emails.sql', 'utf8'),
  ])

  assert.match(createApi, /existingEmail\?\.status === 'ACTIVE'/)
  assert.match(createApi, /archived_email = email/)
  assert.match(createApi, /getNextInactiveEmail/)
  assert.match(createApi, /inactive\$\{Number\(row\?\.next_number\) \|\| 1\}@polarcanvas\.com/)
  assert.match(createApi, /reserved for inactive users/)
  assert.match(createApi, /user\.status === 'INACTIVE' \? '' : user\.email/)
  assert.match(updateApi, /Email is required to activate the user/)
  assert.match(updateApi, /archived_email = email/)
  assert.match(updateApi, /getNextInactiveEmail/)
  assert.match(updateApi, /status = 'INACTIVE'/)
  assert.match(updateApi, /session_version = session_version \+ 1/)
  assert.match(updateApi, /user\.status === 'INACTIVE' \? '' : user\.email/)
  assert.match(service, /activateAdminUser\(userId: number, email: string\)/)
  assert.match(dashboard, /activateUserEmail/)
  assert.match(dashboard, /must not belong to another active user/)
  assert.match(migration, /ALTER TABLE users ADD COLUMN archived_email TEXT/)
  assert.doesNotMatch(`${createApi}\n${updateApi}\n${migration}`, /\b(?:DELETE\s+FROM|DROP\s+(?:TABLE|INDEX|DATABASE)|TRUNCATE)\b/i)
})
