/**
 * Customer-facing preorder note guard. Only reject clear requests for writing
 * on cakes; notes about pickup, delivery and other legitimate requests remain allowed.
 * Shared by the checkout UI and server action to prevent bypass.
 */
export const CAKE_WORDING_REQUEST_ERROR =
  "We're sorry, but we don't provide personalised writing on cakes. Please remove the cake wording request from your notes before continuing.";

export function hasCakeWordingRequest(note: string): boolean {
  const text = note.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return false;
  const direct = [
    /\b(?:write|writing|written|wording|inscribe|inscription|lettering|spell)\b.{0,75}\b(?:cake|top|icing|frosting|words?|name|message|birthday|anniversary)\b/i,
    /\b(?:cake|icing|frosting)\b.{0,75}\b(?:write|writing|written|wording|inscribe|inscription|lettering)\b/i,
    /\b(?:put|add|print|include)\b.{0,40}\b(?:happy birthday|happy anniversary|congratulations|congrats)\b/i,
    /\b(?:happy birthday|happy anniversary|congratulations|congrats)\b.{0,45}\b(?:on|onto|upon|atop)\b.{0,25}\b(?:cake|top|icing)\b/i,
    /(?:蛋糕|糕上|cake).{0,18}(?:写字|寫字|写上|寫上|题字|題字|刻字|字样|字樣)/,
    /(?:写字|寫字|写上|寫上|题字|題字|刻字|字样|字樣).{0,18}(?:蛋糕|糕上|cake)/,
    /(?:请写|請寫|帮我写|幫我寫|写上|寫上).{0,18}(?:生日快乐|生日快樂|生日|名字|名称|名稱)/,
    /(?:生日快乐|生日快樂).{0,18}(?:写|寫|字|蛋糕)/,
  ];
  return direct.some((pattern) => pattern.test(text));
}
