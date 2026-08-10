# 교실 아케이드

학급 실시간 멀티플레이 미니게임 플랫폼.
선생님이 방을 열면 TV에 QR코드가 뜨고, 학생들은 폰으로 QR을 찍어 입장해서 다 같이 게임합니다.

- 게임 4종: 💣 폭탄 피하기 · 🧟 감염 술래잡기 · 🪙 동전 줍기 · 📝 낱말 빨리치기 (한 방 최대 40명)
- 라이브: https://class-arcade-i6xj.onrender.com
- 기술: Node.js + WebSocket(ws) 서버 1개가 웹페이지 서빙과 게임 판정을 모두 담당
- 기획서: [PRD.md](PRD.md)

## 내 컴퓨터에서 실행 (테스트)

```bash
npm install
node server.js
```

브라우저에서 `http://localhost:3000` 접속 → 방 만들기.
같은 컴퓨터에서 학생 흉내를 내려면 탭을 하나 더 열고
`http://localhost:3000/?room=방코드&fresh=1` 로 접속한다.
(`fresh=1`은 같은 브라우저의 탭들이 서로 딴 사람으로 입장하게 하는 테스트 옵션)

## Render 무료 배포 (처음 하는 사람용)

Render는 서버를 무료로 돌려주는 서비스다. 카드 등록 없이 가입 가능.

### 1. 코드를 GitHub에 올린다
이 폴더가 GitHub 저장소로 올라가 있어야 한다. (Claude에게 "GitHub에 올려줘"라고 하면 됨)

### 2. Render 가입
1. https://render.com 접속 → **Get Started**
2. **GitHub로 로그인** 선택 (계정 연동 승인)

### 3. 서버 만들기
1. 대시보드에서 **New +** → **Web Service**
2. 방금 올린 저장소(class-arcade) 선택 → **Connect**
3. 설정 입력:
   - **Name**: `class-arcade` (원하는 이름)
   - **Region**: `Singapore` (한국에서 가장 가까움)
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: **Free** 선택 ← 중요!
4. **Create Web Service** 클릭
5. 2~3분 기다리면 위쪽에 `https://class-arcade-xxxx.onrender.com` 주소가 생긴다.
   이게 완성된 서비스 주소다. 교실에서 이 주소로 접속하면 된다.

### 4. 이후 수정 반영
코드를 고쳐서 GitHub에 push하면 Render가 자동으로 다시 배포한다. 따로 할 일 없음.

## 무료 플랜 주의사항

- **15분간 아무도 안 쓰면 서버가 잠든다.** 다음 접속자는 깨어날 때까지 30초쯤 기다린다.
  → 수업 시작 전에 미리 한 번 접속해서 깨워두면 쾌적하다.
- 무료 한도는 월 750시간 — 서비스 1개면 한 달 내내 켜져 있어도 무료다.

## 운영 팁

- 교사 화면(TV)을 새로고침해도 방은 유지된다 (자동 복귀).
- 학생 폰이 잠기거나 새로고침돼도 같은 방 코드로 다시 들어가면 원래 자리로 복귀한다.
- 이름 장난치는 학생은 로비에서 이름 칩을 눌러 내보낼 수 있다.
- 방은 마지막 활동 후 30분이 지나면 자동 삭제된다.
- `서버주소/debug` 로 현재 방·참가자 현황을 볼 수 있다.

## 파일 구조

```
server.js          서버 전체 (방 관리 + 게임 판정 + 정적 파일 서빙)
public/index.html  화면 전체 (교사 TV 모드 + 학생 폰 모드)
package.json       의존성 (ws 하나뿐)
PRD.md             기획서
```
