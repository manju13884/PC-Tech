import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const menuKeys = [
  'so-specification-mapping',
  'product-specifications',
  'production-specifications',
  'job-cards',
  'production-planning',
  'production-planned',
  'job-tracking',
]

test('new Sales and Production menus are permission-controlled everywhere', async () => {
  const [dashboard, login, currentUser, originalMigration, plannedMigration] = await Promise.all([
    readFile('src/Dashboard.tsx', 'utf8'),
    readFile('functions/api/auth/login.ts', 'utf8'),
    readFile('functions/api/auth/me.ts', 'utf8'),
    readFile('migrations/0015_add_sales_production_menu_permissions.sql', 'utf8'),
    readFile('migrations/0025_add_production_planned_permission.sql', 'utf8'),
  ])

  for (const menuKey of menuKeys) {
    for (const source of [dashboard, login, currentUser, `${originalMigration}\n${plannedMigration}`]) {
      assert.match(source, new RegExp(`['\"]${menuKey}['\"]`))
    }
  }
})

test('menu permission migration is additive and preserves existing data', async () => {
  const migration = await readFile('migrations/0015_add_sales_production_menu_permissions.sql', 'utf8')

  assert.match(migration, /INSERT OR IGNORE INTO role_menu_permissions/i)
  assert.doesNotMatch(migration, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
})
