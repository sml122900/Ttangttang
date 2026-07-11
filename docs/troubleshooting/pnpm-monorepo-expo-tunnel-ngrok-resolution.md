# pnpm 모노레포에서 `expo start --tunnel`이 `@expo/ngrok`을 못 찾음

## 문제상황
`npx expo start --tunnel`을 실행하면 "The package @expo/ngrok@^4.1.0 is required to use
tunnels, would you like to install it globally?"라는 대화형 프롬프트가 뜨고, 비대화형
(non-interactive) 셸에서는 그대로 실패했다. 프롬프트가 시키는 대로 `npm install -g
@expo/ngrok`을 실행해 전역 설치를 확인(`npm root -g` 경로에 실제로 폴더가 존재)했는데도,
Expo CLI는 여전히 같은 프롬프트를 다시 띄웠다.

## 시도한 것들
1. `npm install -g @expo/ngrok@^4.1.0` — 설치는 성공(`AppData/Roaming/npm/node_modules/@expo/ngrok`
   존재 확인)했지만 Expo CLI는 여전히 못 찾음.
2. 전역 설치 경로(`npm root -g`)와 실제 폴더 존재를 재확인 — 패키지 자체는 멀쩡히 있었음.
3. Expo CLI가 전역 npm prefix가 아니라 **프로젝트 디렉터리 기준 모듈 해석(resolveFrom)**으로
   `@expo/ngrok`을 찾는다는 데 생각이 미침 — pnpm은 npm/yarn classic과 달리 임의의 전역
   설치를 프로젝트의 `node_modules`에 자동으로 노출시키지 않는다(strict node_modules).

## 최종 해결법
전역 설치 대신 `apps/mobile`에 devDependency로 직접 추가:
```
pnpm add -D @expo/ngrok@^4.1.0
```
pnpm이 워크스페이스 규칙대로 이걸 `apps/mobile`의 의존성 그래프에 정상 링크하자, Expo CLI의
프로젝트-상대 모듈 해석이 곧바로 찾아냈고 터널이 정상적으로 붙었다.

## 이력서 소재
"pnpm의 엄격한 node_modules 격리 때문에 Expo CLI의 전역 패키지 자동설치 흐름이 깨지는 것을
분석해, 전역 설치 대신 워크스페이스 devDependency로 전환하는 방식으로 해결함."
