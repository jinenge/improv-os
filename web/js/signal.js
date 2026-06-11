// 菜单栏 WiFi 信号——表面是网络信号，实为系统承载压力指示器。
// 人多（并发/排队高）→ 信号变弱；过载 → 滑出 macOS 风格通知。全程用 WiFi 语言伪装，不点破。
const WIFI_SVG = `<svg viewBox="0 0 16 12" class="wifi-svg" data-signal="strong" fill="none" stroke="currentColor" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">
  <path class="wa wa-3" d="M1.5 4.2 a10 10 0 0 1 13 0" stroke-width="1.5"/>
  <path class="wa wa-2" d="M3.8 6.8 a6.6 6.6 0 0 1 8.4 0" stroke-width="1.5"/>
  <path class="wa wa-1" d="M6.1 9.3 a3.2 3.2 0 0 1 3.8 0" stroke-width="1.5"/>
  <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none"/></svg>`;

const TOOLTIP = { strong: '网络连接良好', medium: '网络连接正常', weak: '网络连接缓慢' };

function weakWifiIcon() {
  return `<svg viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 4.2 a10 10 0 0 1 13 0" stroke-width="1.5" opacity=".25"/><path d="M3.8 6.8 a6.6 6.6 0 0 1 8.4 0" stroke-width="1.5" opacity=".25"/><path d="M6.1 9.3 a3.2 3.2 0 0 1 3.8 0" stroke-width="1.5"/><circle cx="8" cy="11" r="1" fill="currentColor" stroke="none"/></svg>`;
}

function showWifiNotice() {
  const n = document.createElement('div');
  n.className = 'notification';
  n.innerHTML = `
    <div class="notif-icon">${weakWifiIcon()}</div>
    <div class="notif-text"><b>网络连接缓慢</b><br>当前网络较拥挤，部分操作可能延迟。</div>`;
  document.body.appendChild(n);
  requestAnimationFrame(() => n.classList.add('show'));
  const close = () => { n.classList.remove('show'); setTimeout(() => n.remove(), 400); };
  n.addEventListener('click', close);
  setTimeout(close, 6000);
}

export function initSignal() {
  const host = document.getElementById('mb-wifi');
  if (!host) return;
  host.innerHTML = WIFI_SVG;
  const svg = host.querySelector('.wifi-svg');
  let wasCrowded = false, lastNotif = 0;

  async function poll() {
    try {
      const r = await fetch('/api/live', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const load = d.fastMax ? (d.fastActive + d.fastQueue) / d.fastMax : 0;
      const crowded = d.fastQueue > 0 || d.deepQueue > 0 || load >= 0.8;
      const level = (load >= 0.7 || d.fastQueue > 0 || d.deepQueue > 0) ? 'weak'
                  : load >= 0.34 ? 'medium' : 'strong';
      svg.dataset.signal = level;
      host.title = TOOLTIP[level];
      // 进入拥挤态时弹一次，2 分钟内不重复（防刷屏）
      if (crowded && !wasCrowded && Date.now() - lastNotif > 120000) {
        lastNotif = Date.now();
        showWifiNotice();
      }
      wasCrowded = crowded;
    } catch {}
  }
  poll();
  setInterval(poll, 4000);
}
