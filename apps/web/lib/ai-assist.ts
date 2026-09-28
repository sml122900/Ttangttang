import Anthropic from "@anthropic-ai/sdk";

// 4단계 — 사진 1장으로 제목·설명·시작가 티어를 제안하는 등록 어시스트. 서버 전용
// (ANTHROPIC_API_KEY는 apps/web/.env에만 있다, apps/web/app/api/items/ai-assist/route.ts에서만
// import). 제안은 항상 편집 가능한 초안일 뿐이다 — §0 규칙 1(시작가 3택)을 사용자 대신
// 확정하지 않는다.
//
// is_item/reject_reason(2026-09-30 사용자 지적): tool_choice가 강제(type:"tool")라 모델이
// 도구 호출 자체를 거부할 수 없다. 처음엔 "물건이 아니에요"라는 문장을 title/description에
// 그대로 채우게 했는데, 사용자가 그 초안을 그대로 등록하면 그 문장이 실제 매물 제목이 돼버리는
// 문제가 있었다. 거절을 자유 텍스트가 아니라 스키마 필드(is_item)로 분리해, 호출부(apps/web
// API route·apps/mobile)가 "이건 물건이 아니다"를 안정적으로 분기할 수 있게 한다.

const SUGGEST_LISTING_TOOL: Anthropic.Tool = {
  name: "suggest_listing",
  description: "매물 사진을 보고 등록 화면에 채울 제목·설명·시작가 티어를 제안하거나, 물건 사진이 아니면 거절한다.",
  input_schema: {
    type: "object",
    properties: {
      is_item: {
        type: "boolean",
        description:
          "사진이 실제로 등록 가능한 물건이면 true. 사람 얼굴, 글씨만 있는 문서, 물건과 무관한 풍경·장소 등이면 false.",
      },
      reject_reason: {
        type: "string",
        description: "is_item이 false일 때만 채운다 — 왜 물건 사진이 아니라고 판단했는지 한 문장. is_item이 true면 빈 문자열로 둔다.",
      },
      title: {
        type: "string",
        description:
          "is_item이 true일 때만 채운다. 짧은 물건 이름. 예) '이케아 협탁, 거의 새 거'. 과장·광고 문구 금지.",
      },
      description: {
        type: "string",
        description: "is_item이 true일 때만 채운다. 상태·사용 기간을 담은 담백한 1~2문장 설명. 과장 금지.",
      },
      startPrice: {
        type: "integer",
        enum: [1000, 3000, 5000],
        description:
          "is_item이 true일 때만 채운다. 무료나눔/소액거래 시작가 티어(원) — 물건의 실제 가치가 아니라 지원서를 받기 시작하는 바닥값.",
      },
    },
    required: ["is_item"],
  },
};

const SYSTEM_PROMPT = `너는 "땅땅"이라는 한국 동네 중고나눔·소액거래 앱의 매물 등록을 돕는다.
이 서비스는 중고마켓이 아니다 — 판매자는 시작가 1,000 / 3,000 / 5,000원 중 하나만 고르고,
그 가격은 물건의 실제 가치가 아니라 지원서를 받기 시작하는 바닥값일 뿐이다(비쌀수록 나눔
성격이 옅어짐). 사진을 보고 실제로 등록 가능한 물건 사진인지 먼저 판단해라.

물건 사진이 맞으면: is_item=true로 하고, 물건이 무엇인지·상태가 어떤지 파악해 title·
description·startPrice를 채워라. 제목은 짧고 담백하게(예: "이케아 협탁, 거의 새 거"),
설명은 상태·사용감을 1~2문장으로, 광고 문구·과장된 칭찬은 쓰지 마라. 시작가는 상태와 물건
종류로 판단해 1000/3000/5000 중 하나만 골라라(고가 물건이어도 이 세 값 중에서만 고른다).

사람 얼굴, 글씨만 있는 문서·스크린샷, 물건과 무관한 풍경·장소 등 등록 가능한 물건이 아니면:
is_item=false로 하고 reject_reason에 이유를 한 문장으로 적어라. 이 경우 title/description/
startPrice는 채우지 마라 — 그 문장이 실제 매물 제목으로 등록될 수 있어서, 절대 물건이 있는
것처럼 꾸며내지 마라.

suggest_listing 도구를 반드시 호출해 결과를 반환해라.`;

export type ListingSuggestion =
  | { isItem: true; title: string; description: string; startPrice: 1000 | 3000 | 5000 }
  | { isItem: false; rejectReason: string };

// ANTHROPIC_API_BASE/ANTHROPIC_TIMEOUT_MS는 scripts/verify-stage4.mjs가 모의 Anthropic
// 서버로 타임아웃 경로를 재현할 때만 쓴다 (apps/web/lib/payments/toss.ts의 TOSS_API_BASE/
// TOSS_TIMEOUT_MS와 같은 패턴). 운영 환경에서는 비워둔다.
function timeoutMs(): number {
  const n = Number(process.env.ANTHROPIC_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 25_000; // route의 maxDuration(30s) 안에서 여유를 두고 끊는다.
}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set (server-only env, see apps/web/.env.example)");
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_API_BASE || undefined,
    timeout: timeoutMs(),
    maxRetries: 0, // 재시도가 끼면 "타임아웃 경로가 실제로 502까지 이어지는지" 테스트 타이밍이 늘어진다.
  });
}

function isValidStartPrice(value: unknown): value is 1000 | 3000 | 5000 {
  return value === 1000 || value === 3000 || value === 5000;
}

export async function suggestListingFromImage(imageBase64: string, mediaType: string): Promise<ListingSuggestion> {
  const anthropic = client();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    tools: [SUGGEST_LISTING_TOOL],
    tool_choice: { type: "tool", name: "suggest_listing" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK의 image media_type 유니온이 좁아 런타임에 감지한 값을 그대로 넣는다.
            source: { type: "base64", media_type: mediaType as any, data: imageBase64 },
          },
          { type: "text", text: "이 사진으로 등록 폼 초안을 만들어줘." },
        ],
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("모델이 제안을 만들지 못했어요");
  }
  const input = toolUse.input as Record<string, unknown>;

  if (input.is_item === false) {
    const rejectReason =
      typeof input.reject_reason === "string" && input.reject_reason.trim()
        ? input.reject_reason.trim()
        : "이 사진에서는 물건을 확인하지 못했어요";
    return { isItem: false, rejectReason };
  }
  if (input.is_item !== true) {
    throw new Error("제안 형식이 올바르지 않아요 (is_item 누락)");
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!title || !description || !isValidStartPrice(input.startPrice)) {
    throw new Error("제안 형식이 올바르지 않아요");
  }
  return { isItem: true, title, description, startPrice: input.startPrice };
}
