#!/bin/bash
set -euo pipefail
test "$(id -u)" = 0
getent passwd jianji >/dev/null || useradd --system --home-dir /var/lib/jianji --shell /sbin/nologin jianji
install -d -m 0755 /opt/jianji
install -d -m 0750 -o jianji -g jianji /var/lib/jianji
install -d -m 0750 -o root -g jianji /etc/jianji
install -m 0644 app.py features.py backup.py /opt/jianji/
python3.11 - <<'PY'
import json, os, secrets
path='/etc/jianji/config.json'
if not os.path.exists(path):
    with open(path,'w') as f:
        json.dump({'database':'/var/lib/jianji/friends.sqlite3','enrollment':secrets.token_urlsafe(18),'maxUsers':20,
                   'origins':['https://localhost','capacitor://localhost','https://jianji-ledger.glassybetta.chatgpt.site','https://47.94.4.152']},f)
PY
chown root:jianji /etc/jianji/config.json
chmod 0640 /etc/jianji/config.json
cat > /etc/systemd/system/jianji.service <<'UNIT'
[Unit]
Description=Jianji private friends API
After=network.target
[Service]
User=jianji
Group=jianji
WorkingDirectory=/opt/jianji
ExecStart=/usr/bin/python3.11 /opt/jianji/app.py
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/jianji
MemoryMax=300M
TasksMax=64
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/jianji-backup.service <<'UNIT'
[Unit]
Description=Backup Jianji friends database
[Service]
Type=oneshot
User=jianji
Group=jianji
ExecStart=/usr/bin/python3.11 /opt/jianji/backup.py
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/jianji
UNIT
cat > /etc/systemd/system/jianji-backup.timer <<'UNIT'
[Unit]
Description=Daily Jianji database backup
[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now jianji jianji-backup.timer
systemctl restart jianji
for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:8787/health > /dev/null; then break; fi
  sleep 1
done
curl --fail --silent http://127.0.0.1:8787/health
systemctl start jianji-backup.service
printf '\nBackend ready; database is private and HTTPS exposure pending.\n'
