// 온라인 연결 — 서버 시계 맞추기 + 메시지 주고받기
export class Net {
  constructor(handler) {
    this.h = handler; this.off = 0; this.rtt = 0; this.best = Infinity; this.ws = null; this.id = null; this.open = false;
  }
  connect(hello) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = this.ws = new WebSocket(`${proto}//${location.host}/kart/ws`);
    ws.onopen = () => { this.open = true; this.send({ t: 'hello', ...hello }); this.ping(); this.pingI = setInterval(() => this.ping(), 2000); };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'pong') {
        const now = performance.now(), rtt = now - m.c;
        this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
        // 가장 빨리 돌아온 왕복으로 시계 차이를 잡는다(느린 응답은 흔들림이 크다)
        if (rtt < this.best * 1.3) { this.best = Math.min(this.best, rtt); const off = m.s - (m.c + rtt / 2); this.off = this.off ? this.off * 0.7 + off * 0.3 : off; }
        return;
      }
      if (m.type === 'welcome') { this.id = m.id; if (!this.off) this.off = m.s - performance.now(); }
      this.h(m);
    };
    ws.onclose = () => { this.open = false; clearInterval(this.pingI); this.h({ type: 'closed' }); };
    ws.onerror = () => { };
  }
  ping() { this.send({ t: 'ping', c: performance.now() }); }
  now() { return performance.now() + this.off; }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  close() { try { this.ws && this.ws.close(); } catch (e) { } this.ws = null; clearInterval(this.pingI); }
}
