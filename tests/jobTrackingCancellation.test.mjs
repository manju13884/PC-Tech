import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)){
    const candidate=new URL(`${specifier}.ts`,context.parentURL)
    if(existsSync(candidate))return next(candidate.href,context)
  }
  return next(specifier,context)
}})
const {jobTrackingCancellationStatements}=await import('../functions/lib/jobTrackingCancellation.ts')
const user={id:1,fullName:'Supervisor',email:'supervisor@example.test',roleId:1,roleName:'PRODUCTION'}
function fixture(){
  const sqlite=new DatabaseSync(':memory:')
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1);
    CREATE TABLE production_plans(id INTEGER PRIMARY KEY,closure_status TEXT,closed_at TEXT,updated_at TEXT);
    INSERT INTO production_plans VALUES(1,'CLOSED','2026-10-21','2026-10-21');
    CREATE TABLE production_plan_lines(id INTEGER PRIMARY KEY,production_plan_id INTEGER);
    INSERT INTO production_plan_lines VALUES(1,1);
    CREATE TABLE job_cards(id INTEGER PRIMARY KEY,job_number TEXT,status TEXT,manufactured_quantity REAL,production_plan_line_id INTEGER,updated_at TEXT,notes TEXT);
    INSERT INTO job_cards VALUES(1,'JC-001','IN_PROGRESS',0,1,'2026-10-21','Preserve card metadata');
    CREATE TABLE job_card_process_entries(id INTEGER PRIMARY KEY,job_card_id INTEGER REFERENCES job_cards(id),process_status TEXT,out_quantity REAL,out_quantity_2 REAL,employee_name TEXT,custom_note TEXT);
    INSERT INTO job_card_process_entries VALUES(1,1,'IN_PROGRESS',0,0,'Employee','Preserve this extra column too');
    CREATE TABLE inventory_reel_reservations(id INTEGER PRIMARY KEY,job_card_id INTEGER,process_entry_id INTEGER REFERENCES job_card_process_entries(id),status TEXT,release_reason TEXT);
    INSERT INTO inventory_reel_reservations VALUES(1,1,1,'ACTIVE',NULL),(2,1,1,'RELEASED','REEL_CHANGED');
    CREATE TABLE job_tracking_reel_consumptions(id INTEGER PRIMARY KEY,job_card_id INTEGER);
    CREATE TABLE job_card_status_history(job_card_id INTEGER,job_number TEXT,previous_status TEXT,new_status TEXT,reason TEXT,changed_by_user_id INTEGER,changed_by_name TEXT);`)
  sqlite.exec(readFileSync('migrations/0068_preserve_job_tracking_cancellation_details.sql','utf8'))
  const db={prepare(sql){let values=[];return {
    bind(...args){values=args;return this},
    async all(){return {success:true,results:sqlite.prepare(sql).all(...values)}},
    async run(){const result=sqlite.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}}},
  }},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}}
  return {sqlite,db,statements:()=>jobTrackingCancellationStatements(db,1,user,{job_number:'JC-001',status:'IN_PROGRESS',production_plan_id:1})}
}

test('cancellation archives every working field and reservation history before returning the job to Job Cards',async()=>{
  const f=fixture()
  const original=f.sqlite.prepare('SELECT * FROM job_cards WHERE id=1').get()
  const results=await f.db.batch(await f.statements())
  assert.equal(results[0].meta.changes,1)
  assert.equal(results[4].meta.changes,1)
  const snapshot=f.sqlite.prepare('SELECT * FROM job_tracking_cancellation_snapshots').get()
  assert.deepEqual(JSON.parse(snapshot.job_card_json),{...original})
  assert.equal(JSON.parse(snapshot.process_entries_json)[0].custom_note,'Preserve this extra column too')
  assert.deepEqual(JSON.parse(snapshot.reel_reservations_json).map(row=>row.status),['ACTIVE','RELEASED'])
  assert.equal(JSON.parse(snapshot.reel_reservations_json)[1].release_reason,'REEL_CHANGED')
  assert.equal(snapshot.release_reason,'JOB_CANCELLED')
  assert.equal(snapshot.cancelled_by_user_id,user.id)
  assert.equal(f.sqlite.prepare('SELECT status FROM job_cards WHERE id=1').get().status,'CREATED')
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM job_card_process_entries').get().n,0)
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_reel_reservations').get().n,0)
  assert.equal(f.sqlite.prepare('SELECT closure_status FROM production_plans').get().closure_status,'OPEN')
  assert.equal(f.sqlite.prepare('SELECT new_status FROM job_card_status_history').get().new_status,'CANCELLED')
  assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[])
  f.sqlite.close()
})

test('cancellation rechecks production transactions and status inside the atomic batch',async()=>{
  for(const mutation of [
    "UPDATE job_cards SET manufactured_quantity=1 WHERE id=1",
    "UPDATE job_cards SET status='COMPLETED' WHERE id=1",
    "UPDATE job_cards SET status='CREATED' WHERE id=1",
    "UPDATE job_card_process_entries SET process_status='COMPLETED' WHERE id=1",
    "UPDATE job_card_process_entries SET out_quantity_2=1 WHERE id=1",
    "INSERT INTO job_tracking_reel_consumptions VALUES(1,1)",
  ]){
    const f=fixture(),statements=await f.statements()
    f.sqlite.exec(mutation)
    const results=await f.db.batch(statements)
    assert.ok(results.every(result=>result.meta.changes===0),mutation)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_reel_reservations').get().n,2)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM job_card_process_entries').get().n,1)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM job_tracking_cancellation_snapshots').get().n,0)
    f.sqlite.close()
  }
})

test('audit failure rolls back snapshots, cleanup and job status together',async()=>{
  const f=fixture()
  f.sqlite.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON job_card_status_history BEGIN SELECT RAISE(ABORT,'audit failure'); END")
  const statements=await f.statements()
  await assert.rejects(()=>f.db.batch(statements),/audit failure/)
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_reel_reservations').get().n,2)
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM job_card_process_entries').get().n,1)
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM job_tracking_cancellation_snapshots').get().n,0)
  assert.equal(f.sqlite.prepare('SELECT status FROM job_cards').get().status,'IN_PROGRESS')
  f.sqlite.close()
})
