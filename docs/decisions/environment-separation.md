# dev/e2e ↔ production 환경 분리 절차

## 현재 상태 (2026-09-28)

- Supabase 프로젝트 `bacwpzlenygqnowvcvnp`("Ttangttang", ap-northeast-2/서울)는 **dev/e2e 전용**이다.
  로컬 개발, `pnpm e2e`, 실기기 테스트가 전부 이 프로젝트를 쓴다.
- 무료 플랜이라 **7일간 API 요청이 없으면 자동 일시정지**된다. 2026-07-31 이후 방치되어 실제로
  멈췄었고(2026-09-27 대시보드에서 복구) `.github/workflows/supabase-keepalive.yml`로 3일마다
  ping을 보내 재발을 막는다.
- 프로덕션 Supabase 프로젝트는 **아직 없다.** 아래 절차는 사용자가 그 프로젝트를 만들 때 따라야
  할 순서다 — 실제 생성·계정 조작은 사용자가 직접 한다.

## 프로덕션 Supabase 프로젝트를 만들 때

1. **프로젝트 생성** (대시보드 권장 — 결제 플랜 선택 UI가 명확함):
   https://supabase.com/dashboard/org/<org>/new-project. 리전은 **ap-northeast-2(서울)**로
   dev와 맞춘다(지연시간, §privacy 국외 이전 판단 근거 일관성). 무료 플랜은 dev와 같은 자동
   정지 문제를 그대로 가지므로, 면접·시연 기간에는 **Pro 플랜**(월 $25, 자동 정지 없음)으로
   올리는 걸 권장한다 — 아래 "정지 대책" 참고.
2. **CLI 링크는 dev 프로젝트를 덮어쓰지 않도록 별도 작업 디렉토리 없이 `--project-ref`로 매번
   명시**한다 (이 레포는 `supabase link` 상태를 `.git`에 커밋하지 않으므로 로컬에 남은 링크가
   실수로 prod를 가리킬 수 있다 — 명령 실행 전 `cat supabase/.temp/project-ref`로 확인 습관화):
   ```
   npx supabase link --project-ref <PROD_REF>
   ```
3. **스키마만 올린다 — 시드는 절대 올리지 않는다.**
   ```
   npx supabase db push --linked
   ```
   `db push`는 `supabase/migrations/*.sql`만 적용한다. `supabase/seed.sql`(테스트 계정·데모 매물)은
   `db push`가 건드리지 않으므로 기본적으로 안전하지만, **`supabase db reset --linked`는 스키마를
   지우고 마이그레이션+seed.sql을 처음부터 재실행한다 — prod ref에 이 명령을 실행하면 안 된다.**
   `supabase/seed.sql` 상단에 이 경고를 주석으로 남겨뒀다.
4. **Auth 설정**: 카카오 OAuth(`supabase/config.toml`의 `[auth.external.kakao]`)는 dev와 prod가
   서로 다른 Kakao 앱(다른 Redirect URI)을 쓸 수도, 같은 앱을 공유할 수도 있다 — Kakao Developers
   콘솔에서 Redirect URI에 prod Supabase의 콜백 URL(`https://<PROD_REF>.supabase.co/auth/v1/callback`)을
   추가해야 한다. `supabase/.env`(카카오 client id/secret)는 dev·prod가 같은 Kakao 앱을 쓰면 공유,
   다르면 prod 배포 시 별도로 채운다.
5. **`__DEV__` 이메일 로그인은 프로덕션 빌드에서 자동으로 빠진다** (`apps/mobile/src/app/login.tsx`,
   React Native가 프로덕션 번들에서 `__DEV__`를 `false`로 고정) — prod Supabase에 테스트 계정을
   만들 필요가 없다. 심사관 로그인은 카카오 테스트 계정으로 제공한다(§launch-audit A6).

## Vercel — 환경별 변수

apps/web은 Vercel 프로젝트 하나로 배포하고, Vercel의 **Environment**(Production/Preview/
Development) 단위로 Supabase 키를 분리한다 — 프로젝트를 두 개로 쪼개지 않는다.

| Vercel Environment | 배포 대상 | Supabase 프로젝트 | 용도 |
|---|---|---|---|
| Production | `master` 브랜치 → 운영 도메인 | prod (생성 후) | 실제 서비스, EAS `production` 프로필이 가리키는 곳 |
| Preview | 그 외 브랜치/PR | dev(`bacwpzlenygqnowvcvnp`) | PR 미리보기, 회귀 확인 |
| Development | `vercel dev`(로컬) | dev | 로컬에서 Vercel 런타임으로 웹 API 테스트 |

각 Environment에 `apps/web/.env.example`의 키를 전부 등록한다(값은 해당 Supabase 프로젝트 것으로).
prod Supabase가 아직 없으므로 **지금은 Production Environment에도 dev 키를 넣어 배포**하고,
prod 프로젝트가 생기면 Production Environment 값만 교체한다(재배포 필요, `vercel --prod`).

## EAS — 프로필별 env

`apps/mobile/eas.json`을 development/preview/production 세 프로필로 나눴다:

| 프로필 | Supabase | WEB_ORIGIN | 용도 |
|---|---|---|---|
| development | dev | Vercel Preview/Production URL(2단계 배포 후 확정) | `expo start --dev-client` |
| preview | dev | 위와 동일 | 내부테스트 APK |
| production | **`<TODO: PROD_SUPABASE_URL>`** | **`<TODO: PROD_WEB_ORIGIN>`** | 스토어 제출용 AAB |

`production` 프로필의 값은 실제 문자열이 아니라 `<TODO: ...>` 형태의 자리표시자로 커밋돼 있다 —
prod Supabase/Vercel이 준비되기 전에 이 값으로 빌드하면 즉시 알아볼 수 있게 일부러 깨뜨려 뒀다.
채울 때는 `apps/mobile/eas.json`을 직접 수정한다(시크릿이 아니라 공개 가능한 URL/publishable key라
평문 커밋이 원래 방식이었다 — 그대로 유지).

## 자동 정지 대책

1. **키프 얼라이브 (구현됨)**: `.github/workflows/supabase-keepalive.yml`이 3일마다
   `SUPABASE_URL_DEV`/`SUPABASE_ANON_KEY_DEV`로 공개 뷰(`item_public_stats`)를 조회한다.
   prod가 생기면 `SUPABASE_URL_PROD`/`SUPABASE_ANON_KEY_PROD` 시크릿을 추가하면 같은 워크플로가
   prod도 함께 ping한다(값이 없으면 그 스텝만 스킵).
2. **면접·시연 기간엔 Pro 플랜**: 자동 정지 자체가 유료 플랜(Pro 이상)에는 적용되지 않는다.
   면접 직전에 해당 기간만 prod 프로젝트를 Pro로 올렸다가, 필요 없어지면 다시 Free로 내려도 된다
   (Supabase는 플랜 다운그레이드로 데이터를 지우지 않는다 — 단 다운그레이드 후엔 다시 자동 정지
   대상이 되므로 keep-alive 워크플로는 계속 켜둘 것).
3. 두 대책은 배타적이지 않다 — keep-alive는 상시로 켜두고, Pro는 필요할 때만 쓰는 이중 안전장치로
   삼는다.

## 필요한 조치 (사용자 계정 필요, 순서대로)

```
# 1) GitHub Secrets — 저장소 Settings > Secrets and variables > Actions, 또는 gh CLI:
gh secret set SUPABASE_URL_DEV --body "https://bacwpzlenygqnowvcvnp.supabase.co"
gh secret set SUPABASE_ANON_KEY_DEV --body "<apps/web/.env의 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 값>"
# (prod 프로젝트를 만든 뒤 추가)
# gh secret set SUPABASE_URL_PROD --body "https://<PROD_REF>.supabase.co"
# gh secret set SUPABASE_ANON_KEY_PROD --body "<prod publishable key>"
```

이 파일은 dev 프로젝트가 존재하는 지금 바로 등록 가능하다. prod 관련 두 줄은 프로덕션 Supabase
프로젝트를 만든 뒤 진행한다.
