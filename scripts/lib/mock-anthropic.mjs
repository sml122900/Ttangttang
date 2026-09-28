// e2e 전용 모의 Anthropic 서버. apps/web을 ANTHROPIC_API_BASE=http://127.0.0.1:<port>로 띄우면
// lib/ai-assist.ts의 실제 코드(타임아웃 설정 포함)가 이 서버를 상대로 돈다. 지금은 "타임아웃"
// 경로 하나만 재현한다 — 성공/이상한 사진 케이스는 진짜 Anthropic API로 검증한다
// (scripts/verify-stage4.mjs 주석 참고, 모델이 실제로 뭐라 답하는지가 검증 대상이라 모킹하면
// 의미가 없다).
import http from "node:http";

export function startMockAnthropic(port) {
  const hanging = new Set();

  const server = http.createServer((req, res) => {
    // POST /v1/messages 요청을 절대 응답하지 않고 붙잡아둔다 — 클라이언트의 timeout이
    // 실제로 끊어질 때까지 기다리게 한다.
    hanging.add(res);
    res.on("close", () => hanging.delete(res));
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((r) => {
            for (const res of hanging) res.socket?.destroy();
            server.closeAllConnections();
            server.close(() => r());
          }),
      });
    });
  });
}
