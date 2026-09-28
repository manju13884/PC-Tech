// Read-only inspection: emit presence flags, never values or raw API payloads.
const account = process.env.CLOUDFLARE_ACCOUNT_ID
const token = process.env.CLOUDFLARE_API_TOKEN
const keys = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'D1_DATABASE_LIMIT_BYTES', 'D1_ACCOUNT_STORAGE_LIMIT_BYTES', 'D1_DAILY_ROWS_READ_LIMIT', 'D1_DAILY_ROWS_WRITTEN_LIMIT', 'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ORG_ID', 'ZOHO_REGION']
const presence = vars => Object.fromEntries(keys.map(key => [key, { configured: Object.hasOwn(vars ?? {}, key), type: vars?.[key]?.type ?? null }]))
async function get(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {headers:{Authorization:`Bearer ${token}`}, signal:AbortSignal.timeout(20000)})
  if (!response.ok) throw new Error(`Control-plane inspection HTTP ${response.status}`)
  const payload = await response.json()
  if (!payload.success) throw new Error('Control-plane inspection failed')
  return payload.result
}
try {
  const project = await get('/pages/projects/pc-tech-production')
  const config = project.deployment_configs?.production
  console.log(JSON.stringify({productionBranchCorrect:project.production_branch === 'production', projectConfiguration:presence(config?.env_vars), productionBindingCorrect:config?.d1_databases?.DB?.id === 'e863e5c3-b60f-48a5-8fdd-862f1ac52eaf'}))
  if (project.canonical_deployment?.id) {
    const deployed = await get(`/pages/projects/pc-tech-production/deployments/${project.canonical_deployment.id}`)
    console.log(JSON.stringify({deploymentEnvironment:deployed.environment, deployedConfiguration:presence(deployed.env_vars)}))
  }
} catch (error) { console.error(error instanceof Error ? error.message : 'Inspection failed'); process.exitCode=1 }
