import assert from "node:assert/strict";
import { hasCakeWordingRequest } from "../src/engines/orders/cake-wording-note-guard.ts";

const rejected = [
  "Please write Happy Birthday Sarah on the cake",
  "happy birthday to daddy",
  "Happy Birthday Sarah",
  "Can you put Happy Birthday on the cake?",
  "wording on cake: Happy Birthday",
  "Please add Happy Anniversary",
  "蛋糕上写字：生日快乐",
  "请写生日快乐",
  "生日快乐写在蛋糕上",
];
const allowed = [
  "",
  "Please call upon arrival",
  "Pickup tomorrow around noon",
  "This cake is for my sister's birthday",
  "Happy birthday! Please include this on the greeting card",
  "No candles needed",
  "Delivery entrance at side gate",
  "Please do not write on the cake",
];
for (const note of rejected) assert.equal(hasCakeWordingRequest(note), true, `should reject: ${note}`);
for (const note of allowed) assert.equal(hasCakeWordingRequest(note), false, `should allow: ${note}`);
console.log(`Cake wording note guard: ${rejected.length + allowed.length} scenarios passed`);
