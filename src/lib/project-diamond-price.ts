import { z } from "zod";

// Matches the PostgreSQL INTEGER range used by both project tables.
export const maxProjectDiamondPrice = 2_147_483_647;
export const projectDiamondPriceSchema = z.number().int().min(0).max(maxProjectDiamondPrice);

export const setProjectDiamondPriceSchema = z.object({
  kind: z.enum(["ai", "official"]),
  id: z.string().trim().min(1).max(120),
  diamondPrice: projectDiamondPriceSchema
});

export type ProjectDiamondPriceKind = z.infer<typeof setProjectDiamondPriceSchema>["kind"];

export function formatProjectDiamondPrice(diamondPrice: number) {
  return diamondPrice === 0 ? "免费" : `${diamondPrice} 钻石`;
}
