"""Consistent daily SQLite backup. Retain 14 snapshots; no session tokens."""
import datetime
import json
import os
import pathlib
import sqlite3

os.umask(0o077)
with open('/etc/jianji/config.json') as file:
    config = json.load(file)
folder = pathlib.Path('/var/lib/jianji/backups')
folder.mkdir(exist_ok=True)
destination = folder / ('friends-' + datetime.date.today().isoformat() + '.sqlite3')
with sqlite3.connect('file:' + config['database'] + '?mode=ro', uri=True) as source, sqlite3.connect(destination) as target:
    if not source.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'").fetchone():
        raise RuntimeError('Database schema is not ready')
    source.backup(target)
    target.execute('DELETE FROM sessions')
    target.commit()
for obsolete in sorted(folder.glob('friends-*.sqlite3'))[:-14]:
    obsolete.unlink()
print('Daily database backup completed')
