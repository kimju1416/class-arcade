# 슈퍼스타 카트 검사 스크립트

전제: `node server.js`(3000번)가 떠 있고, Playwright는 `C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright`를 쓴다(스크립트 안 경로).
브라우저 pane 스크린샷은 pane이 숨으면 렌더가 멈추므로 판정은 이 스크립트로 한다. GPU 플래그(`--use-angle=d3d11 --enable-gpu`)가 없으면 소프트웨어 렌더라 10배 느리다.

| 스크립트 | 무엇을 보나 | 실행 |
|---|---|---|
| `pw-solo.cjs <out> <track 0-3>` | 혼자 달리기 전체 흐름(아이템 6종·결승·결과), fps, 스크린샷 s0~s6 | `node pw-solo.cjs ./out 0` |
| `pw-multi.cjs <out>` | 2인 온라인(방 만들기→입장→팀전 출발→아이템 전파→결과→대기실 복귀) | 20초 규칙: 서버가 출발 20초 안 결승을 거부하므로 prog 점프는 16초 뒤 |
| `pw-tv.cjs <out>` | 교실 대회: TV(QR 대기실)+학생 폰 2명, 관전 화면·순위판·시상식 | |
| `pw-v2.cjs <out>` | 로켓 스타트·3D 시상식·타임 어택 고스트·기록 저장 | |
| `pw-mobile.cjs <out>` / `pw-look.cjs <out> [url]` | 폰 세로/가로 화면·fps, 폰 화질(q1)로 세 코스 캡처 | 형님은 폰으로 보니 q1 캡처를 꼭 볼 것 |
| `pw-joy.cjs <out>` | 원 조이스틱 핸들·브레이크 | |
| `pw-kpop.cjs <out>` / `pw-stage.cjs <out>` | 공연장 코스·점프대·팀 점수판 / 무대 전경(디버그 카메라 `window.__kartCam`) | |
| `pw-gar.cjs` / `pw-car.cjs` | 차량 선택 화면 | |
| `pw-prof.cjs` | 코스 만들기 구간별 시간(`window.__kartProf`)·전체 로딩 | |
| `sim3.mjs` | 노드만으로 봇 8대×400초 주행 시뮬(벽 충돌·오프로드·멈춤) | `node sim3.mjs` |
| `tcheck.mjs <svg>` | 트랙 길이·비인접 구간 최소 간격(겹침) 검사 | 새 코스 추가 때 먼저 |

게임 안 훅: `window.__kartAuto = true`(내 카트도 봇이 운전), `window.__kart.race`(상태), `window.__kartCam = {pos, look, fov}`(카메라 고정).
서버 방어 검사는 `node test/kart-server.test.js` (라이브: `KART_WS=wss://game.kimju.kr/kart/ws`).
