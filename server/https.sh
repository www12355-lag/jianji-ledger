#!/bin/bash
set -euo pipefail
install -d -m 0755 /var/www/jianji-acme
cat > /etc/nginx/conf.d/jianji.conf <<'NGINX'
limit_req_zone $binary_remote_addr zone=jianji:10m rate=5r/s;
limit_conn_zone $binary_remote_addr zone=jianji_conn:10m;
map $http_origin $jianji_origin {
  default "";
  "https://localhost" "https://localhost";
  "capacitor://localhost" "capacitor://localhost";
  "https://jianji-ledger.glassybetta.chatgpt.site" "https://jianji-ledger.glassybetta.chatgpt.site";
  "https://47.94.4.152" "https://47.94.4.152";
}
server {
  listen 80;
  server_name 47.94.4.152;
  access_log off;
  location /.well-known/acme-challenge/ { root /var/www/jianji-acme; }
  location / { return 404; }
}
NGINX
nginx -t
systemctl enable --now nginx
systemctl reload nginx
/opt/jianji-certbot/bin/certbot certonly --non-interactive --agree-tos --register-unsafely-without-email --preferred-profile shortlived --webroot --webroot-path /var/www/jianji-acme --ip-address 47.94.4.152 --cert-name jianji-ip
cat >> /etc/nginx/conf.d/jianji.conf <<'NGINX'
server {
  listen 443 ssl;
  server_name 47.94.4.152;
  ssl_certificate /etc/letsencrypt/live/jianji-ip/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/jianji-ip/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_session_tickets off;
  access_log off;
  client_max_body_size 32k;
  client_body_timeout 10s;
  add_header Strict-Transport-Security "max-age=31536000" always;
  add_header X-Content-Type-Options nosniff always;
  limit_req_status 429;
  limit_conn_status 429;
  error_page 429 = @jianji_throttle;
  location @jianji_throttle {
    default_type application/json;
    add_header Access-Control-Allow-Origin $jianji_origin always;
    add_header Vary Origin always;
    add_header Cache-Control no-store always;
    return 429 '{"error":"操作较频繁，请稍后再试"}';
  }
  location = /v1/cloud {
    client_max_body_size 21m;
    client_body_timeout 90s;
    limit_req zone=jianji burst=30 nodelay;
    limit_conn jianji_conn 2;
    proxy_request_buffering off;
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_connect_timeout 3s;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
  }
  location = /v1/cloud/content {
    limit_req zone=jianji burst=30 nodelay;
    limit_conn jianji_conn 2;
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 120s;
  }
  location / {
    limit_req zone=jianji burst=30 nodelay;
    limit_conn jianji_conn 20;
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_connect_timeout 3s;
    proxy_read_timeout 20s;
  }
}
NGINX
nginx -t
systemctl reload nginx
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\n/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/jianji-nginx
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/jianji-nginx
cat > /etc/systemd/system/jianji-certbot.service <<'UNIT'
[Unit]
Description=Renew Jianji IP HTTPS certificate
[Service]
Type=oneshot
ExecStart=/opt/jianji-certbot/bin/certbot renew --quiet
UNIT
cat > /etc/systemd/system/jianji-certbot.timer <<'UNIT'
[Unit]
Description=Check Jianji certificate twice daily
[Timer]
OnCalendar=*-*-* 00,12:30:00
RandomizedDelaySec=1800
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now jianji-certbot.timer
curl --fail --silent https://47.94.4.152/health
printf '\nHTTPS ready; renewal timer enabled.\n'
