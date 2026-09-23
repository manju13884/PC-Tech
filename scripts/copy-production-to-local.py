"""Explicit ONE-TIME PRODUCTION -> LOCAL copy. Never called by app/build/deployment.

The only remote command this utility can construct is `wrangler d1 export`.
All imports are staged in local SQLite and validated before local activation.
Python 3.12+, Node, and the project's installed Wrangler are required.
"""
import argparse
from contextlib import contextmanager, closing
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import sqlite3
import subprocess
import sys
import tomllib
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.local-logs' / 'production-to-local'
LOCAL_STATE = ROOT / '.wrangler' / 'state'
LOCAL_ID = '0d749a66-9654-4767-b56a-afd4f8bcd9a1'
PRODUCTION_ID = 'e863e5c3-b60f-48a5-8fdd-862f1ac52eaf'
EXCLUDED = {'sessions', 'password_setup_tokens', 'deployment_maintenance', 'd1_migrations', '_cf_METADATA', 'sqlite_sequence'}
AUTH_COLUMNS = {'password_hash', 'password_salt', 'session_version', 'must_change_password'}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def guarded_path(path, parent):
    path, parent = Path(path).absolute(), Path(parent).resolve()
    require(path.resolve().is_relative_to(parent) and path.resolve() != parent, 'Refusing path outside guarded local directory.')
    for part in [path, *path.parents]:
        if part == parent:
            break
        require(not part.is_symlink() and not part.is_junction(), 'Refusing a redirected local path.')
    return path.resolve()


def configuration():
    config = tomllib.loads((ROOT / 'wrangler.toml').read_text())
    local = config['d1_databases']
    source = config['env']['production']['d1_databases']
    require(len(local) == len(source) == 1, 'Ambiguous database bindings.')
    require(local[0]['database_id'] == LOCAL_ID and local[0]['database_name'] == 'pc-tech-db' and local[0]['binding'] == 'DB', 'Local binding changed. Review before copying.')
    require(source[0]['database_id'] == PRODUCTION_ID and source[0]['database_name'] == 'pc-tech-production-db', 'Production source changed. Review before exporting.')
    require(local[0]['database_id'] != source[0]['database_id'], 'Source and target must differ.')


def run(command, log, cwd=ROOT):
    # No shell, no caller-provided remote SQL, no credential values printed.
    result = subprocess.run(command, cwd=cwd, input='y\n', text=True, encoding='utf-8', errors='replace', capture_output=True, timeout=300)
    Path(log).write_text(result.stdout + result.stderr, encoding='utf-8')
    require(result.returncode == 0, f'Command failed; inspect private log {log}. No Production writes were issued.')


def wrangler_export(output):
    output = guarded_path(output, PRIVATE)
    return ['node', str(ROOT / 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'export',
            'pc-tech-production-db', '--remote', '--env', 'production', '--config', str(ROOT / 'wrangler.toml'), '--output', str(output)]


def wrangler_migrate(stage):
    stage = guarded_path(stage, PRIVATE)
    return ['node', str(ROOT / 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply',
            'pc-tech-db', '--local', '--config', str(ROOT / 'wrangler.toml'), '--persist-to', str(stage)]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def tables(db):
    return {row[0]: row[1] for row in db.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}


def columns(db, name):
    return {row[1]: row for row in db.execute(f'PRAGMA table_info({quote(name)})')}


def count(db, name):
    return db.execute(f'SELECT COUNT(*) FROM {quote(name)}').fetchone()[0]


@contextmanager
def readonly(path):
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    try:
        yield db
    finally:
        db.close()


def local_database(state):
    candidates = []
    for path in Path(state).glob('v3/d1/miniflare-D1DatabaseObject/*.sqlite'):
        if path.name == 'metadata.sqlite':
            continue
        with readonly(path) as db:
            if {'users', 'roles', 'd1_migrations'} <= tables(db).keys():
                candidates.append(path)
    require(len(candidates) == 1, 'Expected exactly one local PC-Tech D1 SQLite file; refusing ambiguous target.')
    return candidates[0]


def integrations():
    env_files = [ROOT / name for name in ['.dev.vars', '.env', '.env.local'] if (ROOT / name).exists()]
    variables = dict(os.environ)
    for path in env_files:
        for line in path.read_text(encoding='utf-8').splitlines():
            match = re.match(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$', line)
            if match:
                variables[match[1]] = match[2].strip('"\'')
    require(not variables.get('RESEND_API_KEY'), 'Local outbound email is configured. Disable it locally before copying; no configuration was changed.')
    writers = set()
    for folder in ['lib', 'functions']:
        for path in (ROOT / folder).rglob('*.ts'):
            source = path.read_text(encoding='utf-8')
            if re.search(r'\bfetch\s*\(', source):
                writers.add(path.relative_to(ROOT).as_posix())
    require(writers == {'lib/zoho.ts', 'functions/lib/email.ts'}, 'External integration entry points changed; review before copying.')
    zoho = (ROOT / 'lib/zoho.ts').read_text(encoding='utf-8')
    require(re.findall(r"method:\s*['\"]([A-Z]+)['\"]", zoho) == ['POST', 'GET'], 'Zoho integration verbs changed; review before copying.')
    require("zohoFetch(tokenUrl, {\n    method: 'POST'" in zoho.replace('\r\n', '\n'), 'Zoho POST must only refresh OAuth credentials.')
    return {str(path): sha(path) for path in env_files}


def check_integrity(db, label):
    require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', f'{label}: SQLite integrity check failed.')
    failures = [list(row) for row in db.execute('PRAGMA foreign_key_check')]
    require(not failures, f'{label}: foreign-key failures: {failures}')


def schema_compatible(source, stage):
    target_tables = tables(stage)
    for table in tables(source):
        if table in EXCLUDED:
            continue
        require(table in target_tables, f'Incompatible schema: local table missing: {table}')
        source_columns, target_columns = columns(source, table), columns(stage, table)
        for name, info in source_columns.items():
            require(name in target_columns, f'Incompatible schema: {table}.{name} missing locally.')
            other = target_columns[name]
            require((info[2], info[3], info[5]) == (other[2], other[3], other[5]), f'Incompatible column type/constraint: {table}.{name}')
            if re.search(r'password|secret|credential|(?:access|refresh|session)_token|token_hash', name, re.I):
                require(table == 'users' and name in AUTH_COLUMNS, f'Unreviewed sensitive column: {table}.{name}; refusing import.')
        for name, info in target_columns.items():
            require(name in source_columns or info[3] == 0 or info[4] is not None, f'Incompatible required new column: {table}.{name}')
    applied = {row[0] for row in stage.execute('SELECT name FROM d1_migrations')}
    require({row[0] for row in source.execute('SELECT name FROM d1_migrations')} <= applied, 'Production has migrations not available locally.')


def row_digest(db, table, names):
    # Sort row hashes to compare every value while keeping all row contents private.
    rows = []
    for row in db.execute(f'SELECT {",".join(quote(name) for name in names)} FROM {quote(table)}'):
        serialized = json.dumps(list(row), ensure_ascii=False, separators=(',', ':'), default=lambda value: {'blob': base64.b64encode(value).decode()})
        rows.append(hashlib.sha256(serialized.encode()).digest())
    return hashlib.sha256(b''.join(sorted(rows))).hexdigest()


def projections(db):
    fg = db.execute("SELECT COUNT(*),COALESCE(SUM(manufactured_quantity),0) FROM job_cards WHERE status='COMPLETED' AND manufactured_quantity>0").fetchone()
    return {
        'production_planning': count(db, 'production_plans'),
        'production_planned': db.execute("SELECT COUNT(*) FROM production_plans WHERE status='PLANNED' AND deleted_at IS NULL").fetchone()[0],
        'production_lines': count(db, 'production_plan_lines'),
        'job_cards': count(db, 'job_cards'), 'job_processes': count(db, 'job_card_process_entries'),
        'product_specifications': count(db, 'product_specification_records'),
        'inventory_materials': count(db, 'material_inventory_records'),
        'inventory_transactions': count(db, 'inventory_stock_ledger'),
        'fg_completed_jobs': fg[0], 'fg_manufactured_quantity': fg[1],
        'users': count(db, 'users'), 'roles': count(db, 'roles'), 'permissions': count(db, 'role_menu_permissions'),
    }


def validate(source, target, admins):
    check_integrity(target, 'Local copy')
    results = []
    for table in sorted(tables(source)):
        if table in EXCLUDED:
            continue
        names = [name for name in columns(source, table) if table != 'users' or name not in AUTH_COLUMNS]
        same = row_digest(source, table, names) == row_digest(target, table, names)
        require(same, f'Validation failed: {table} values differ (excluding explicit local auth reset).')
        results.append({'table': table, 'source': count(source, table), 'local': count(target, table), 'values_match': same})
    require(projections(source) == projections(target), 'Major report counts or FG quantities differ.')
    for name in ['sessions', 'password_setup_tokens']:
        require(count(target, name) == 0, f'Authentication records survived import: {name}')
    for admin in admins:
        match = target.execute('SELECT password_hash,password_salt FROM users WHERE lower(email)=lower(?)', (admin['email'],)).fetchone()
        require(match and match[0] == admin['password_hash'] and match[1] == admin['password_salt'], 'Local administrator credentials were not preserved.')
    for row in target.execute('SELECT email,password_hash,password_salt FROM users'):
        if row['email'].lower() not in {admin['email'].lower() for admin in admins}:
            original = source.execute('SELECT password_hash,password_salt FROM users WHERE email=?', (row['email'],)).fetchone()
            require((row[1], row[2]) != (original[0], original[1]), 'Production password credentials survived local import.')
    relationships = {
        'job_to_planned_line': 'SELECT COUNT(*) FROM job_cards c LEFT JOIN production_plan_lines l ON l.id=c.production_plan_line_id WHERE l.id IS NULL',
        'planned_line_to_so_customer_item': "SELECT COUNT(*) FROM production_plan_lines WHERE COALESCE(zoho_sales_order_id,'')='' OR COALESCE(zoho_customer_id,'')='' OR COALESCE(zoho_item_id,'')=''",
        'process_to_job': 'SELECT COUNT(*) FROM job_card_process_entries p LEFT JOIN job_cards c ON c.id=p.job_card_id WHERE c.id IS NULL',
        'reservation_process_job': 'SELECT COUNT(*) FROM inventory_reel_reservations r JOIN job_card_process_entries p ON p.id=r.process_entry_id WHERE r.job_card_id<>p.job_card_id OR r.process_name<>p.process_name',
        'consumption_process_job': 'SELECT COUNT(*) FROM job_tracking_reel_consumptions r JOIN job_card_process_entries p ON p.id=r.process_entry_id WHERE r.job_card_id<>p.job_card_id OR r.process_name<>p.process_name',
    }
    for label, sql in relationships.items():
        require(target.execute(sql).fetchone()[0] == 0, f'Relationship check failed: {label}')
    require(target.execute('SELECT active,token_hash FROM deployment_maintenance WHERE id=1').fetchone()[:] == (0, ''), 'Local maintenance state is unsafe.')
    return {'tables': results, 'tables_imported': len(results), 'records_imported': sum(row['local'] for row in results),
            'major_counts': projections(target), 'relationships': {name: 'PASSED' for name in relationships}, 'foreign_keys': 'PASSED', 'integrity': 'PASSED'}


def backend_stopped():
    for port in range(8788, 8799):
        with socket.socket() as client:
            client.settimeout(0.25)
            require(client.connect_ex(('127.0.0.1', port)) != 0, f'Stop local backend on port {port} before activation. Staged data and backups are retained.')


def restore_local(report_path, run_dir):
    prior = json.loads(guarded_path(report_path, PRIVATE).read_text())
    backup = guarded_path(prior['local_backup'], PRIVATE)
    require(sha(backup) == prior['local_backup_sha256'], 'Previous-local backup checksum does not match.')
    with readonly(backup) as db:
        check_integrity(db, 'Previous local backup')
        require({'users', 'roles', 'd1_migrations'} <= tables(db).keys(), 'Not a PC-Tech local backup.')
    backend_stopped()
    target = guarded_path(local_database(LOCAL_STATE), LOCAL_STATE)
    with closing(sqlite3.connect(target)) as current:
        with closing(sqlite3.connect(run_dir / 'before-restore.sqlite')) as safety:
            current.backup(safety)
        require(current.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone()[0] == 0, 'Active local DB is busy.')
    replacement = guarded_path(target.with_suffix('.replacement.sqlite'), LOCAL_STATE)
    shutil.copy2(backup, replacement)
    os.replace(replacement, target)
    for suffix in ['-wal', '-shm']:
        sidecar = guarded_path(Path(str(target) + suffix), LOCAL_STATE)
        if sidecar.exists():
            sidecar.unlink()
    with readonly(target) as restored:
        check_integrity(restored, 'Restored local database')
    return {'validation': 'PASSED', 'mode': 'RESTORED PREVIOUS LOCAL', 'restored_from': str(backup)}


def prepare_snapshot(args, run_dir):
    if args.snapshot:
        snapshot = guarded_path(args.snapshot, PRIVATE)
    else:
        snapshot = PRIVATE / ('pc-tech-production-backup-' + datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S') + '.sql')
        require(not snapshot.exists(), 'Backup filename already exists.')
        run(wrangler_export(snapshot), run_dir / 'export.log')
        snapshot.with_suffix('.manifest.json').write_text(json.dumps({'source_database': 'pc-tech-production-db', 'source_database_id': PRODUCTION_ID, 'direction': 'PRODUCTION_TO_LOCAL', 'exported_at': datetime.now(timezone.utc).isoformat(), 'sha256': sha(snapshot), 'size': snapshot.stat().st_size}, indent=2))
    manifest = json.loads(snapshot.with_suffix('.manifest.json').read_text())
    require(manifest['source_database_id'] == PRODUCTION_ID and manifest['source_database'] == 'pc-tech-production-db' and manifest['direction'] == 'PRODUCTION_TO_LOCAL', 'Snapshot source is ambiguous.')
    require(snapshot.stat().st_size > 0 and snapshot.stat().st_size == manifest['size'] and sha(snapshot) == manifest['sha256'], 'Production export verification failed.')
    print('Production backup checksum verified:', snapshot.name)
    return snapshot, manifest


def main():
    parser = argparse.ArgumentParser(description='ONE-TIME PRODUCTION -> LOCAL DATA COPY')
    parser.add_argument('--confirm-production-to-local', action='store_true')
    parser.add_argument('--environment', choices=['LOCAL'], required=True)
    parser.add_argument('--snapshot', help='Existing verified SQL export under .local-logs/production-to-local, with .manifest.json sidecar')
    parser.add_argument('--export-only', action='store_true')
    parser.add_argument('--stage-only', action='store_true', help='Validate without replacing active local data')
    parser.add_argument('--validate-local', action='store_true', help='Read-only validation of the active local copy against the snapshot')
    parser.add_argument('--restore-from-report', help='Restore previous LOCAL backup recorded in a private run report; never contacts Production')
    args = parser.parse_args()
    target_mode = 'READ-ONLY VALIDATION' if args.validate_local else 'UNCHANGED; STAGING/EXPORT ONLY' if args.stage_only or args.export_only else 'WILL BE REPLACED'
    print(f'ONE-TIME PRODUCTION -> LOCAL DATA COPY\nSOURCE: pc-tech-production-db [READ ONLY]\nTARGET: .wrangler/state local pc-tech-db [{target_mode}]')
    require(args.confirm_production_to_local and args.environment == 'LOCAL', 'ABORT: explicit --confirm-production-to-local and --environment LOCAL are required.')
    require(not args.restore_from_report or not (args.snapshot or args.export_only or args.stage_only or args.validate_local), 'Restore cannot be combined with export/import modes.')
    configuration()
    PRIVATE.mkdir(parents=True, exist_ok=True)
    require(not PRIVATE.is_symlink() and not PRIVATE.is_junction(), 'Private backup directory must not be redirected.')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    run_dir = guarded_path(PRIVATE / ('run-' + stamp), PRIVATE)
    run_dir.mkdir(mode=0o700)
    report = {'production': 'READ ONLY / UNCHANGED BY THIS UTILITY', 'validation': 'FAILED', 'activated': False}
    source = stage = None
    try:
        if args.restore_from_report:
            report.update(restore_local(args.restore_from_report, run_dir))
            print('Previous local database restored. Production was not contacted.')
            return
        snapshot, manifest = prepare_snapshot(args, run_dir)
        report.update({'snapshot': str(snapshot), 'source_manifest': manifest})
        if args.export_only:
            report['validation'] = 'PASSED'
            report['mode'] = 'READ-ONLY EXPORT'
            print('Read-only backup complete. No local data changed.')
            return
        env_hashes = integrations()
        run(['node', 'scripts/audit-d1-migrations.mjs'], run_dir / 'migration-audit.log')
        source = sqlite3.connect(':memory:')
        source.row_factory = sqlite3.Row
        # Never allow a SQL dump to attach files or escape this in-memory restore.
        source.set_authorizer(lambda action, p1, p2, database, trigger: sqlite3.SQLITE_DENY if action in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH) else sqlite3.SQLITE_OK)
        source.executescript(snapshot.read_text(encoding='utf-8'))
        source.execute('PRAGMA query_only=ON')
        check_integrity(source, 'Production export')
        local_file = guarded_path(local_database(LOCAL_STATE), LOCAL_STATE)
        with readonly(local_file) as old:
            admins = [dict(row) for row in old.execute("SELECT u.* FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='SUPERADMIN' AND r.is_active=1 AND u.status='ACTIVE'")]
            require(admins, 'No existing local SuperAdmin credentials to preserve. Set up a local account before importing.')
            for admin in admins:
                match = source.execute("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE lower(u.email)=lower(?) AND r.name='SUPERADMIN' AND u.status='ACTIVE' AND r.is_active=1", (admin['email'],)).fetchone()
                require(match is not None, 'A local SuperAdmin has no matching active Production SuperAdmin. Stop for an explicit account mapping.')
            if args.validate_local:
                schema_compatible(source, old)
                report.update(validate(source, old, admins))
                report['validation'] = 'PASSED'
                report['mode'] = 'READ-ONLY VALIDATION'
                print('Active local copy validation PASSED. No local or Production writes.')
                return
            local_backup = run_dir / 'local-before.sqlite'
            with closing(sqlite3.connect(local_backup)) as backup:
                old.backup(backup)
        report['local_backup'] = str(local_backup)
        report['local_backup_sha256'] = sha(local_backup)
        stage_state = run_dir / 'stage'
        print('Initializing staged LOCAL schema using the existing Wrangler migrations...')
        run(wrangler_migrate(stage_state), run_dir / 'local-migrations.log')
        stage_file = guarded_path(local_database(stage_state), run_dir)
        require(stage_file.name == local_file.name, 'Wrangler staged file does not match local binding identity.')
        stage = sqlite3.connect(stage_file)
        stage.row_factory = sqlite3.Row
        schema_compatible(source, stage)
        report['source_migrations'] = count(source, 'd1_migrations')
        report['local_migrations'] = count(stage, 'd1_migrations')
        report['local_only_tables'] = sorted(tables(stage).keys() - tables(source).keys())
        print('Schema compatible. Copying into staging; active local database is unchanged.')
        stage.execute('PRAGMA foreign_keys=OFF')
        stage.execute('BEGIN IMMEDIATE')
        triggers = stage.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger'").fetchall()
        # Historical inventory transactions must NOT re-run consumption triggers.
        for name, sql in triggers:
            stage.execute(f'DROP TRIGGER {quote(name)}')
        for table in tables(stage):
            if table not in {'d1_migrations', '_cf_METADATA'}:
                stage.execute(f'DELETE FROM {quote(table)}')
        for table in tables(source):
            if table in EXCLUDED:
                continue
            names = list(columns(source, table))
            values = [list(row) for row in source.execute(f'SELECT {",".join(quote(name) for name in names)} FROM {quote(table)}')]
            if table == 'users':
                for row in values:
                    row[names.index('password_hash')] = base64.b64encode(secrets.token_bytes(32)).decode()
                    row[names.index('password_salt')] = base64.b64encode(secrets.token_bytes(16)).decode()
                    row[names.index('session_version')] += 1
                    row[names.index('must_change_password')] = 1
            stage.executemany(f'INSERT INTO {quote(table)} ({",".join(quote(name) for name in names)}) VALUES ({",".join("?" for _ in names)})', values)
        for admin in admins:
            stage.execute('UPDATE users SET password_hash=?,password_salt=?,must_change_password=? WHERE lower(email)=lower(?)', (admin['password_hash'], admin['password_salt'], admin['must_change_password'], admin['email']))
        for row in source.execute('SELECT name,seq FROM sqlite_sequence'):
            if row['name'] in EXCLUDED:
                continue
            stage.execute('UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name=?', (row['seq'], row['name']))
            stage.execute('INSERT INTO sqlite_sequence(name,seq) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name=?)', (row['name'], row['seq'], row['name']))
        # This runtime control table is defined by deployment tooling, not a migration.
        # Reuse its exported schema without importing the Production maintenance token.
        require('deployment_maintenance' in tables(source), 'Missing maintenance schema.')
        if 'deployment_maintenance' not in tables(stage):
            stage.execute(tables(source)['deployment_maintenance'])
        stage.execute('INSERT INTO deployment_maintenance(id,active,owner,token_hash,commit_sha,updated_at) VALUES(1,0,?,?,?,?)', ('LOCAL-SNAPSHOT', '', 'local', datetime.now(timezone.utc).isoformat()))
        for name, sql in triggers:
            stage.execute(sql)
        require({row[0] for row in stage.execute("SELECT name FROM sqlite_master WHERE type='trigger'")} == {row[0] for row in triggers}, 'Inventory triggers were not fully restored.')
        stage.commit()
        stage.execute('PRAGMA foreign_keys=ON')
        report.update(validate(source, stage, admins))
        report['excluded'] = {name: count(source, name) for name in ['sessions', 'password_setup_tokens', 'deployment_maintenance']}
        report['preserved_local_admins'] = [admin['email'] for admin in admins]
        report['auth'] = 'Production sessions/setup tokens excluded; other Production passwords randomized; existing local SuperAdmin hashes retained.'
        report['environment_files_unchanged'] = all(sha(path) == value for path, value in env_hashes.items())
        require(report['environment_files_unchanged'], 'Local environment configuration changed during import.')
        report['validation'] = 'PASSED'
        stage.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        stage.close()
        stage = None
        if not args.stage_only:
            backend_stopped()
            # The active file is the ONLY replacement target, not a directory or remote binding.
            local_file = guarded_path(local_file, LOCAL_STATE)
            with closing(sqlite3.connect(local_file)) as active:
                require(active.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone()[0] == 0, 'Active local DB is busy.')
                active.execute('BEGIN EXCLUSIVE')
                active.rollback()
            replacement = guarded_path(local_file.with_suffix('.replacement.sqlite'), LOCAL_STATE)
            shutil.copy2(stage_file, replacement)
            os.replace(replacement, local_file)
            for suffix in ['-wal', '-shm']:
                sidecar = guarded_path(Path(str(local_file) + suffix), LOCAL_STATE)
                if sidecar.exists():
                    sidecar.unlink()
            try:
                with readonly(local_file) as installed:
                    validate(source, installed, admins)
            except Exception:
                shutil.copy2(local_backup, replacement)
                os.replace(replacement, local_file)
                raise RuntimeError('Installed validation failed; previous local database restored.')
            report['activated'] = True
        print(f'Validation PASSED: {report["tables_imported"]} tables, {report["records_imported"]} records.')
        print('Production: READ ONLY / UNCHANGED BY THIS UTILITY')
        print('Local: ' + ('Imported successfully' if report['activated'] else 'Staged and validated; active local data unchanged'))
        print('Existing local SuperAdmin login(s) retained:', ', '.join(report['preserved_local_admins']))
    except Exception as error:
        report['validation'] = 'FAILED'
        report['error'] = str(error)
        raise
    finally:
        if stage:
            stage.close()
        if source:
            source.close()
        (run_dir / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print('Private validation report:', run_dir / 'report.json')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('ABORT:', error, file=sys.stderr)
        sys.exit(1)
