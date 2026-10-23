"""Compare production exports offline without printing row contents."""
import hashlib
import json
import sqlite3
import sys
from pathlib import Path


def load(path):
    db = sqlite3.connect(':memory:')
    db.set_authorizer(lambda action, *args: sqlite3.SQLITE_DENY if action in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH) else sqlite3.SQLITE_OK)
    db.executescript(Path(path).read_text(encoding='utf-8'))
    db.execute('PRAGMA query_only=ON')
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'Integrity check failed'
    assert not db.execute('PRAGMA foreign_key_check').fetchall(), 'Foreign key check failed'
    return db


def digest(db, table, columns):
    fields = ','.join('"' + c.replace('"', '""') + '"' for c in columns)
    name = '"' + table.replace('"', '""') + '"'
    hashes = [hashlib.sha256(json.dumps(row, ensure_ascii=False, default=lambda b: {'blob': b.hex()}, separators=(',', ':')).encode()).digest() for row in db.execute(f'SELECT {fields} FROM {name}')]
    return len(hashes), hashlib.sha256(b''.join(sorted(hashes))).hexdigest()


def compare(before, after):
    checked = 0
    excluded = {'d1_migrations', '_cf_METADATA', 'deployment_maintenance', 'sqlite_sequence'}
    for (table,) in before.execute("SELECT name FROM sqlite_master WHERE type='table'"):
        if table in excluded:
            continue
        columns = [r[1] for r in before.execute('PRAGMA table_xinfo("' + table.replace('"', '""') + '")')]
        assert digest(before, table, columns) == digest(after, table, columns), f'Existing data changed: {table}'
        checked += 1
    for name, seq in before.execute('SELECT name,seq FROM sqlite_sequence'):
        if name in excluded:
            continue
        row = after.execute('SELECT seq FROM sqlite_sequence WHERE name=?', (name,)).fetchone()
        assert row and row[0] >= seq, f'Sequence regressed: {name}'
    print(f'PASSED: all values in {checked} existing tables preserved; integrity, foreign keys and ID sequences verified.')


if __name__ == '__main__':
    with load(sys.argv[1]) as before, load(sys.argv[2]) as after:
        compare(before, after)
