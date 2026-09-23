import importlib.util
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('copy_local', ROOT / 'scripts/copy-production-to-local.py')
utility = importlib.util.module_from_spec(spec)
spec.loader.exec_module(utility)


class ProductionToLocalSafety(unittest.TestCase):
    def test_explicit_confirmation_is_required_before_any_work(self):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/copy-production-to-local.py'), '--environment', 'LOCAL'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('explicit --confirm-production-to-local', result.stderr)

    def test_production_environment_is_refused(self):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/copy-production-to-local.py'), '--environment', 'production', '--confirm-production-to-local'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('invalid choice', result.stderr)

    def test_only_remote_command_is_export(self):
        command = utility.wrangler_export(utility.PRIVATE / 'test.sql')
        self.assertEqual(command[2:5], ['d1', 'export', 'pc-tech-production-db'])
        self.assertIn('--remote', command)
        for denied in ['execute', 'migrations', '--command', '--file']:
            self.assertNotIn(denied, command)
        local = utility.wrangler_migrate(utility.PRIVATE / 'test-stage')
        self.assertIn('--local', local)
        self.assertNotIn('--remote', local)
        self.assertNotIn('production', local)
        self.assertNotIn('pc-tech-production-db', local)

    def test_paths_outside_local_roots_are_refused(self):
        with self.assertRaises(RuntimeError):
            utility.guarded_path(ROOT / 'wrangler.toml', utility.LOCAL_STATE)
        with self.assertRaises(RuntimeError):
            utility.wrangler_export(ROOT / 'backup.sql')
        with self.assertRaises(RuntimeError):
            utility.guarded_path(utility.LOCAL_STATE, utility.LOCAL_STATE)

    def test_actual_config_source_and_target_are_distinct(self):
        utility.configuration()

    def test_row_comparison_detects_changed_inventory_values_not_only_counts(self):
        with sqlite3.connect(':memory:') as source, sqlite3.connect(':memory:') as target:
            for db in [source, target]:
                db.executescript('CREATE TABLE stock(id INTEGER PRIMARY KEY,quantity REAL); INSERT INTO stock VALUES(1,100);')
            self.assertEqual(utility.row_digest(source, 'stock', ['id','quantity']), utility.row_digest(target, 'stock', ['id','quantity']))
            target.execute('UPDATE stock SET quantity=99')
            self.assertNotEqual(utility.row_digest(source, 'stock', ['id','quantity']), utility.row_digest(target, 'stock', ['id','quantity']))

    def test_foreign_key_orphans_are_reported(self):
        with sqlite3.connect(':memory:') as db:
            db.executescript('CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id REFERENCES parent(id)); INSERT INTO child VALUES(123);')
            with self.assertRaisesRegex(RuntimeError, 'foreign-key failures'):
                utility.check_integrity(db, 'fixture')

    def test_unknown_or_required_incompatible_schema_stops_import(self):
        with sqlite3.connect(':memory:') as source, sqlite3.connect(':memory:') as target:
            source.executescript('CREATE TABLE stock(id INTEGER PRIMARY KEY,qty REAL);')
            target.executescript('CREATE TABLE stock(id INTEGER PRIMARY KEY,qty TEXT);')
            with self.assertRaisesRegex(RuntimeError, 'Incompatible column'):
                utility.schema_compatible(source, target)

    def test_current_local_integrations_have_no_external_business_write(self):
        self.assertIn(str(ROOT / '.dev.vars'), utility.integrations())


if __name__ == '__main__':
    unittest.main()
