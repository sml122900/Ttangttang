# GoTrue Admin API로 만든 테스트 유저의 한글 닉네임이 깨짐

## 문제상황
실기기 E2E 테스트용 판매자/구매자 계정을 GoTrue Admin API(`POST /auth/v1/admin/users`)로
직접 생성하면서, `user_metadata.nickname`에 한글("땅땅테스트판매자" 등)을 curl의 `-d` JSON
바디에 실어 보냈다. `handle_new_user` 트리거가 `profiles.nickname`을 잘 채우긴 했는데,
DB에서 다시 조회해보니 닉네임이 `�����׽�Ʈ�Ǹ���`처럼 깨져 있었다. 같은 트리거가 채운
`neighborhood`("동네 미설정", SQL 문자열 리터럴로 마이그레이션 파일에 직접 박혀 있던 값)는
멀쩡했다는 게 단서였다.

## 시도한 것들
1. DB 자체 손상(콜레이션/인코딩 설정)을 의심 — 하지만 `neighborhood` 컬럼의 한글이 멀쩡한 걸
   보고 DB 레벨 문제는 아니라고 판단.
2. `supabase db query --linked`로 같은 세션에서 한글 리터럴을 담은 SQL을 직접 실행 — 이 경로로
   넣은 한글은 정상적으로 저장/조회됨을 확인. → 손상 지점이 "curl 명령을 만드는 bash 프로세스"
   쪽으로 좁혀짐.
3. Windows Git Bash 환경에서 curl의 `-d` 인자로 전달되는 멀티바이트 UTF-8 문자열이, 셸/도구
   경계를 넘는 과정에서 바이트 단위로 깨질 수 있다는 결론.

## 최종 해결법
근본 원인(셸 인코딩 경계)을 파고들기보다, 이미 확인된 안전한 경로(`supabase db query
--linked`로 직접 SQL 실행)로 우회: 깨진 두 유저의 `profiles.nickname`을 정상적인 한글 리터럴을
담은 `UPDATE` 문으로 덮어써서 즉시 해결하고, 이후에도 한글이 포함된 값은 curl JSON payload가
아니라 SQL 경로로 넣기로 함.

## 이력서 소재
"외부 API 호출 경로의 인코딩 손상을 DB/트리거 문제와 구분해 원인을 좁혀내고, 검증된 대체
경로(직접 SQL)로 우회 처리함."
