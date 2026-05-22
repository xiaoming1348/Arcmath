#!/usr/bin/env bash
# Arcmath HK VPS 一键初始化脚本
#
# 用法（在新开的 Ubuntu 22.04 VPS 上以 root 身份执行）：
#   curl -fsSL https://raw.githubusercontent.com/<your-org>/arcmath/main/deploy/hk-vps/bootstrap.sh | bash
#   或：
#   scp deploy/hk-vps/bootstrap.sh root@<vps-ip>:/root/
#   ssh root@<vps-ip> 'bash /root/bootstrap.sh'
#
# 这个脚本会幂等地完成 HK_VPS_DEPLOY.md 的步骤 1（系统初始化）。
# 步骤 2-5（拉代码、构建、nginx、certbot）见同目录其他脚本。

set -euo pipefail

DOMAIN="${DOMAIN:-arcscience.forecaster-ai.com}"
APP_USER="arcmath"

echo "==> [1/6] apt 升级 + 基础包"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git nginx ufw build-essential ca-certificates gnupg

echo "==> [2/6] Node 20 LTS"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pnpm@9 pm2

echo "==> [3/6] certbot (Let's Encrypt)"
apt-get install -y certbot python3-certbot-nginx

echo "==> [4/6] UFW 防火墙"
ufw allow OpenSSH || true
ufw allow 80      || true
ufw allow 443     || true
ufw --force enable

echo "==> [5/6] 建非 root 用户 ${APP_USER}"
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${APP_USER}"
  usermod -aG sudo "${APP_USER}"
fi
# 让 arcmath 不用密码就能 sudo
# 白名单覆盖：systemd、nginx、certbot、pm2 startup
NPN="/usr/bin/systemctl, /usr/sbin/nginx, /usr/bin/certbot, /usr/lib/node_modules/pm2/bin/pm2, /usr/bin/env"
echo "${APP_USER} ALL=(ALL) NOPASSWD: ${NPN}" > /etc/sudoers.d/${APP_USER}
chmod 0440 /etc/sudoers.d/${APP_USER}

# 把 root 的 ~/.ssh/authorized_keys 拷给 arcmath，这样同一把 key 能 SSH 进去
if [[ -f /root/.ssh/authorized_keys ]]; then
  mkdir -p /home/${APP_USER}/.ssh
  cp /root/.ssh/authorized_keys /home/${APP_USER}/.ssh/authorized_keys
  chmod 700 /home/${APP_USER}/.ssh
  chmod 600 /home/${APP_USER}/.ssh/authorized_keys
  chown -R ${APP_USER}:${APP_USER} /home/${APP_USER}/.ssh
fi

echo "==> [6/6] swap (build 内存保险，2GB)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

cat <<EOF

==============================================
✅ 系统初始化完成

下一步：
  1) 用 ${APP_USER} 用户 SSH 进来：
       ssh ${APP_USER}@<vps-ip>
  2) 拉代码 + 构建：
       git clone https://github.com/<your-org>/arcmath.git
       cd arcmath/apps/web
       cp .env.local.example .env.local  # 改完里面的 secrets
       NODE_OPTIONS="--max-old-space-size=6144" pnpm install --frozen-lockfile
       pnpm build
  3) 启动 PM2：
       cd ~/arcmath/apps/web
       pm2 start ../../deploy/hk-vps/ecosystem.config.cjs
       pm2 save
       pm2 startup   # 跟着提示再跑一次 sudo
  4) 配 nginx + HTTPS：
       sudo bash ~/arcmath/deploy/hk-vps/setup-nginx.sh
==============================================

域名占位：${DOMAIN}
（如要改，开 deploy/hk-vps/ 下脚本顶部的 DOMAIN 变量）
EOF
