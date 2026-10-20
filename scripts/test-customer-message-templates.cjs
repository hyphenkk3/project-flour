const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const enginePath = path.resolve("src/engines/customer-message-templates.ts");
const source = fs.readFileSync(enginePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const engineModule = new Module(enginePath, module);
engineModule.filename = enginePath;
engineModule.paths = module.paths;
engineModule._compile(compiled, enginePath);

const {
  CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS,
  renderCustomerMessageTemplate,
  renderCustomerMessagePreview,
  resolveCollectionCounterInstructions,
  validateCustomerMessageTemplateBody,
} = engineModule.exports;

const fixturePath = path.resolve("src/engines/customer-message-template-defaults.fixture.json");
const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
assert.equal(CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.length, 20, "19 message templates and the counter-instructions setting must exist");
assert.equal(fixtures.length, 19, "the original 19 default message fixtures remain unchanged");
assert.equal(new Set(CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.map((item) => item.category)).size, 8, "all eight categories must exist");
assert.deepEqual(
  CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.filter((item) => item.key !== "collection_counter_instructions").map((item) => item.key),
  fixtures.map((item) => item.key),
  "stable keys and fixture order must remain unchanged",
);

for (const definition of CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS) {
  assert.deepEqual(validateCustomerMessageTemplateBody(definition.key, definition.body), { valid: true });
  if (definition.key === "collection_counter_instructions") {
    assert.equal(definition.displayName, "Collection Counter Instructions");
    assert.equal(definition.body, "Kindly mention the Order Name and Cake Flavour at the Whitebird counter ya 😉");
    assert.deepEqual(definition.allowed, []);
    assert.deepEqual(definition.required, []);
    assert.equal(renderCustomerMessagePreview(definition.key, definition.body), definition.body);
    continue;
  }
  const fixture = fixtures.find((item) => item.key === definition.key);
  assert.ok(fixture, `missing fixture for ${definition.key}`);
  assert.equal(definition.category, fixture.category, `category changed for ${definition.key}`);
  assert.equal(definition.body, fixture.body, `captured source default changed for ${definition.key}`);
  assert.deepEqual(definition.allowed, fixture.allowed, `allowed placeholders changed for ${definition.key}`);
  assert.deepEqual(definition.required, fixture.required, `required placeholders changed for ${definition.key}`);
  const rendered = renderCustomerMessagePreview(definition.key, definition.body);
  assert.ok(rendered.trim(), `default preview is empty for ${definition.key}`);
  const fallback = "EXACT LEGACY FALLBACK";
  assert.equal(renderCustomerMessageTemplate(definition.key, {}, definition.sample, fallback), fallback);
  assert.equal(
    renderCustomerMessageTemplate(definition.key, { [definition.key]: definition.body }, definition.sample, fallback),
    rendered,
    `default template rendering failed for ${definition.key}`,
  );
}

for (const definition of CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS) {
  for (const token of definition.required) {
    const omitted = definition.body.replace(`{{${token}}}`, "");
    assert.equal(
      validateCustomerMessageTemplateBody(definition.key, omitted).valid,
      false,
      `required block ${token} must be protected for ${definition.key}`,
    );
  }
  for (const token of definition.allowed.filter((item) => !definition.required.includes(item))) {
    const omitted = definition.body.replace(`{{${token}}}`, "");
    assert.equal(
      validateCustomerMessageTemplateBody(definition.key, omitted).valid,
      true,
      `optional block ${token} should be removable for ${definition.key}`,
    );
  }
}

const sample = CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS[0];
assert.equal(validateCustomerMessageTemplateBody(sample.key, sample.body.replace("{{order_details}}", "{{missing_block}}")).valid, false);
assert.equal(validateCustomerMessageTemplateBody(sample.key, sample.body + "{{broken").valid, false);
assert.equal(validateCustomerMessageTemplateBody(sample.key, sample.body.replace("{{staff_name}}", "")).valid, false);
assert.equal(validateCustomerMessageTemplateBody(sample.key, sample.body + "\\nSUPABASE_SERVICE_ROLE_KEY").valid, false);
assert.equal(renderCustomerMessageTemplate(sample.key, { [sample.key]: sample.body }, {}, "LEGACY FALLBACK"), "LEGACY FALLBACK");

const readyPickup = CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.find((item) => item.key === "ready_pickup");
assert.ok(readyPickup);
assert.ok(readyPickup.required.includes("counter_instruction"));
assert.ok(!readyPickup.allowed.includes("counter_instructions"));
const savedCounterText = "Kindly mention the Order Name and Cake Flavour at the Hyphen counter ya 😉";
const readyPickupPreview = renderCustomerMessagePreview("ready_pickup", readyPickup.body, {
  ready_pickup: readyPickup.body,
  collection_counter_instructions: savedCounterText,
});
assert.ok(readyPickupPreview.includes(savedCounterText), "Ready for Pickup preview uses saved counter wording");
assert.ok(!readyPickupPreview.includes("Whitebird counter"), "preview replaces only the configured counter instruction");
assert.equal(resolveCollectionCounterInstructions(), "Kindly mention the Order Name and Cake Flavour at the Whitebird counter ya 😉");
assert.equal(resolveCollectionCounterInstructions({ collection_counter_instructions: "  " }), "Kindly mention the Order Name and Cake Flavour at the Whitebird counter ya 😉");
assert.equal(resolveCollectionCounterInstructions({ collection_counter_instructions: "{{unknown}}" }), "Kindly mention the Order Name and Cake Flavour at the Whitebird counter ya 😉");
assert.equal(
  renderCustomerMessagePreview("ready_pickup", readyPickup.body, { ready_pickup: readyPickup.body }),
  renderCustomerMessagePreview("ready_pickup", readyPickup.body),
  "missing setting falls back to the exact preserved default wording",
);
console.log("Customer template compatibility passed (19 original fixtures unchanged; counter instruction setting validates, previews and falls back safely).");
