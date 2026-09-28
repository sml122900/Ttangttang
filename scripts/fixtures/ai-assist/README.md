# AI 어시스트 테스트 이미지

`scripts/verify-stage4.mjs`가 `/api/items/ai-assist`의 실제 성공 경로와 "이상한 사진" 처리를
회귀 검증할 때 쓴다 (2026-09-29, 사용자 요청으로 실제 Claude API 응답까지 확인 후 고정).

| 파일 | 용도 | 출처 |
|---|---|---|
| `item-chair.jpg` | 실제 중고 물건 사진 — 정상 제안 경로 | Wikimedia Commons, "Office chair (4444288246).jpg" (CC BY 2.0), 480px로 축소 |
| `face.jpg` | 사람 얼굴 사진 — 매물 제안을 억지로 꾸며내지 않는지 | Wikimedia Commons, "Boy Face from Venezuela.jpg" (CC BY-SA), 480px로 축소 |
| `irrelevant.jpg` | 완전히 무관한 사진(노을) | picsum.photos 랜덤 사진, 480px |
| `text-only.png` | 글씨만 있는 이미지 | 테스트용으로 직접 생성(sharp + SVG 래스터화) |

`item-chair.jpg`/`face.jpg`는 각 라이선스에 따라 출처를 표기한다. 전부 매물 등록 화면에는
쓰이지 않는다 — 이 테스트 스크립트 안에서만 apps/web에 업로드했다가 정리(삭제)된다.
