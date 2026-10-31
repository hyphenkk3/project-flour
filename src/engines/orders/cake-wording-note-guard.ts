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
  if (/\b(?:do not|don\x27t|dont|no|without)\s+(?:write|writing|wording|words?|message)\b.{0,35}\b(?:cake|icing|top)\b/i.test(text)) return false;
  // A standalone birthday greeting in the order notes is usually a request
  // for cake lettering, even without the words "write on cake".
  // Do not flag a greeting explicitly directed to a greeting/wishing card.
  const cardContext = /\b(?:birthday|greeting|wishing)\s+card\b|\bon\s+(?:the\s+)?card\b/i.test(text);
  if (!cardContext && /^(?:please\s+)?(?:happy\s+(?:birthday|anniversary)|congratulations|congrats)\b(?:[\s!,.:—-]+|$)/i.test(text)) return true;
  if (!cardContext && /^(?:生日快乐|生日快樂|祝你生日快乐|祝你生日快樂|生日快樂呀|生日快乐呀)/.test(text)) return true;
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


/** A greeting without clear instructions may be an inscription; ask, don't assume. */
export function hasPossibleCakeWording(note: string): boolean {
  const text = note.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text || hasCakeWordingRequest(text)) return false;
  if (/\b(?:greeting|birthday|wishing)\s+card\b|\bon\s+(?:the\s+)?card\b/i.test(text)) return false;
  if (/\b(?:please|kindly)\s+(?:call|contact|deliver|leave|prepare|collect|keep|arrange)\b/i.test(text)) return false;
  // Common inscription shorthand, including "happy bday boyfriend".
  if (/\\b(?:hbd|happy\\s+(?:b[ -]?day|bday|bdy|bdae|birtday)|b[ -]?day\\s+(?:boy|girl|boyfriend|girlfriend|babe|dad|mom)|birthday\\s+(?:boy|girl|boyfriend|girlfriend))\\b/i.test(text)) return true;
  return /\b(?:wish(?:ing)?\s+(?:you|u)|all\s+the\s+best|birthday\s+(?:boy|girl)|best\s+wishes|many\s+happy\s+returns|congratulations|congrats|happy\s+(?:birthday|anniversary)|dear\s+\w+)\b/i.test(text) ||
    /(?:祝你|祝您|生日快乐|生日快樂|一切顺利|一切順利|祝福|恭喜|万事如意|萬事如意)/.test(text);
}

export const POSSIBLE_CAKE_WORDING_MESSAGE =
  "Just checking — if this is a message you'd like written on the cake, please remove it, as we don't offer cake wording. If it's simply additional information, you may keep it and confirm below.";
