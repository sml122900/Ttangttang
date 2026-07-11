# 결제 모듈 인터페이스 분리 (PaymentGateway)

## Problem
땅땅의 핵심 결제 흐름(§3 수락=낙찰=자동결제)은 지금 토스페이먼츠 빌링으로 구현하지만,
PROJECT.md §4가 미리 경고하는 리스크가 있다: C2C 정산은 일반 PG 가맹만으로 안 되고, 토스
지급대행(서브몰) 심사가 반려되면 선불전자지급수단 라이선스를 가진 다른 사업자(예: 당근페이
인프라)로 갈아타거나, 클로즈드 베타 동안 수동 정산으로 폴백해야 할 수 있다. 결제 로직을
API 라우트 안에 직접 토스 SDK 호출로 흩어놓으면, 이 전환이 라우트 전체를 다시 쓰는 일이 된다.

## Action
`apps/web/lib/payments/`에 `PaymentGateway` 인터페이스(`issueBillingKey`, `chargeBilling`)를
정의하고, `toss.ts`가 이를 구현. 호출부(`accept` API 라우트)는
`import { paymentGateway } from "@/lib/payments"` 하나만 알고, 어떤 PG인지 전혀 모른다.
정산 방식이 바뀌면 `payments/index.ts`의 export 한 줄과 새 구현 파일만 추가하면 된다.

## Result
- 결제 게이트웨이 교체가 "인터페이스를 만족하는 새 파일 하나 + export 한 줄" 수준으로 축소됨.
- 수락 API가 결제 실패/성공 두 경로 모두 `ChargeResult`라는 판별 유니온(`ok: true | false`)만
  처리하면 되므로, 토스 특유의 에러 코드 체계가 API 레이어로 새지 않음.
- **이력서 소재**: "결제 게이트웨이를 인터페이스로 추상화해 PG사 심사 결과에 따른 교체
  리스크를 설계 단계에서 제거함."
