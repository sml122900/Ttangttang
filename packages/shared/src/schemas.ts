import { z } from "zod";
import { START_PRICES } from "@ttangttang/tokens";

export const startPriceSchema = z.union([
  z.literal(START_PRICES[0]),
  z.literal(START_PRICES[1]),
  z.literal(START_PRICES[2]),
]);

// 등록 — §0 규칙 1: 시작가는 3택 고정, 그 외 값은 절대 허용하지 않는다.
// pickupSlots: 판매자가 실제 가능한 방문 시간을 1~4개 자유 텍스트로 입력 (§2/§6).
export const postItemInputSchema = z.object({
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(1000),
  startPrice: startPriceSchema,
  photos: z.array(z.string().url()).max(5).default([]),
  neighborhood: z.string().trim().min(1).max(40),
  pickupSlots: z.array(z.string().trim().min(1).max(40)).min(1).max(4),
  applyDeadline: z.string().datetime().nullable().optional(),
});
export type PostItemInput = z.infer<typeof postItemInputSchema>;

// 지원서 — §0 규칙 2: 제시가 + 방문 가능 시간 + 한 줄 메시지, 30초 안에 작성 가능해야 한다.
export const applicationInputSchema = z.object({
  offerPrice: z.number().int().positive(),
  visitTime: z.string().trim().min(1).max(40),
  message: z.string().trim().max(80).optional(),
});
export type ApplicationInput = z.infer<typeof applicationInputSchema>;

/** offerPrice는 매물의 startPrice 이상이어야 한다 (§2: "시작가 이상 자유"). API에서 반드시 검증. */
export function isValidOffer(offerPrice: number, startPrice: number): boolean {
  return Number.isInteger(offerPrice) && offerPrice >= startPrice;
}
