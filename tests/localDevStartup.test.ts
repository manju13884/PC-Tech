import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('local development starts migrations, authentication backend, then frontend', async () => {
  const [script, packageJson, readme] = await Promise.all([
    readFile('scripts/dev-local.mjs', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('README.md', 'utf8'),
  ])
  const pkg = JSON.parse(packageJson)
  assert.equal(pkg.scripts.dev, 'node scripts/dev-local.mjs')
  assert.equal(pkg.devDependencies.wrangler, '4.32.0')
  assert.ok(script.indexOf("'migrations', 'apply'") < script.indexOf("'pages', 'dev'"))
  assert.ok(script.indexOf("'pages', 'dev'") < script.indexOf("'--use-system-ca', vite"))
  assert.match(script, /8788\/api\/auth\/me/)
  assert.match(script, /waitFor\(backendUrl/)
  assert.match(script, /'y\\n'/)
  assert.match(readme, /complete local startup command/)
})
