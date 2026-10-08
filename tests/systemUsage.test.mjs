import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const api = await load('functions/api/system-usage.ts')
const { collectSystemUsage, usageEnvironment, zohoMetricFromHeaders } = await load('functions/lib/systemUsage.ts')
const { formatUsage, formatUsageTime } = await load('src/features/system-usage/systemUsageFormatting.ts')
const account = 'a'.repeat(32)
const stagingId = '0d749a66-9654-4767-b56a-afd4f8bcd9a1'
const productionId = 'e863e5c3-b60f-48a5-8fdd-862f1ac52eaf'
const envCredentials = { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: 'secret-not-for-browser' }

function fixture({ role = 'SUPERADMIN', permission = false, size = 24600000, brokenSize = false, expired = false } = {}) {
  const sql = []
  return { sql, DB: { prepare(query) {
    sql.push(query)
    assert.match(query.trim(), /^SELECT\s/i, 'Monitoring only prepares reads')
    return {
      bind() { return this },
      async first() {
        if (query.includes('FROM sessions')) return {
          user_id: 1, role_id: 1, role_name: role, user_status: 'ACTIVE', role_is_active: 1,
          session_revoked_at: null, session_version: 1, user_session_version: 1,
          session_expires_at: new Date(Date.now() + (expired ? -60000 : 60000)).toISOString(),
        }
        if (query.includes('role_menu_permissions')) return permission ? { allowed: 1 } : null
        throw new Error('Unexpected auth query')
      },
      async all() {
        assert.equal(query, 'SELECT 1', 'No business-table scans')
        if (brokenSize) throw new Error('Sensitive database internals')
        return { success: true, meta: { size_after: size, rows_written: 0 }, results: [{ 1: 1 }] }
      },
    }
  } } }
}
function request(host = 'http://localhost', method = 'GET', authenticated = true) {
  return new Request(`${host}/api/system-usage`, { method, headers: authenticated ? { Cookie: 'pc_tech_session=test' } : {} })
}

const diagnostics = []
mock.method(console, 'warn', (...args) => diagnostics.push(args))
const zohoEnv = { ZOHO_ORG_ID: '1234567', ZOHO_CLIENT_ID: 'client-secret', ZOHO_CLIENT_SECRET: 'secret', ZOHO_REFRESH_TOKEN: 'refresh-secret', ZOHO_REGION: 'in' }
const headers = (limit='5000', remaining='4916', reset='38000') => new Headers({'x-rate-limit-limit':limit,'x-rate-limit-remaining':remaining,'x-rate-limit-reset':reset})
function cloudflare({ storageStatus, analyticsStatus, incomplete=false, reads=1210000, writes=12420, errors=[], emptyAnalytics=false } = {}) {
  const calls=[]
  const fetcher=async(url,init)=>{
    calls.push({url,init})
    assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/'))
    assert.equal(init.headers.Authorization,'Bearer '+envCredentials.CLOUDFLARE_API_TOKEN)
    assert.equal(init.redirect,'manual')
    assert.ok(!url.includes('/pages/'),'No extra Pages permission required')
    if(url.endsWith('/graphql')){
      if(analyticsStatus)return new Response('sensitive-body',{status:analyticsStatus})
      const body=JSON.parse(init.body)
      assert.match(body.query,/datetimeHour_geq: \$start/)
      assert.match(body.query,/datetimeHour_leq: \$end/)
      assert.equal(body.variables.start,body.variables.end.slice(0,10)+'T00:00:00.000Z')
      assert.ok(Date.parse(body.variables.end)<=Date.now())
      assert.equal(body.variables.accountTag,account)
      assert.ok(!body.query.includes('databaseId'))
      return Response.json({errors,data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:emptyAnalytics?[]:[{sum:{rowsRead:reads,rowsWritten:writes}}]}]}}})
    }
    if(storageStatus)return new Response('sensitive-body',{status:storageStatus})
    if(url.includes('?'))return Response.json({success:true,result:[{uuid:stagingId},{uuid:productionId}],result_info:{total_count:incomplete?3:2}})
    return Response.json({success:true,result:{file_size:url.endsWith(stagingId)?24600000:103800000}})
  }
  return {calls,fetcher}
}
const collect = (f,cf,extra={},host='http://localhost') => collectSystemUsage(request(host),{DB:f.DB,...envCredentials,...extra},cf.fetcher)

test('anonymous, expired, forbidden and non-GET requests are rejected before monitoring',async()=>{
  for(const [options,req,status] of [[{},request('http://localhost','GET',false),401],[{expired:true},request(),401],[{role:'SALES'},request(),403],[{},request('http://localhost','POST'),405]]){
    const f=fixture(options)
    assert.equal((await api.onRequest({request:req,env:{DB:f.DB}})).status,status)
    assert.ok(!f.sql.includes('SELECT 1'))
  }
})
test('SUPERADMIN and existing Data Management permission can read all five rows',async()=>{
  for(const options of [{},{role:'SALES',permission:true}]){
    const f=fixture(options)
    const response=await api.onRequest({request:request(),env:{DB:f.DB}})
    assert.equal(response.status,200)
    assert.equal(response.headers.get('Cache-Control'),'no-store')
    const body=await response.json()
    assert.equal(body.environment,'LOCAL')
    assert.equal(Object.keys(body.metrics).length,5)
    assert.equal(body.metrics.d1Database.current,24600000)
    assert.equal(body.metrics.d1Database.available,true)
    assert.equal(body.metrics.zohoApi.code,'configuration')
    assert.equal(body.metrics.totalD1.reason,'Cloudflare Account ID and API token are not configured.')
    assert.ok(Date.parse(body.refreshedAt))
  }
})
test('local current binding and configured account metrics are independent',async()=>{
  const cf=cloudflare(),f=fixture({size:1024000})
  const result=await collect(f,cf)
  assert.equal(result.environment,'LOCAL')
  assert.equal(result.metrics.d1Database.current,1024000)
  assert.equal(result.metrics.totalD1.current,128400000)
  assert.equal(result.metrics.d1RowsRead.current,1210000)
  assert.equal(result.metrics.d1RowsWritten.current,12420)
  assert.equal(cf.calls.length,4)
})
test('hostnames never select alternate credentials or production database bindings',async()=>{
  for(const [host,label] of [['https://pc-tech.pages.dev','STAGING'],['https://polarcanvas.in','PRODUCTION'],['https://unmapped.example','UNAVAILABLE']]){
    const cf=cloudflare()
    const result=await collect(fixture(),cf,{},host)
    assert.equal(result.environment,label)
    assert.ok(cf.calls.every(c=>!c.url.includes('/pages/')))
    assert.equal(result.metrics.totalD1.current,128400000)
  }
  assert.equal(usageEnvironment('http://192.168.1.5').environment,'LOCAL')
})
test('missing and invalid configuration have precise reasons and make no network calls',async()=>{
  for(const [values,reason] of [[{},'Cloudflare Account ID and API token are not configured.'],[{CLOUDFLARE_ACCOUNT_ID:account},'Cloudflare API token not configured.'],[{CLOUDFLARE_ACCOUNT_ID:'invalid'},'Cloudflare Account ID is invalid.']]){
    const result=await collectSystemUsage(request(),{DB:fixture().DB,...values},async()=>assert.fail('No external call without explicit credentials'))
    assert.equal(result.metrics.totalD1.reason,reason)
    assert.equal(result.metrics.d1RowsRead.reason,reason)
  }
})
test('all five metrics load with authoritative fixtures, configured limits and no persisted counters',async()=>{
  const cf=cloudflare()
  const result=await collectSystemUsage(request(),{DB:fixture().DB,...envCredentials,...zohoEnv,D1_DATABASE_LIMIT_BYTES:'500000000',D1_ACCOUNT_STORAGE_LIMIT_BYTES:'5000000000',D1_DAILY_ROWS_READ_LIMIT:'5000000',D1_DAILY_ROWS_WRITTEN_LIMIT:'100000'},cf.fetcher,async()=>headers())
  assert.equal(result.metrics.zohoApi.current,84)
  assert.equal(result.metrics.zohoApi.limit,5000)
  assert.equal(result.metrics.zohoApi.remaining,4916)
  assert.equal(result.metrics.d1Database.remaining,475400000)
  assert.equal(result.metrics.totalD1.remaining,4871600000)
  assert.equal(result.metrics.d1RowsRead.remaining,3790000)
  assert.equal(result.metrics.d1RowsWritten.remaining,87580)
  for(const metric of Object.values(result.metrics))assert.ok(Date.parse(metric.asOf))
  assert.ok(!JSON.stringify(result).includes('secret'))
  assert.ok(!JSON.stringify(result).includes(account))
})
test('unknown/invalid limits never become fake numbers and over-limit remaining clamps to zero',async()=>{
  const cf=cloudflare()
  const result=await collect(fixture(),cf,{D1_DATABASE_LIMIT_BYTES:'1',D1_ACCOUNT_STORAGE_LIMIT_BYTES:'-10',D1_DAILY_ROWS_READ_LIMIT:'500.5'})
  assert.equal(result.metrics.d1Database.remaining,0)
  assert.equal(result.metrics.totalD1.limit,null)
  assert.equal(result.metrics.d1RowsRead.limit,null)
  assert.match(result.metrics.d1RowsRead.limitReason,/invalid/)
  assert.equal(result.metrics.d1RowsWritten.limit,null)
})

test('explicit Free plan supplies server-side limits; unknown plans do not assume quotas',async()=>{
  const free=await collect(fixture(),cloudflare(),{D1_PLAN:'free'})
  assert.equal(free.metrics.d1Database.limit,500000000)
  assert.equal(free.metrics.totalD1.limit,5000000000)
  assert.equal(free.metrics.d1RowsRead.limit,5000000)
  assert.equal(free.metrics.d1RowsWritten.limit,100000)
  assert.equal(free.metrics.d1RowsWritten.remaining,87580)
  const override=await collect(fixture(),cloudflare(),{D1_PLAN:'free',D1_DAILY_ROWS_READ_LIMIT:'1'})
  assert.equal(override.metrics.d1RowsRead.remaining,0)
  for(const plan of ['paid','unknown','']) {
    const result=await collect(fixture(),cloudflare(),{D1_PLAN:plan})
    assert.equal(result.metrics.d1RowsRead.limit,null)
  }
})

test('explicit remote identity reuses REST size and preserves binding fallback on failure',async()=>{
  const cf=cloudflare()
  const remote=await collect(fixture(),cf,{D1_DATABASE_ID:productionId},'https://polarcanvas.in')
  assert.equal(remote.metrics.d1Database.current,103800000)
  assert.equal(cf.calls.length,4,'No extra storage API request')
  for(const extra of [{D1_DATABASE_ID:'not-a-database'},{D1_DATABASE_ID:productionId}]) {
    const result=await collect(fixture({size:1160000}),cloudflare({storageStatus:403}),extra)
    assert.equal(result.metrics.d1Database.current,1160000)
    assert.equal(result.metrics.totalD1.reason,'Cloudflare D1 Read permission required.')
  }
  const result=await collect(fixture(),cloudflare({analyticsStatus:403}))
  assert.equal(result.metrics.d1RowsRead.reason,'Cloudflare Account Analytics Read permission required.')
})

test('Zoho OAuth error diagnostics do not expose external messages',async()=>{
  for(const code of ['invalid_client','invalid_client_secret','invalid_code','invalid_token','invalid_scope']) {
    const result=await collectSystemUsage(request(),{DB:fixture().DB,...zohoEnv},undefined,async()=>{throw Object.assign(new Error('sensitive-provider-payload'),{code,status:400})})
    assert.equal(result.metrics.zohoApi.code,code==='invalid_scope'?'permission':'authentication')
    assert.ok(!JSON.stringify(result).includes('sensitive-provider-payload'))
  }
})
test('inventory pagination deduplicates UUIDs and reuses authoritative listing sizes',async()=>{
  const ids=[stagingId,productionId,'12345678-1234-1234-1234-123456789abc']
  const cf=cloudflare(),pages=[]
  const fetcher=async(url,init)=>{
    if(url.endsWith('/graphql'))return cf.fetcher(url,init)
    assert.ok(url.includes('?'),'Listing metadata must avoid duplicate detail requests')
    const page=Number(new URL(url).searchParams.get('page'));pages.push(page)
    return Response.json({success:true,result:page===1?[{uuid:ids[0],file_size:100},{uuid:ids[1],file_size:200}]:[{uuid:ids[1].toUpperCase(),file_size:200},{uuid:ids[2],file_size:300}],result_info:{total_count:3,per_page:2}})
  }
  const result=await collectSystemUsage(request(),{DB:fixture().DB,...envCredentials},fetcher)
  assert.deepEqual(pages,[1,2])
  assert.equal(result.metrics.totalD1.current,600)
})
test('more than 40 databases with sizes from listing are fully supported',async()=>{
  const entries=Array.from({length:55},(_,i)=>({uuid:'12345678-1234-1234-1234-'+String(i).padStart(12,'0'),file_size:100}))
  const cf=cloudflare()
  const result=await collectSystemUsage(request(),{DB:fixture().DB,...envCredentials},async(url,init)=>url.endsWith('/graphql')?cf.fetcher(url,init):Response.json({success:true,result:entries,result_info:{total_count:55}}))
  assert.equal(result.metrics.totalD1.current,5500)
})
test('incomplete inventory never returns a partial total',async()=>{
  const result=await collect(fixture(),cloudflare({incomplete:true}))
  assert.equal(result.metrics.totalD1.current,null)
  assert.equal(result.metrics.totalD1.code,'incomplete')
  assert.equal(result.metrics.d1RowsRead.current,1210000)
})
test('HTTP 401/403/429/500 errors are classified and isolated by source',async()=>{
  for(const [status,code] of [[401,'authentication'],[403,'permission'],[429,'rate_limit'],[500,'provider_error']]){
    let result=await collect(fixture(),cloudflare({storageStatus:status}))
    assert.equal(result.metrics.totalD1.code,code)
    assert.equal(result.metrics.d1RowsRead.current,1210000)
    result=await collect(fixture(),cloudflare({analyticsStatus:status}))
    assert.equal(result.metrics.d1RowsRead.code,code)
    assert.equal(result.metrics.totalD1.current,128400000)
    assert.ok(!JSON.stringify(result).includes('sensitive-body'))
  }
})
test('GraphQL failures preserve safe categories and successful sibling fields',async()=>{
  for(const [message,code] of [['token SECRET has no permission','permission'],['Cannot query field SECRET','graphql_query'],['rate limit SECRET','rate_limit'],['failure SECRET','graphql_error']]){
    const result=await collect(fixture(),cloudflare({reads:null,errors:[{message,path:['viewer','accounts',0,'d1AnalyticsAdaptiveGroups',0,'sum','rowsRead']}]}))
    assert.equal(result.metrics.d1RowsRead.code,code)
    assert.equal(result.metrics.d1RowsWritten.current,12420)
    assert.ok(!JSON.stringify(result).includes('SECRET'))
  }
})
test('timeouts, malformed JSON and absent analytics do not hide current D1 size',async()=>{
  for(const [fetcher,code] of [[async()=>{throw new DOMException('secret','TimeoutError')},'timeout'],[async()=>new Response('not json'),'invalid_response']]){
    const result=await collectSystemUsage(request(),{DB:fixture().DB,...envCredentials},fetcher)
    assert.equal(result.metrics.totalD1.code,code)
    assert.equal(result.metrics.d1RowsRead.code,code)
    assert.equal(result.metrics.d1Database.current,24600000)
  }
  const result=await collect(fixture(),cloudflare({emptyAnalytics:true}))
  assert.equal(result.metrics.d1RowsRead.current,null)
  assert.equal(result.metrics.d1RowsRead.code,'no_data')
})
test('Zoho provider headers and resets are validated without guessing a plan',()=>{
  assert.equal(zohoMetricFromHeaders(headers()).current,84)
  assert.equal(zohoMetricFromHeaders(headers('12000','11000','1')).limit,12000)
  for(const h of [new Headers(),headers('100','90','60'),headers('5000','5001'),headers('5000','-1'),headers('5000','abc'),headers('5000','4000','999999')]){
    assert.throws(()=>zohoMetricFromHeaders(h),/cannot be verified/)
  }
})
test('Zoho auth, scope, rate-limit and unsupported headers fail independently',async()=>{
  for(const [fn,code] of [[async()=>{throw {status:401,message:'SECRET'}},'authentication'],[async()=>{throw {status:403}},'permission'],[async()=>{throw {status:429}},'rate_limit'],[async()=>new Headers(),'unsupported']]){
    const result=await collectSystemUsage(request(),{DB:fixture().DB,...envCredentials,...zohoEnv},cloudflare().fetcher,fn)
    assert.equal(result.metrics.zohoApi.code,code)
    assert.equal(result.metrics.totalD1.current,128400000)
    assert.ok(!JSON.stringify(result).includes('SECRET'))
  }
})
test('working bound database size survives all remote errors, invalid metadata is not zero',async()=>{
  const result=await collect(fixture({size:1024000}),cloudflare({storageStatus:403,analyticsStatus:403}))
  assert.equal(result.metrics.d1Database.current,1024000)
  for(const size of [null,-5,'1234']){
    const body=await collectSystemUsage(request(),{DB:fixture({size}).DB})
    assert.equal(body.metrics.d1Database.current,null)
  }
  const zero=await collect(fixture(),cloudflare({reads:0,writes:0}))
  assert.equal(zero.metrics.d1RowsRead.current,0)
})
test('diagnostics contain only category, metric and optional numeric HTTP status',()=>{
  assert.ok(diagnostics.length>0)
  for(const [prefix,entry] of diagnostics){
    assert.equal(prefix,'[system-usage]')
    assert.ok(Object.keys(entry).every(k=>['metric','code','status'].includes(k)))
    assert.ok(!JSON.stringify(entry).includes('SECRET'))
    assert.ok(!JSON.stringify(entry).includes(account))
  }
})
test('counts, storage and second-resolution IST times remain unchanged',()=>{
  assert.equal(formatUsage(12420),'12,420')
  assert.equal(formatUsage(1024000,true),'1.02 MB')
  assert.equal(formatUsage(0,true),'0 Bytes')
  assert.equal(formatUsage(null),'Unavailable')
  assert.equal(formatUsageTime('2026-09-28T06:13:20Z'),'28-Sep-2026 11:43:20 AM')
})
test('Zoho monitoring reuses OAuth and configured organization, returns only quota headers',async()=>{
  const zoho=await load('lib/zoho.ts')
  const calls=[]
  const original=globalThis.fetch
  globalThis.fetch=async(url,init)=>{
    calls.push({url:String(url),init})
    if(String(url).includes('/oauth/'))return Response.json({access_token:'private-access-token',expires_in:3600})
    assert.equal(init.headers.Authorization,'Zoho-oauthtoken private-access-token')
    assert.equal(init.redirect,'manual')
    assert.equal(new URL(url).searchParams.get('organization_id'),zohoEnv.ZOHO_ORG_ID)
    assert.equal(new URL(url).searchParams.get('per_page'),'1')
    return new Response('private-contact-payload',{headers:{'x-rate-limit-limit':'5000','x-rate-limit-remaining':'4000','x-rate-limit-reset':'10000','set-cookie':'private-cookie'}})
  }
  try{
    const result=await zoho.getZohoUsageHeaders(zohoEnv)
    assert.equal(result.get('x-rate-limit-remaining'),'4000')
    assert.equal(result.get('set-cookie'),null)
    assert.equal(calls.length,2)
    assert.ok(![...result.values()].some(v=>v.includes('private')))
  }finally{globalThis.fetch=original}
})

test('Zoho monitoring rejects redirects without following the location',async()=>{
  const zoho=await load('lib/zoho.ts')
  const original=globalThis.fetch
  let contactsCalls=0
  globalThis.fetch=async(url,init)=>{
    if(String(url).includes('/oauth/'))return Response.json({access_token:'private-access-token',expires_in:3600})
    contactsCalls++
    assert.equal(init.redirect,'manual')
    return new Response(null,{status:302,headers:{location:'https://other.example/'}})
  }
  try{
    await assert.rejects(()=>zoho.getZohoUsageHeaders(zohoEnv),error=>error.status===302)
    assert.equal(contactsCalls,1)
  }finally{globalThis.fetch=original}
})

test('monitoring requests use redirect modes accepted by the Workers runtime',async()=>{
  const {Miniflare}=await import('miniflare')
  const result=await build({stdin:{resolveDir:process.cwd(),contents:`
    import {getZohoUsageHeaders} from './lib/zoho';
    import {collectSystemUsage} from './functions/lib/systemUsage';
    export default {async fetch(){
      globalThis.fetch=async(url,init)=>{
        const request=new Request(url,init);
        if(String(url).includes('/oauth/'))return Response.json({access_token:'test',expires_in:3600});
        if(request.redirect!=='manual')throw new Error('Unsafe redirect mode');
        return new Response(null,{headers:{'x-rate-limit-limit':'5000','x-rate-limit-remaining':'4900','x-rate-limit-reset':'3600'}});
      };
      const env={ZOHO_CLIENT_ID:'test',ZOHO_CLIENT_SECRET:'test',ZOHO_REFRESH_TOKEN:'test',ZOHO_ORG_ID:'123',ZOHO_REGION:'in',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'test'};
      const headers=await getZohoUsageHeaders(env);
      const result=await collectSystemUsage(new Request('http://localhost'),env,async(url,init)=>{
        const request=new Request(url,init);
        if(request.redirect!=='manual')throw new Error('Unsafe redirect mode');
        return new Response(null,{status:302,headers:{location:'https://other.example/'}});
      },async()=>headers);
      return Response.json(result.metrics);
    }}
  `},bundle:true,write:false,format:'esm',platform:'browser'})
  const mf=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-07-09'})
  try{
    const response=await mf.dispatchFetch('http://localhost')
    assert.equal(response.status,200)
    const metrics=await response.json()
    assert.equal(metrics.zohoApi.current,100)
    assert.equal(metrics.zohoApi.limit,5000)
    assert.equal(metrics.totalD1.code,'provider_error')
    assert.equal(metrics.d1RowsRead.code,'provider_error')
  }finally{await mf.dispose()}
})
