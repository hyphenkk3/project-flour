const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTs(relativePath, aliasOverrides = {}) {
  const filename = path.resolve(relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(aliasOverrides, request)) {
      return aliasOverrides[request];
    }
    if (request.startsWith("@/")) {
      return new Proxy({}, { get: (_target, key) => function () {
        throw new Error("Unexpected dependency call in focused test: " + request + "." + String(key));
      } });
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    compiled._compile(output, filename);
  } finally {
    Module._load = originalLoad;
  }
  return compiled.exports;
}

const templateEngine = loadTs("src/engines/customer-message-templates.ts");
const messages = loadTs("src/engines/orders/messages.ts", {
  "@/engines/customer-message-templates": templateEngine,
});
const collectionReadyMessages = loadTs("src/workspaces/collection/ready-message.ts", {
  "@/engines/orders/messages": messages,
});
const whatsapp = loadTs("src/engines/orders/whatsapp.ts");

const customText = "Kindly mention the Order Name and Cake Flavour at the Hyphen counter ya 😉";
const templateEngineModule = templateEngine;
const readyPickupDefault = templateEngineModule.CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.find((row) => row.key === "ready_pickup").body;
const templates = { ready_pickup: readyPickupDefault, collection_counter_instructions: customText };
const orderText = messages.generateCustomerReadyMessage("Ari", templates);
assert.ok(orderText.includes(customText));
assert.ok(!orderText.includes("Whitebird counter"));
assert.equal(
  messages.generateCustomerReadyMessage("Ari", { ready_pickup: readyPickupDefault }),
  messages.generateCustomerReadyMessage("Ari"),
  "missing setting preserves the exact previous generated output",
);
assert.equal(
  messages.generateCustomerReadyMessage("Ari", {
    ready_pickup: readyPickupDefault,
    collection_counter_instructions: "{{invalid-placeholder}}",
  }),
  messages.generateCustomerReadyMessage("Ari"),
  "invalid setting falls back to the exact previous generated output",
);

const collectionText = collectionReadyMessages.generateCollectionReadyMessage(
  { fulfilmentMethod: "pickup", readyMessageOperatingHours: { whitebirdStatus: "open" } },
  "Ari",
  templates,
);
assert.equal(collectionText, orderText, "Order and Collection use the same saved counter instruction");
const whatsappUrl = whatsapp.buildWhatsAppDeepLink("0123456789", collectionText);
assert.ok(whatsappUrl);
assert.equal(
  new URL(whatsappUrl).searchParams.get("text"),
  orderText,
  "WhatsApp preparation keeps the generated message text unchanged",
);

console.log("Counter instruction integration passed: custom wording reaches Order, Collection and WhatsApp preparation; missing/invalid settings preserve prior output.");
