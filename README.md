# 해율 자연의 흐름 전자여권

> 자연의 흐름을 맛으로 전합니다.

해율만두전골에서 운영하는 전자여권형 멤버십 웹앱입니다.  
매장 전체에서 동일한 QR코드 하나를 사용하며, 고객이 방문할 때마다 QR코드를 촬영하여 방문을 기록하고,  
누적 방문 횟수에 따라 방문 등급이 오르며, 3·5·10·20·30회 방문 시마다  
해율이 준비한 선물을 받을 수 있습니다.

---

## 기술 스택

| 항목 | 기술 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS v4 |
| 데이터베이스 | Supabase (PostgreSQL) |
| 배포 | Vercel |
| 시간대 | Asia/Seoul |

---

## 로컬 실행 방법

### 1. 저장소 복제

```bash
git clone https://github.com/your-username/haeyul-passport.git
cd haeyul-passport
```

### 2. 패키지 설치

```bash
npm install
```

### 3. 환경변수 설정

`.env.example`을 복사하여 `.env.local` 파일을 만들고, Supabase 정보를 입력하세요.

```bash
cp .env.example .env.local
```

필요한 환경변수:

| 변수명 | 설명 | 확인 위치 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | Supabase 대시보드 > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | 같은 위치 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | 같은 위치 (비공개) |

### 4. Supabase 데이터베이스 설정

1. [supabase.com](https://supabase.com)에서 무료 프로젝트를 생성합니다.
2. 프로젝트 대시보드 > **SQL Editor**를 엽니다.
3. `supabase/migrations/001_initial_schema.sql` 파일 내용을 복사하여 실행합니다.
4. 이어서 `supabase/migrations/003_verify_admin_password.sql` 파일 내용을 복사하여 실행합니다. (관리자 비밀번호 확인용 함수)
5. 이어서 `supabase/migrations/004_reward_tiers.sql` 파일 내용을 복사하여 실행합니다. (3/5/10/20/30회 선물 + 자동 발급 트리거)
6. 시험 데이터가 자동으로 생성됩니다.

> `002_verify_employee_pin.sql`은 예전에 있었던 직원 PIN 확인 화면(`/staff`, 현재는 제거됨)을 위한 함수라 신규 설치 시에는 실행하지 않아도 됩니다.

### 5. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

---

## Supabase 프로젝트 생성 방법

1. [supabase.com](https://supabase.com)에 접속하여 회원가입/로그인합니다.
2. **New Project** 버튼을 클릭합니다.
3. 프로젝트 이름: `haeyul-passport`
4. 데이터베이스 비밀번호: 안전한 비밀번호를 설정하세요.
5. 지역(Region): **Northeast Asia (Tokyo)** 또는 가장 가까운 지역을 선택하세요.
6. **Create new project**를 클릭하면 1~2분 내에 생성됩니다.
7. 프로젝트가 생성되면 **Settings > API**에서 URL과 키를 확인합니다.

---

## 방문 등급 & 방문 선물

방문 등급은 누적 방문 횟수로부터 그때그때 계산되는 값이라 별도로 저장하지 않습니다(`src/lib/tiers.ts`). 방문 횟수가 바뀔 때마다 자동으로 다시 계산됩니다.

| 등급 | 누적 방문 횟수 |
|---|---|
| 새싹 | 1회 이상 5회 미만 |
| 푸른잎 | 5회 이상 10회 미만 |
| 나무 | 10회 이상 20회 미만 |
| 숲 | 20회 이상 30회 미만 |
| 해율 VIP | 30회 이상 |

해율 VIP 등급 고객에게는 "다음 등급까지 남은 횟수" 대신 아래 문구가 표시됩니다.

> 해율 VIP가 되셨습니다. 오랜 시간 자연의 흐름을 함께해 주셔서 감사합니다.

방문 선물은 등급과 별도로, 아래 방문 횟수에 도달할 때마다 한 번씩만 자동 발급됩니다(DB 트리거 + `customer_rewards(customer_id, reward_id)` UNIQUE 제약으로 중복 발급을 막습니다). 발급된 선물은 사용하지 않으면 선물함에 계속 남아 있다가, 고객이 매장에서 선물함 화면을 직원에게 보여주고 **"직원확인"** 버튼을 누르면 그 자리에서 바로 사용 처리됩니다. 별도의 직원 로그인이나 PIN은 필요 없습니다.

| 방문 횟수 | 선물 |
|---|---|
| 3회 | 음료수 또는 만두 2알 |
| 5회 | 해율술빵 1개 |
| 10회 | 동충하초 또는 노루궁뎅이 버섯 |
| 20회 | 새싹인삼 + 전복 2미 |
| 30회 | 해율 VIP 특별 감사 선물 |

이 내용을 한 장으로 정리한 안내 화면이 `/guide`(로그인 불필요)에 있으며, 신규 가입 완료 화면(`/welcome`) 하단의 "여권 설명서 보기"에서 바로 볼 수 있습니다.

---

## Vercel 배포 방법

1. GitHub에 이 저장소를 푸시합니다.
2. [vercel.com](https://vercel.com)에서 **New Project**를 클릭합니다.
3. GitHub 저장소를 연결합니다.
4. 환경변수를 설정합니다 (`.env.example` 참고).
5. **Deploy**를 클릭합니다.

---

## 테스트 계정

### 관리자

`/admin` 접속 시 로그인이 안 되어 있으면 `/admin/login`으로 이동합니다. 로그인하면 대시보드(오늘 방문/신규가입/미사용 선물 등 통계), 고객관리(검색, 방문·선물 이력 조회), 선물현황(선물 종류별 발급·사용·미사용 집계)을 이용할 수 있습니다.

| 항목 | 값 |
|---|---|
| 주소 | `/admin` |
| 아이디 | `admin` |
| 비밀번호 | `haeyul8000` |

### 테스트 고객

| 고객명 | 전화번호 | 방문 횟수 | 등급 | 비고 |
|---|---|---|---|---|
| 김신규 | 010-1111-0001 | 1회 | 새싹 | 신규 |
| 이중간 | 010-2222-0002 | 4회 | 새싹 | 다음 등급까지 1회 |
| 박아홉 | 010-3333-0003 | 10회 | 나무 | 3·5·10회 선물 보유 |
| 최열번 | 010-4444-0004 | 10회 | 나무 | 3·5회 선물 보유, 10회 선물 사용 완료 |
| 정완료 | 010-5555-0005 | 12회 | 나무 | 3·5회 선물 보유, 10회 선물 사용 완료 |
| 황금별 | 010-9999-0009 | 32회 | 해율 VIP | 3·5·10·20·30회 선물 전부 보유 (VIP 화면 확인용) |

---

## 프로젝트 구조

```
haeyul-passport/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # 루트 레이아웃
│   │   ├── page.tsx            # 홈 화면
│   │   ├── actions.ts          # 고객용 Server Actions (가입/로그인/방문/선물함)
│   │   ├── visit/               # QR 접속 (가입/로그인)
│   │   ├── welcome/              # 가입 완료 안내 (여권 설명서 링크 포함)
│   │   ├── guide/                # 해율 여권 설명서 (등급/방문 선물 안내, 로그인 불필요)
│   │   ├── passport/            # 전자여권 홈 / 방문기록 / 선물함
│   │   │   └── rewards/         # 내 선물함 (직원확인으로 즉시 사용 처리)
│   │   ├── admin/                # 관리자 로그인 / 대시보드 / 고객관리 / 선물현황
│   │   │   ├── login/            # 관리자 로그인
│   │   │   ├── customers/        # 고객 목록·검색 / 상세
│   │   │   ├── rewards/          # 선물 발급·사용 집계
│   │   │   └── actions.ts       # 관리자용 Server Actions
│   │   └── api/                 # API 라우트 (추후)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts       # 브라우저용 클라이언트
│   │   │   ├── server.ts       # 서버용 클라이언트
│   │   │   └── admin.ts        # 관리자용 클라이언트
│   │   ├── session.ts          # 고객 세션 (쿠키)
│   │   ├── adminSession.ts     # 관리자 세션 (쿠키)
│   │   ├── tiers.ts            # 방문 등급 계산 (새싹~해율 VIP)
│   │   ├── constants.ts        # 상수
│   │   └── utils.ts            # 유틸리티 함수
│   └── types/
│       └── database.ts         # 타입 정의
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_verify_employee_pin.sql
│       ├── 003_verify_admin_password.sql
│       └── 004_reward_tiers.sql
├── public/
│   ├── tiers/                  # 등급별 아이콘 (sprout/leaf/tree/forest/vip.svg)
│   └── manifest.json           # PWA 매니페스트
├── .env.example
├── .env.local                  # (git 제외)
└── README.md
```

---

## 개인정보 및 보안 주의사항

> ⚠️ 이 프로젝트는 시험판입니다. 실제 운영 전 다음 사항을 반드시 확인하세요.

- 개인정보처리방침과 이용약관을 법률 전문가에게 검토받으세요.
- `SUPABASE_SERVICE_ROLE_KEY`는 절대 클라이언트에 노출하지 마세요.
- 환경변수(`.env.local`)를 GitHub에 올리지 마세요.
- 관리자 비밀번호는 배포 후 즉시 변경하세요.

---

## 제작 진행 현황

| 단계 | 내용 | 상태 |
|---|---|---|
| 1단계 | 프로젝트 구조 + DB 설계 | ✅ 완료 |
| 2단계 | 신규회원 가입 | ✅ 완료 |
| 3단계 | 기존회원 접속 | ✅ 완료 |
| 4단계 | QR 접속 + 방문등록 (매장 공통 QR 1개) | ✅ 완료 |
| 5단계 | 전자여권 홈 화면 | ✅ 완료 |
| 6단계 | 방문기록 화면 | ✅ 완료 |
| 7단계 | 방문 등급(새싹~해율 VIP) + 3/5/10/20/30회 선물 자동 발급 | ✅ 완료 |
| 8단계 | 선물함 "직원확인" 버튼으로 즉시 사용 처리 | ✅ 완료 |
| 9단계 | 관리자 화면 | 🟡 부분 완료 (로그인/대시보드/고객관리, 직원관리는 대기) |
| 10단계 | 개인정보 + 권한 보안 | ⬜ 대기 |
| 11단계 | 모바일 최적화 | ⬜ 대기 |
| 12단계 | 전체 테스트 | ⬜ 대기 |
| 13단계 | GitHub + Vercel 배포 | ⬜ 대기 |
