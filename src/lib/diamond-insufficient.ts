export const diamondInsufficientMessage = "钻石不足，联系客服充值后再试！";

const legacyDiamondInsufficientMessages = new Set([
  diamondInsufficientMessage,
  "钻石不足，请充值后再试。"
]);

export function isDiamondInsufficientMessage(value: unknown): value is string {
  return typeof value === "string" && legacyDiamondInsufficientMessages.has(value.trim());
}
