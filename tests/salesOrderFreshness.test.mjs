import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

test('sales-order API opts into fresh list and detail reads without changing default caching',async()=>{
 const calls=[]; const exports={};
 const imports={
  '../../lib/salesOrders':{getZohoSalesOrderById:async()=>({salesorder_id:'1'}),getZohoSalesOrdersByCustomer:async()=>[]},
  '../../lib/salesOrderCache':{cachedSalesOrder:async(env,id,load,fresh)=>{calls.push(['detail',fresh]);return load()},cachedCustomerSalesOrders:async(env,id,load,fresh)=>{calls.push(['list',fresh]);return load()}},
  '../../lib/zoho':{ZohoRequestError:class extends Error{}}
 };
 runInNewContext(ts.transpileModule(readFileSync('functions/api/sales-orders.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Response,URL,console,require:name=>{assert.ok(imports[name]);return imports[name]}});
 for(const query of ['customer_id=c1','customer_id=c1&refresh=true','salesorder_id=1','salesorder_id=1&refresh=true']){
  const response=await exports.onRequestGet({request:new Request('https://example.com/api/sales-orders?'+query),env:{}});
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
 }
 assert.deepEqual(calls,[['list',false],['list',true],['detail',false],['detail',true]]);
});
