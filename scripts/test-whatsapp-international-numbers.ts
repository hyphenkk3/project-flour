import assert from "node:assert/strict";
import {
  buildWhatsAppDeepLink,
  normalizeMalaysiaWhatsAppPhone,
} from "@/engines/orders/whatsapp";

const cases: Array<[string, string]> = [
  ["0123456789", "60123456789"],
  ["60123456789", "60123456789"],
  ["6596230653", "6596230653"],
  ["+6596230653", "6596230653"],
  ["+60 12-345 6789", "60123456789"],
  ["+44 7911 123456", "447911123456"],
  ["447911123456", "447911123456"],
  ["+81 90 1234 5678", "819012345678"],
  ["819012345678", "819012345678"],
  ["+1 (415) 555-2671", "14155552671"],
];

for (const [input, expected] of cases) {
  assert.equal(normalizeMalaysiaWhatsAppPhone(input), expected, input);
}

assert.equal(normalizeMalaysiaWhatsAppPhone("not a phone"), null);
assert.equal(normalizeMalaysiaWhatsAppPhone("12345"), null);
assert.equal(normalizeMalaysiaWhatsAppPhone("+65+96230653"), null);

const singaporeUrl = buildWhatsAppDeepLink("6596230653", "Pickup details");
assert.equal(singaporeUrl, "https://wa.me/6596230653?text=Pickup%20details");
assert.equal(
  buildWhatsAppDeepLink("0123456789", "Pickup details"),
  "https://wa.me/60123456789?text=Pickup%20details",
);

console.log(`${cases.length} international phone cases passed.`);
