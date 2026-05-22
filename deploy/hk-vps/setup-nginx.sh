#!/usr/bin/env bash
# Arcmath HK VPS — nginx 反向代理 + HTTPS 自动签发
#
# 用 sudo 跑。会：
#   1. 写 /etc/nginx/sites-available/arcmath (HTTP only, certbot 验证用)
#   2. 启用 site，nginx -t && reload
#   3. 用 certbot 签 Let's Encrypt 证书，自动改 nginx 加 HTTPS server block
#   4. 替换 nginx config 为完整的 HTTPS + rate-limit + Next.js 反代版本

set -euo pipefail

DOMAIN="${DOMAIN:-arcscience.forecaster-ai.com}"
EMAIL="${EMAIL:-yimingsun@berkeley.edu}"

if [[ $EUID -ne 0 ]]; then
  echo "请用 sudo 跑：sudo bash $0"
  exit 1
fi

echo "==> [1/4] 先写一个最小 HTTP-only config 让 certbot 跑得通"
mkdir -p /var/www/certbot
cat > /etc/nginx/sites-available/arcmath <<NGX
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # certbot 拿证书之前，所有流量先回到 Next.js（避免 502）
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGX

ln -sf /etc/nginx/sites-available/arcmath /etc/nginx/sites-enabled/arcmath
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> [2/4] certbot 签证书 (Let's Encrypt)"
certbot --nginx \
  -d "${DOMAIN}" \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --redirect

echo "==> [3/4] 覆盖成完整生产 nginx config（HTTPS + rate-limit + 静态缓存 + 90s 超时）"

# 注意：rate-limit zone 必须在 http {} 顶层，不能放 server {} 里。
# 这里写到 conf.d/ 里。
cat > /etc/nginx/conf.d/arcmath-zones.conf <<'ZNS'
# 单 IP 限速：100 req/s，burst 200
limit_req_zone $binary_remote_addr zone=arcmath_app:10m rate=100r/s;
ZNS

cat > /etc/nginx/sites-available/arcmath <<NGX
# HTTP -> HTTPS
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS main
server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # ====== 全局限制 ======
    client_max_body_size 10M;
    limit_req zone=arcmath_app burst=200 nodelay;

    # ====== gzip ======
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        application/javascript
        application/json
        application/xml
        text/css
        text/plain
        text/xml
        image/svg+xml;

    # ====== Next.js 静态资源走长缓存 ======
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # ====== Next.js 所有其它请求 ======
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # 证明题批改可能要 30-60s，留够 buffer
        proxy_read_timeout  120s;
        proxy_send_timeout  120s;
        proxy_connect_timeout 10s;
    }
}
NGX

nginx -t
systemctl reload nginx

echo "==> [4/4] 检查 certbot 自动续期 timer"
systemctl status certbot.timer --no-pager || true

cat <<EOF

==============================================
✅ nginx + HTTPS 完成

访问测试：
  curl -I https://${DOMAIN}/

如果返回 200 / 302（Next.js 的登录跳转），说明全链路通了。

下一步：
  - 改 DNS：把 A 记录指向这台 VPS 的公网 IP
    旧值：<Vercel IP> →  新值：\$(curl -s ifconfig.me)
  - 改 .env.local：NEXTAUTH_URL=https://${DOMAIN}
    然后 pm2 reload arcmath-web
  - 上 ping.chinaz.com 测国内访问
==============================================
EOF
