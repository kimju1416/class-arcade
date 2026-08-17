# Oracle Cloud에 Class Arcade 하나 더 띄우기

Render는 그대로 둔 채 **비교용으로 하나 더** 올리는 절차. 잘 돌면 도메인만 옮기면 되고,
아니면 그냥 지우면 된다(Render는 손 안 댐).

## 왜 옮기나 (2026-08-16 실측·확인)

| | Render Hobby (현재) | Oracle Always Free |
|---|---|---|
| 월 대역폭 | **5 GB** | **10 TB** |
| CPU / RAM | 0.1 / 512MB | 2 OCPU / 12GB |
| 잠들기 | 15분 후 (첫 접속 ~50초) | 안 잠듦 |
| 한국까지 왕복 | **124ms** (실측) | 오사카 리전 30~40ms 예상 |
| 비용 | 5GB 초과분 과금 | $0 |

30명 한 반이 1시간 놀면 약 **1.3GB**다. Render 5GB로는 한 달에 4 반·시간뿐이고,
10TB면 약 7,700 반·시간이라 사실상 제한이 없다.

## 선생님이 직접 하실 일 (제가 대신 못 하는 부분)

### 1) 계정 만들기
- https://www.oracle.com/cloud/free/ 에서 가입
- **홈 영역(리전)은 나중에 못 바꾼다.** 가장 가까운 곳을 고른다.
  - **한국 리전(서울·춘천)은 무료 가입 목록에 안 뜬다** (2026-08-16 실제 확인).
    리전 자체는 존재하지만 무료 계층 대상이 아니다 — 문서에서 존재만 보고 판단하면 틀린다.
  - 실제로 뜨는 것 중 최선은 **일본(오사카)**. 서울에서 830km로 도쿄(1,160km)보다 가깝고,
    도쿄는 수요가 많아 무료 ARM 재고가 자주 없다. 예상 왕복 30~40ms(Render는 실측 124ms).
  - 싱가포르는 70~80ms, 미국·유럽은 150ms 이상이라 이사 이점이 대역폭만 남는다.
- 카드 등록이 필요하다(본인 확인용, Always Free 범위에서는 청구되지 않는다).
- **무료 계정은 1인당 하나**다. 여러 개 만들려 시도하면 정지된다 — 홈 영역을 신중히 고를 것.

### 2) 인스턴스(서버) 만들기
Compute → Instances → Create instance

- **Image**: Canonical Ubuntu 24.04
- **Shape**: `VM.Standard.A1.Flex` (ARM) — **OCPU 2, Memory 12GB**
  - "Out of capacity" 오류가 흔하다. 며칠 뒤 다시 시도하거나 다른 가용 도메인/리전을 시도한다.
  - 급하면 `VM.Standard.E2.1.Micro`(AMD, 1 OCPU/1GB)도 Always Free다. 성능은 낮지만 한 반 정도는 충분하다.
- **SSH key**: "Generate a key pair for me"로 받아서 개인키 파일을 잘 보관
- 만들고 나면 **Public IP address**를 적어 둔다

### 3) Oracle 콘솔에서 포트 열기 (이걸 빼먹으면 아무리 해도 접속 안 된다)
Instance → 왼쪽 Subnet 클릭 → Security List → **Add Ingress Rules**

| Source CIDR | Protocol | Destination Port |
|---|---|---|
| 0.0.0.0/0 | TCP | 80 |
| 0.0.0.0/0 | TCP | 443 |

### 4) 도메인 연결 (HTTPS를 쓰려면 필요)
kimju.kr DNS에 A 레코드 추가 — 예: `game2` → 위에서 적어 둔 공용 IP.
(먼저 `game2.kimju.kr`로 시험하고, 만족하면 나중에 `game.kimju.kr`을 옮기면 된다.)

### 5) 접속해서 설치 스크립트 한 줄
```bash
ssh -i <받은키.key> ubuntu@<공용IP>
curl -fsSL https://raw.githubusercontent.com/kimju1416/class-arcade/main/deploy/oracle-setup.sh -o setup.sh
sudo bash setup.sh game2.kimju.kr
```

끝. Node 설치 → 앱 내려받기 → 방화벽 → 서비스 등록 → HTTPS 인증서 발급까지 자동이다.

## 설치 후 쓰는 명령

```bash
systemctl status class-arcade      # 살아 있나
tail -f /var/log/class-arcade.log  # 로그
sudo arcade-update                 # GitHub 최신 코드로 갱신 + 재시작
```

## 알아 둘 함정

- **Oracle 우분투 이미지는 iptables에 REJECT 규칙이 기본으로 박혀 있다.** ufw만 열어도 막힌다.
  설치 스크립트가 iptables 앞쪽에 ACCEPT를 넣고 저장하지만, 안 되면 이걸 먼저 의심할 것.
- **포트는 두 겹이다** — Oracle 콘솔 Security List(위 3번)와 VM 안의 방화벽. 둘 다 열려야 한다.
- **ARM 인스턴스 재고 부족**이 흔하다. 안 만들어지면 며칠 뒤 재시도.
- Render처럼 push하면 자동 배포되지는 않는다. 코드 고친 뒤 `sudo arcade-update`를 실행해야 한다.
  (자동화하려면 GitHub Actions에서 SSH로 이 명령을 때리게 만들면 된다.)
- **Render는 건드리지 않았다.** 두 서버가 동시에 떠 있어도 서로 무관하다(방 데이터는 각자 메모리).

## 잘 되는지 확인하는 법

```bash
# 왕복 지연 — Render와 비교해 본다
curl -o /dev/null -s -w "%{time_total}s\n" https://game2.kimju.kr/health
```

교실에서 한 판 돌려 보고, 조작 반응이 눈에 띄게 빨라지면 도메인을 옮길 만하다.
