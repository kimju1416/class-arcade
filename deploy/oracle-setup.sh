#!/usr/bin/env bash
# Class Arcade — Oracle Cloud(Ubuntu) 한 방 설치 스크립트
#
# 쓰는 법 (VM에 접속한 뒤):
#   curl -fsSL https://raw.githubusercontent.com/kimju1416/class-arcade/main/deploy/oracle-setup.sh -o setup.sh
#   sudo bash setup.sh game2.kimju.kr
#
# 인자: $1 = 이 서버에 붙일 도메인 (미리 DNS A 레코드를 이 VM의 공용 IP로 향하게 해 둘 것)
#       도메인을 안 주면 HTTPS 없이 3000번 포트로만 뜬다(테스트용).
set -euo pipefail

DOMAIN="${1:-}"
REPO="https://github.com/kimju1416/class-arcade.git"
APPDIR="/opt/class-arcade"
SVCUSER="arcade"

say() { echo -e "\n\033[1;36m▶ $*\033[0m"; }

[ "$(id -u)" -eq 0 ] || { echo "sudo로 실행하세요"; exit 1; }

say "1/7 시스템 업데이트 + 기본 도구"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg ufw

say "2/7 Node.js LTS 설치"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

say "3/7 앱 내려받기 ($APPDIR)"
id -u "$SVCUSER" >/dev/null 2>&1 || useradd -r -m -d /home/$SVCUSER -s /usr/sbin/nologin "$SVCUSER"
if [ -d "$APPDIR/.git" ]; then
  git -C "$APPDIR" fetch --all -q && git -C "$APPDIR" reset --hard origin/main -q
else
  rm -rf "$APPDIR"; git clone -q "$REPO" "$APPDIR"
fi
cd "$APPDIR"
# ws 하나뿐이라 설치가 가볍다. 선택 의존은 빼서 용량을 아낀다.
npm install --omit=dev --omit=optional --no-audit --no-fund
chown -R "$SVCUSER":"$SVCUSER" "$APPDIR"

say "4/7 방화벽 — Oracle은 두 겹이라 둘 다 열어야 한다"
# ① OS 방화벽. ② Oracle 콘솔의 Security List(수동, 안내서 참고).
# Oracle 우분투 이미지는 iptables에 REJECT 규칙이 기본으로 박혀 있어서
# ufw만 열어도 막힌다 — iptables 앞쪽에 직접 넣어 준다.
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
iptables -I INPUT -p tcp --dport 80  -j ACCEPT || true
iptables -I INPUT -p tcp --dport 443 -j ACCEPT || true
apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
netfilter-persistent save >/dev/null 2>&1 || true

say "5/7 서비스 등록 (죽으면 자동 재시작, 부팅 시 자동 실행)"
cat >/etc/systemd/system/class-arcade.service <<EOF
[Unit]
Description=Class Arcade
After=network.target

[Service]
Type=simple
User=$SVCUSER
WorkingDirectory=$APPDIR
Environment=PORT=3000
Environment=NODE_ENV=production
# 필요하면 여기에 Environment=DEBUG_KEY=... 를 추가
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
StandardOutput=append:/var/log/class-arcade.log
StandardError=append:/var/log/class-arcade.log

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now class-arcade
sleep 2
systemctl is-active class-arcade

if [ -n "$DOMAIN" ]; then
  say "6/7 HTTPS — Caddy가 인증서를 자동 발급·갱신한다 ($DOMAIN)"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy
  # WebSocket은 Caddy가 자동으로 업그레이드를 통과시킨다 (별도 설정 불필요)
  cat >/etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
EOF
  systemctl restart caddy
  echo "https://$DOMAIN 으로 접속됩니다 (인증서 발급에 10~30초)"
else
  say "6/7 HTTPS 건너뜀 — 도메인 인자를 안 줬습니다"
  echo "http://<이 VM의 공용IP>:3000 으로 접속 (Oracle 콘솔에서 3000 포트도 열어야 함)"
  ufw allow 3000/tcp >/dev/null
  iptables -I INPUT -p tcp --dport 3000 -j ACCEPT || true
fi

say "7/7 배포 갱신 명령 만들기"
cat >/usr/local/bin/arcade-update <<'EOF'
#!/usr/bin/env bash
# GitHub의 최신 코드로 갱신하고 재시작
set -e
cd /opt/class-arcade
git fetch --all -q
git reset --hard origin/main -q
npm install --omit=dev --omit=optional --no-audit --no-fund
chown -R arcade:arcade /opt/class-arcade
systemctl restart class-arcade
echo "갱신 완료: $(git log --oneline -1)"
EOF
chmod +x /usr/local/bin/arcade-update

say "완료"
echo "  상태 보기 : systemctl status class-arcade"
echo "  로그 보기 : tail -f /var/log/class-arcade.log"
echo "  코드 갱신 : sudo arcade-update"
[ -n "$DOMAIN" ] && echo "  주소      : https://$DOMAIN"
