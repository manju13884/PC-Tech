import { spawn } from 'node:child_process'

const child = spawn(process.execPath, ['server/zohoBooksApi.js'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
