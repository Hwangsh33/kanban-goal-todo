# 칸반 목표 할 일

1년 목표 → 주간계획 → 할 일(칸반)을 연결하는 개인용 웹앱입니다. 할 일을 `done` 컬럼으로 옮기면 연결된 주간계획(과 1년 목표)의 진행률이 바로 갱신됩니다.

- 스택: Next.js 16 (App Router) · TypeScript · MongoDB(Mongoose) · Next.js Route Handlers · dnd-kit
- 화면: `/login` GitHub 로그인, `/` 주간 보드, `/manage` 목표·주간계획·할 일 관리, `/trash` 휴지통
- 로그인: GitHub OAuth. 각 사용자는 자기 목표·주간계획·할 일만 보고 수정할 수 있습니다
- 요구사항: [`docs/PRD.md`](docs/PRD.md)

## 요구 환경

- Node.js 22 이상 (Node 24에서 검증)
- MongoDB 하나 (일반 단일 노드 `mongod` 또는 MongoDB Atlas 무료 티어). **replica set·트랜잭션은 필요 없습니다.**

## 설치

```bash
npm install
cp .env.example .env.local   # 값을 채웁니다 (아래 참고)
```

> 환경변수 파일은 프로젝트 루트의 **`.env.local` 이라는 이름의 파일**이어야 합니다(폴더가 아님). Next.js 와 `npm run migrate:owner` 가 이 파일을 읽으며, `.gitignore` 의 `.env*` 규칙 때문에 커밋되지 않습니다. 실제 값(특히 `GITHUB_CLIENT_SECRET`)은 `.env.example` 이나 다른 커밋되는 파일에 절대 적지 마세요.

> npm 11은 의존성의 install script를 기본 차단합니다. `mongodb-memory-server`의 mongod 바이너리는 테스트 첫 실행 때 자동으로 내려받으므로 따로 승인할 필요가 없습니다.

## 환경변수

| 이름 | 필수 | 설명 |
|------|------|------|
| `MONGODB_URI` | 예 | MongoDB 연결 문자열 |
| `APP_TIMEZONE` | 아니오 | "오늘"과 이번 주(월요일 시작)를 계산하는 시간대. 기본 `Asia/Seoul`. 서버가 UTC여도 이 시간대의 날짜로 계산합니다 |
| `GITHUB_CLIENT_ID` | 예 | GitHub OAuth App 의 Client ID |
| `GITHUB_CLIENT_SECRET` | 예 | GitHub OAuth App 의 Client secret. `.env.local` 또는 배포 환경변수로만 설정 (커밋 금지) |
| `APP_BASE_URL` | 예 | 사용자가 접속하는 앱 주소, 끝에 `/` 없이 (예: `http://localhost:3000`, `https://todo.example.com`). 콜백 URL `{APP_BASE_URL}/auth/github/callback` 을 만드는 데 쓰입니다. 프로덕션에서는 https 만 허용 |
| `LEGACY_OWNER_GITHUB_ID` | 아니오 | 로그인 기능 도입 전에 만든(소유자 없는) 데이터를 넘겨받을 사용자의 **GitHub 숫자 id**(양의 정수, username 아님). 아래 "기존 데이터 귀속" 참고 |
| `GITHUB_OAUTH_BASE_URL` | 아니오 | OAuth 엔드포인트 주소. 기본 `https://github.com`. E2E 테스트가 모의 서버를 가리킬 때만 바꿉니다 |
| `GITHUB_API_BASE_URL` | 아니오 | GitHub API 주소. 기본 `https://api.github.com`. E2E 테스트용 |

> `APP_BASE_URL` · `GITHUB_OAUTH_BASE_URL` · `GITHUB_API_BASE_URL` 은 프로덕션에서는 https URL 만 허용합니다(`NODE_ENV=production`, 즉 `npm start`). http 이면 로그인 라우트가 그 변수 이름을 담은 설정 오류(500)를 반환합니다. 개발(`npm run dev`)·테스트에서는 http 도 됩니다. 예외는 E2E 전용 `ALLOW_INSECURE_OAUTH_URLS=1` 하나뿐이며 `e2e/global-setup.ts` 에서만 설정합니다(`next start` 가 프로덕션 모드로 http 모의 서버에 붙기 때문). 실제 배포에는 절대 설정하지 마세요.

### 로컬 mongod

```bash
# 설치 후 (예: Windows MSI, macOS `brew install mongodb-community`, Linux 패키지)
mongod --dbpath ./data/db
```

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/kanban-goal-todo
APP_TIMEZONE=Asia/Seoul
```

### MongoDB Atlas 무료 티어 (M0)

1. https://www.mongodb.com/cloud/atlas 에서 무료(M0) 클러스터를 만듭니다.
2. **Database Access**에서 DB 사용자를 만들고, **Network Access**에 내 IP(또는 배포 서버 IP)를 추가합니다.
3. **Connect → Drivers**에서 연결 문자열을 복사해 데이터베이스 이름을 붙입니다.

```dotenv
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/kanban-goal-todo?retryWrites=true&w=majority
APP_TIMEZONE=Asia/Seoul
```

## GitHub 로그인 설정

### 1. GitHub OAuth App 만들기

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App** (조직 소유라면 조직 설정의 Developer settings).
2. 입력값:
   - **Application name**: 아무 이름 (예: `칸반 목표 할 일 (local)`)
   - **Homepage URL**: `APP_BASE_URL` 과 같은 값 (예: `http://localhost:3000`)
   - **Authorization callback URL**: `{APP_BASE_URL}/auth/github/callback` (예: `http://localhost:3000/auth/github/callback`). 앱이 보내는 `redirect_uri` 와 **정확히** 같아야 하며, 다르면 GitHub 가 오류 페이지를 보여 줍니다.
3. **Register application** 후 **Client ID** 를 복사하고, **Generate a new client secret** 으로 만든 secret 을 복사합니다(한 번만 보입니다).
4. 프로젝트 루트의 `.env.local` 파일에 넣습니다. **secret 은 절대 커밋하지 마세요.**

```dotenv
GITHUB_CLIENT_ID=<복사한 Client ID>
GITHUB_CLIENT_SECRET=<복사한 Client secret>
APP_BASE_URL=http://localhost:3000
LEGACY_OWNER_GITHUB_ID=<내 GitHub 숫자 id>
```

앱은 `read:user` 권한만 요청하고, GitHub 의 숫자 id·username·avatar URL 만 저장합니다. GitHub access token 은 프로필 조회에만 쓰고 저장하지 않습니다.

### 2. 로컬 vs 배포

- **로컬**: `npm run dev` 후 반드시 `APP_BASE_URL` 과 같은 주소(예: `http://localhost:3000`)로 접속하세요. `127.0.0.1` 로 접속하면 로그인용 state 쿠키가 다른 호스트에 저장돼 콜백에서 "로그인 요청이 만료되었거나 올바르지 않습니다" 오류가 납니다.
- **쿠키**: 세션 쿠키(`kgt_session`, 14일)와 state 쿠키는 `httpOnly`, `SameSite=Lax` 이고 **프로덕션(`NODE_ENV=production`, 즉 `npm start`)에서는 `Secure`** 입니다. Secure 쿠키는 https 에서만 저장되므로(브라우저는 `http://localhost` 만 예외로 허용) 배포 환경은 **https** 여야 합니다.
- **배포**: 배포 주소용 OAuth App 을 따로 만들거나(권장) 기존 앱의 URL 을 바꿉니다. 예) Homepage URL `https://todo.example.com`, callback `https://todo.example.com/auth/github/callback`, 서버 환경변수 `APP_BASE_URL=https://todo.example.com`. `GITHUB_CLIENT_SECRET` 은 호스팅 서비스의 비밀 환경변수로 설정합니다.
- `GITHUB_OAUTH_BASE_URL` / `GITHUB_API_BASE_URL` 은 비워 두면 실제 GitHub 를 사용합니다.

### 3. 기존 데이터 귀속 (마이그레이션)

로그인 도입 전에 만든 목표·주간계획·할 일에는 소유자(`userId`)가 없어 아무에게도 보이지 않습니다. 두 가지 방법으로 한 사용자에게 넘길 수 있으며, 둘 다 멱등입니다(이미 소유자가 있는 데이터는 건드리지 않고, `updatedAt` 도 바꾸지 않습니다).

사용자는 바뀔 수 있는 username 이 아니라 **바뀌지 않는 GitHub 숫자 id** 로 지정합니다(username 은 변경·재사용될 수 있어 다른 계정이 데이터를 가져갈 수 있기 때문). 내 id 는 브라우저나 `curl` 로 `https://api.github.com/users/<login>` 을 열어 응답 JSON 의 `"id"` 값(예: `"id": 583231`)으로 확인합니다.

- **자동**: `LEGACY_OWNER_GITHUB_ID` 에 GitHub 숫자 id 를 설정하면 그 id 의 사용자가 로그인할 때 소유자 없는 데이터가 모두 귀속됩니다(그 사이 username 을 바꿨어도 됩니다). 비워 두면 귀속하지 않고 서버 로그에 경고만 남깁니다. 양의 정수가 아닌 값(예: username)은 설정하지 않은 것으로 보고 경고를 남깁니다.
- **수동**: 그 사용자가 한 번 로그인해 사용자 문서가 만들어진 뒤 실행합니다 (`.env.local` 의 `MONGODB_URI` 사용).

```bash
npm run migrate:owner -- <github-id>   # 인자를 생략하면 LEGACY_OWNER_GITHUB_ID 사용
```

귀속이 끝나면 `LEGACY_OWNER_GITHUB_ID` 를 삭제하세요(`.env.local` 과 배포 환경변수 모두). 더 귀속할 데이터가 없으므로 남겨 둘 이유가 없습니다.

### 4. 로그인 · 로그아웃 동작

- 로그인하지 않으면 페이지는 `/login` 으로 리다이렉트되고, API 는 `401 { "error": "로그인이 필요합니다" }` 를 반환합니다. 다른 사용자의 항목 id 로 요청하면 존재 여부를 숨기기 위해 `404` 입니다.
- `/login` 의 "GitHub 로 로그인" → GitHub 승인 → `/auth/github/callback` → 보드(`/`). 이미 로그인한 상태로 `/login` 에 오면 `/` 로 이동합니다. 취소·state 불일치·GitHub 통신 오류는 `/login?error=denied|state|github` 로 돌아와 한국어 안내를 보여 줍니다.
- 상단 메뉴에 GitHub 아바타와 username, **로그아웃** 버튼이 표시됩니다. 로그아웃(`POST /auth/logout`)은 **DB 의 세션 문서를 삭제**하고(같은 쿠키 값을 다시 보내도 401) **세션 쿠키를 만료**시킨 뒤 `/login` 으로 이동합니다. 다시 로그인하면 기존 데이터가 그대로 보입니다. 세션 문서를 삭제하지 못하면(DB 오류) 쿠키를 그대로 두고 `503` 과 "다시 시도" 안내를 반환합니다. 취소되지 않은 세션을 로그아웃 성공으로 보이지 않기 위해서입니다.
- DB 에 연결할 수 없으면(서버 선택 5초 제한) 상단 메뉴는 로그아웃 상태로 표시되고(서버 로그에 고정 메시지만 남김), 데이터가 필요한 화면은 한국어 오류 화면과 **다시 시도** 버튼을 보여 줍니다. 오류 상세나 스택은 화면에 나오지 않습니다.

## 명령어

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 (http://localhost:3000) |
| `npm run build` | 프로덕션 빌드 (타입 검사 포함) |
| `npm start` | 빌드 결과 실행 |
| `npm run lint` | ESLint |
| `npm test` | Vitest: 도메인 단위 테스트, API 통합 테스트(mongodb-memory-server), 컴포넌트 테스트(Testing Library + jsdom) |
| `npm run test:e2e` | 앱을 빌드한 뒤 Playwright E2E 실행. 전역 설정이 메모리 MongoDB와 **모의 GitHub OAuth 서버**(`e2e/mock-github.ts`, 임의 포트)를 띄우고, 테스트 전용 더미 `GITHUB_CLIENT_ID/SECRET`·`APP_BASE_URL`·두 base URL 과 `ALLOW_INSECURE_OAUTH_URLS=1` 을 넣어 `next start`(포트 3123, `E2E_PORT`로 변경 가능)를 실행합니다. 실제 GitHub 계정이나 `.env.local` 의 OAuth 값은 쓰지 않습니다 |
| `npm run migrate:owner -- <github-id>` | 소유자 없는 기존 데이터를 그 GitHub 숫자 id 의 사용자에게 귀속 |

E2E를 처음 실행하기 전에 브라우저를 설치합니다.

```bash
npx playwright install chromium
```

테스트는 실제 DB가 필요 없습니다. 통합·E2E 테스트 모두 `mongodb-memory-server`가 띄운 임시 mongod를 사용합니다. CI에서 `CI=1`이면 Vitest는 `tap-flat` 리포터를 사용합니다.

## 사용 흐름

1. **관리**(`/manage`)에서 1년 목표를 만들고, 주간계획(주 시작일=월요일, 연도는 목표 연도와 같아야 함)을 목표에 연결한 뒤, 할 일을 주간계획에 연결합니다.
2. **보드**(`/`)에서 이번 주(`APP_TIMEZONE` 기준)의 모든 주간계획 할 일을 할 일 / 진행 중 / 완료 3컬럼으로 봅니다. 주간계획 필터, 요일 탭(전체·월~일), 이전/다음 주 이동, "지난 주 미완료 n건" 배지(클릭 시 이전 주)를 제공합니다.
3. 카드를 마우스/터치로 끌거나 키보드(카드에 포커스 → `Space`/`Enter`로 집기 → 방향키 → `Space`/`Enter`로 놓기, `Esc` 취소)로 옮깁니다. 화면은 즉시 바뀌고(낙관적 업데이트) 저장에 실패하면 원래 자리로 돌아가며 오류 토스트가 뜹니다.

## 삭제 정책 (tombstone)

- **삭제 = 루트 tombstone.** 삭제한 항목 문서 하나에만 `deletedAt`을 기록합니다(단일 문서 쓰기라 원자적). 하위 항목은 그대로 두고 **부모를 통해 가려집니다**: 주간계획은 자신과 목표가 활성일 때만, 할 일은 자신·주간계획·목표가 모두 활성일 때만 목록·보드·진행률에 나타납니다. 모든 조회는 `lib/repo/*`의 가시성 함수를 거칩니다.
- **삭제 전 안내.** 삭제 다이얼로그가 함께 가려질 하위 주간계획·할 일 개수를 보여 줍니다. 취소하면 아무 것도 바뀌지 않습니다. 1년 목표는 제목을 정확히 입력해야 삭제 버튼이 활성화됩니다.
- **복원 = `deletedAt` 제거.** 휴지통에서 복원하면 하위 항목이 원래 연결 그대로 돌아오고 진행률도 삭제 전과 같습니다. 따로 삭제했던 하위 항목은 휴지통에 남아 있다가 직접 복원해야 합니다. **부모가 삭제된 상태인 항목은 단독으로 복원할 수 없습니다**(409, "상위 항목을 먼저 복원하세요").
- **영구 삭제.** 휴지통 항목은 언제든 영구 삭제할 수 있으며 그 하위 항목(따로 휴지통에 있던 것 포함)도 함께 지워집니다. 되돌릴 수 없습니다.
- **30일 보관.** 삭제 후 30일이 지난 항목은 휴지통을 조회할 때 하위 항목과 함께 자동으로 영구 삭제됩니다(멱등).
- 주간계획의 주 시작일을 바꾸면 휴지통에 있는 할 일까지 같은 일수만큼 날짜가 옮겨지므로, 나중에 복원해도 주 범위를 벗어나지 않습니다.

## API 요약

| 메서드 · 경로 | 설명 |
|---------------|------|
| `GET/POST /api/goals`, `GET/PATCH/DELETE /api/goals/:id`, `GET /api/goals/:id/progress` | 1년 목표 (GET 단건은 `progress`, `descendants` 포함) |
| `GET/POST /api/weekly-plans`, `GET/PATCH/DELETE /api/weekly-plans/:id`, `GET /api/weekly-plans/:id/progress` | 주간계획 |
| `GET/POST /api/todos`, `GET/PATCH/DELETE /api/todos/:id` | 할 일 (상태는 이동 API로만 변경) |
| `PATCH /api/todos/:id/move` | `{ status, beforeId?, afterId?, seq }` — beforeId=바로 위 카드, afterId=바로 아래 카드. `seq`가 카드의 `lastSeq`보다 클 때만 반영되고, 오래된 요청은 `{ applied: false, todo }`(200) |
| `GET /api/board?week=YYYY-MM-DD&weeklyPlanId=…&day=mon…sun` | 주 단위 보드 + `previousWeekIncomplete` |
| `GET /api/trash`, `POST /api/trash/restore`, `DELETE /api/trash/:type/:id` | 휴지통 조회(만료분 퍼지), 복원, 영구 삭제 (`type`: `goal` · `weeklyPlan` · `todo`) |

모든 API 는 로그인이 필요하며 로그인한 사용자의 데이터만 다룹니다. 인증 라우트: `GET /auth/github`(GitHub 로 이동), `GET /auth/github/callback`, `POST /auth/logout`.

오류는 `{ "error": "한국어 메시지" }` 형태로 400/401/404/409를 반환합니다.
