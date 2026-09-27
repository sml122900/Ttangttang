import Anthropic from "@anthropic-ai/sdk";

// 4단계 — 사진 1장으로 제목·설명·시작가 티어를 제안하는 등록 어시스트. 서버 전용
// (ANTHROPIC_API_KEY는 apps/web/.env에만 있다, apps/web/app/api/items/ai-assist/route.ts에서만
// import). 제안은 항상 편집 가능한 초안일 뿐이다 — §0 규칙 1(시작가 3택)을 사용자 대신
// 확정하지 않는다.

const SUGGEST_LISTING_TOOL: Anthropic.Tool = {
  name: "suggest_listing",
  description: "매물 사진을 보고 등록 화면에 채울 제목·설명·시작가 티어를 제안한다.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "짧은 물건 이름. 예) '이케아 협탁, 거의 새 거'. 과장·광고 문구 금지.",
      },
      description: {
        type: "string",
        description: "상태·사용 기간을 담은 담백한 1~2문장 설명. 과장 금지.",
      },
      startPrice: {
        type: "integer",
        enum: [1000, 3000, 5000],
        description: "무료나눔/소액거래 시작가 티어(원) — 물건의 실제 가치가 아니라 지원서를 받기 시작하는 바닥값.",
      },
    },
    required: ["title", "description", "startPrice"],
  },
};

const SYSTEM_PROMPT = `너는 "땅땅"이라는 한국 동네 중고나눔·소액거래 앱의 매물 등록을 돕는다.
이 서비스는 중고마켓이 아니다 — 판매자는 시작가 1,000 / 3,000 / 5,000원 중 하나만 고르고,
그 가격은 물건의 실제 가치가 아니라 지원서를 받기 시작하는 바닥값일 뿐이다(비쌀수록 나눔
성격이 옅어짐). 사진을 보고 물건이 무엇인지, 상태가 어떤지 파악해서 등록 폼 초안을 제안해라.
제목은 짧고 담백하게(예: "이케아 협탁, 거의 새 거"), 설명은 상태·사용감을 1~2문장으로,
광고 문구·과장된 칭찬은 쓰지 마라. 시작가는 상태와 물건 종류로 판단해 1000/3000/5000 중
하나만 골라라(고가 물건이어도 이 세 값 중에서만 고른다). suggest_listing 도구를 반드시 호출해
결과를 반환해라.`;

export interface ListingSuggestion {
  title: string;
  description: string;
  startPrice: 1000 | 3000 | 5000;
}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set (server-only env, see apps/web/.env.example)");
  }
  return new Anthropic({ apiKey });
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
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!title || !description || !isValidStartPrice(input.startPrice)) {
    throw new Error("제안 형식이 올바르지 않아요");
  }
  return { title, description, startPrice: input.startPrice };
}
