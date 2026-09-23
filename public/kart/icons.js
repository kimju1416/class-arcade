// 아이템 아이콘을 캔버스로 그린다 — HUD와 3D 발사체가 같은 그림을 쓴다
const cache = {};

function star(g, cx, cy, R, r, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r : R;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}

function shade(g, cx, cy, r, c1, c2) {
  const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  gr.addColorStop(0, c1); gr.addColorStop(1, c2); return gr;
}

const DRAW = {
  ball(g, s) { // 야구공
    const c = s / 2, r = s * 0.4;
    g.fillStyle = shade(g, c, c, r, '#ffffff', '#cfd3da'); g.beginPath(); g.arc(c, c, r, 0, 7); g.fill();
    g.strokeStyle = '#d4312b'; g.lineWidth = s * 0.03;
    for (const sg of [-1, 1]) {
      const a0 = sg < 0 ? 0 : Math.PI;
      g.beginPath(); g.arc(c + sg * r * 1.25, c, r * 0.85, a0 - 0.95, a0 + 0.95); g.stroke();
      for (let i = -3; i <= 3; i++) {
        const a = (sg < 0 ? 0 : Math.PI) + i * 0.24, x = c + sg * r * 1.25 + Math.cos(a) * r * 0.85, y = c + Math.sin(a) * r * 0.85;
        g.beginPath(); g.moveTo(x - s * 0.025, y - s * 0.012); g.lineTo(x + s * 0.025, y + s * 0.012); g.stroke();
      }
    }
  },
  hball(g, s) { // 농구공
    const c = s / 2, r = s * 0.4;
    g.fillStyle = shade(g, c, c, r, '#ffb15c', '#d9570e'); g.beginPath(); g.arc(c, c, r, 0, 7); g.fill();
    g.save(); g.beginPath(); g.arc(c, c, r, 0, 7); g.clip();
    g.strokeStyle = '#3a1a08'; g.lineWidth = s * 0.028;
    g.beginPath(); g.moveTo(c - r, c); g.lineTo(c + r, c); g.stroke();
    g.beginPath(); g.moveTo(c, c - r); g.lineTo(c, c + r); g.stroke();
    g.beginPath(); g.arc(c - r * 1.15, c, r * 0.9, -0.9, 0.9); g.stroke();
    g.beginPath(); g.arc(c + r * 1.15, c, r * 0.9, Math.PI - 0.9, Math.PI + 0.9); g.stroke();
    g.restore();
  },
  banana(g, s) {
    g.save(); g.translate(s / 2, s / 2); g.rotate(-0.5);
    g.fillStyle = '#ffd92e'; g.strokeStyle = '#8a6a00'; g.lineWidth = s * 0.025;
    g.beginPath(); g.moveTo(-s * 0.34, -s * 0.05);
    g.quadraticCurveTo(0, s * 0.42, s * 0.34, -s * 0.12);
    g.quadraticCurveTo(0, s * 0.2, -s * 0.34, -s * 0.05); g.fill(); g.stroke();
    g.fillStyle = '#6b4a12'; g.fillRect(s * 0.3, -s * 0.18, s * 0.07, s * 0.08);
    g.restore();
  },
  star(g, s) {
    const c = s / 2;
    star(g, c, c * 1.04, s * 0.44, s * 0.2);
    const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#fff27a'); gr.addColorStop(1, '#ffae00');
    g.fillStyle = gr; g.fill(); g.lineWidth = s * 0.035; g.strokeStyle = '#b86b00'; g.stroke();
    g.fillStyle = '#3b2600'; g.fillRect(c - s * 0.09, c - s * 0.02, s * 0.045, s * 0.1); g.fillRect(c + s * 0.05, c - s * 0.02, s * 0.045, s * 0.1);
  },
  mic(g, s) {
    const c = s / 2;
    g.save(); g.translate(c, c); g.rotate(0.5);
    g.fillStyle = '#2b2f3a'; g.fillRect(-s * 0.06, -s * 0.02, s * 0.12, s * 0.42);
    g.fillStyle = '#ff4fa3'; g.fillRect(-s * 0.075, s * 0.05, s * 0.15, s * 0.05);
    g.fillStyle = shade(g, 0, -s * 0.16, s * 0.17, '#ffffff', '#8c94a5'); g.beginPath(); g.arc(0, -s * 0.16, s * 0.17, 0, 7); g.fill();
    g.strokeStyle = 'rgba(40,44,56,.45)'; g.lineWidth = s * 0.012;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * s * 0.045, -s * 0.32); g.lineTo(i * s * 0.045, 0); g.stroke(); g.beginPath(); g.moveTo(-s * 0.17, -s * 0.16 + i * s * 0.045); g.lineTo(s * 0.17, -s * 0.16 + i * s * 0.045); g.stroke(); }
    g.restore();
    g.strokeStyle = '#ffd92e'; g.lineWidth = s * 0.03; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(c * 0.62, c * 0.62, s * (0.2 + i * 0.08), Math.PI * 0.95, Math.PI * 1.55); g.stroke(); }
  },
  boost(g, s) { // 부스터 캔
    const c = s / 2;
    const gr = g.createLinearGradient(c - s * 0.2, 0, c + s * 0.2, 0);
    gr.addColorStop(0, '#9e1010'); gr.addColorStop(0.4, '#ff4b3a'); gr.addColorStop(1, '#8a0c0c');
    g.fillStyle = gr; g.beginPath(); g.roundRect(c - s * 0.2, s * 0.16, s * 0.4, s * 0.68, s * 0.06); g.fill();
    g.fillStyle = '#d7dbe3'; g.fillRect(c - s * 0.18, s * 0.13, s * 0.36, s * 0.06); g.fillRect(c - s * 0.18, s * 0.81, s * 0.36, s * 0.05);
    g.fillStyle = '#ffe14a'; g.beginPath();
    g.moveTo(c + s * 0.04, s * 0.28); g.lineTo(c - s * 0.1, s * 0.52); g.lineTo(c, s * 0.52); g.lineTo(c - s * 0.05, s * 0.72); g.lineTo(c + s * 0.11, s * 0.45); g.lineTo(c + s * 0.01, s * 0.45); g.closePath(); g.fill();
  },
  boost3(g, s) {
    const t = document.createElement('canvas'); t.width = t.height = s; DRAW.boost(t.getContext('2d'), s);
    g.drawImage(t, -s * 0.2, s * 0.08, s * 0.72, s * 0.72);
    g.drawImage(t, s * 0.48, s * 0.08, s * 0.72, s * 0.72);
    g.drawImage(t, s * 0.14, s * 0.26, s * 0.72, s * 0.72);
  },
  box(g, s) { // 아이템 상자 옆면
    const gr = g.createLinearGradient(0, 0, s, s);
    gr.addColorStop(0, 'rgba(255,90,160,.85)'); gr.addColorStop(0.33, 'rgba(255,210,60,.85)'); gr.addColorStop(0.66, 'rgba(60,220,160,.85)'); gr.addColorStop(1, 'rgba(70,150,255,.85)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = s * 0.06; g.strokeRect(s * 0.03, s * 0.03, s * 0.94, s * 0.94);
    g.font = `900 ${s * 0.62}px "Black Han Sans", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = s * 0.05; g.strokeStyle = 'rgba(40,20,80,.6)'; g.strokeText('?', s / 2, s * 0.54);
    g.fillStyle = '#fff'; g.fillText('?', s / 2, s * 0.54);
  },
};

export function icon(name, size = 128) {
  const key = name + size;
  if (cache[key]) return cache[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  (DRAW[name] || DRAW.boost)(g, size);
  cache[key] = cv;
  return cv;
}
