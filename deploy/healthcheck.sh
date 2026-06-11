#!/usr/bin/env bash
# 现编OS 健康兜底：补 systemd 抓不到的"进程活着但服务 hang"的盲区。cron 每 2 分钟跑。
# 异常/重启写 health.log（持久、稀疏、可查）；每次结果覆盖写 health.status（看监控本身是否在跑）。
# 可选：在 .env 设 ALERT_WEBHOOK（飞书自定义机器人 URL）即开主动推送，不设则只记日志。
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"      # systemctl --user 找 user bus 用
export no_proxy='*' NO_PROXY='*'

DIR="$HOME/improv-os"
LOG="$DIR/health.log"
STATUS="$DIR/health.status"
ROTATE_MAX=$((512 * 1024))

ALERT_WEBHOOK=""
[ -f "$DIR/.env" ] && ALERT_WEBHOOK=$(grep -E '^ALERT_WEBHOOK=' "$DIR/.env" | cut -d= -f2-)

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }
alert() {
  [ -n "$ALERT_WEBHOOK" ] && curl -s -m 8 -XPOST "$ALERT_WEBHOOK" \
    -H 'content-type: application/json' \
    -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"现编OS 兜底告警：$1\"}}" >/dev/null 2>&1
}
chk() { curl -s --noproxy '*' -m "$2" -o /dev/null -w '%{http_code}' "$1" 2>/dev/null; }

# 日志轮转（超 512KB 滚一份）
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt "$ROTATE_MAX" ] && mv "$LOG" "$LOG.1"

problems=0

# 1. improv-os 本地 HTTP（进程 hang 时 systemd 抓不到，这里抓）
if [ "$(chk http://127.0.0.1:7100/api/stats 10)" != 200 ]; then
  problems=$((problems + 1)); log "RESTART improv-os（本地 7100 无响应）"; alert "improv-os 卡死，已重启"
  sudo -n systemctl restart improv-os
fi

# 2. opencode（深轨/修改依赖）
if [ "$(chk http://127.0.0.1:4096/global/health 6)" != 200 ]; then
  problems=$((problems + 1)); log "RESTART opencode（4096 health 无响应）"; alert "opencode 卡死，已重启"
  systemctl --user restart opencode.service
fi

# 3. cloudflared（公网入口）
if ! systemctl is-active --quiet cloudflared; then
  problems=$((problems + 1)); log "RESTART cloudflared（非 active）"; alert "cloudflared 挂，已重启"
  sudo -n systemctl restart cloudflared
fi

# 4. 公网端到端（验证整条链路 Cloudflare→tunnel→源站；上面已重启过则下轮自然恢复）
if [ "$problems" -eq 0 ] && [ "$(chk https://os.fzhiyu.dev/api/stats 15)" != 200 ]; then
  problems=$((problems + 1)); log "RESTART cloudflared（公网 os.fzhiyu.dev 不可达）"; alert "公网不可达，已重启隧道"
  sudo -n systemctl restart cloudflared
fi

echo "$(date '+%F %T') problems=$problems" > "$STATUS"
