# 빌링키 발급을 서버(apps/web)가 중개하는 웹뷰 아키텍처

## Problem
토스 빌링(자동결제) 카드 등록은 토스가 호스팅하는 카드 등록 화면으로 리다이렉트했다가
`authKey`를 콜백으로 돌려주는 방식이다. 이 `authKey`를 실제 `billingKey`로 교환하려면
토스 시크릿 키(`test_sk_...`)로 서버 인증된 API 호출이 필요한데, 모바일 앱(클라이언트)에는
시크릿 키를 절대 둘 수 없다 (§0 규칙과 무관하게 일반적인 PG 보안 요구사항). 동시에 발급된
빌링키 원문도 클라이언트에 노출되면 `billing_keys` 테이블을 서비스 롤 전용으로 잠가둔 의미가
없어진다.

## Action
카드 등록 콜백을 모바일이 아니라 `apps/web`이 받게 설계했다:
1. 모바일이 `expo-web-browser`로 `apps/web`의 `/pay/billing-auth` 페이지를 열고 자기
   `customerKey`(=profiles.id)와 `clientRedirect`(자신의 딥링크)를 쿼리로 넘긴다.
2. 그 페이지가 토스 SDK로 토스 호스팅 카드등록 화면으로 이동시킨다.
3. 토스가 `authKey`를 들고 `apps/web`의 `/api/billing/callback`(서버 전용, secret key 보유)로
   리다이렉트하면, 거기서 `billingKey`를 발급받아 service_role 클라이언트로 `billing_keys`에
   저장하고, 모바일이 넘겼던 `clientRedirect`로 되돌려보낸다.
4. 모바일은 `billingKey` 원문을 한 번도 보지 않고, 성공/실패 여부만 안다.

## Result
- 시크릿 키와 빌링키 원문 둘 다 클라이언트 번들·메모리에 존재하지 않는 구조를 달성.
- `has_billing_key()` RPC(boolean)만이 클라이언트가 "카드 등록 여부"를 알 수 있는 유일한
  통로라는 기존 DB 설계(Phase 1)와 대칭을 이룸 — 서버 경계가 DB 레이어와 웹 레이어에서
  일관되게 지켜짐.
- **이력서 소재**: "결제 자격증명이 클라이언트에 닿지 않도록 서버 중개형 웹뷰 콜백 아키텍처를
  설계해 시크릿 키/빌링키 노출 경로를 원천 차단함."
