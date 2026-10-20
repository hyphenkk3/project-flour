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
  validateCustomerMessageTemplateBody,
} = engineModule.exports;

const fixturePath = path.resolve("src/engines/customer-message-template-defaults.fixture.json");
const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
assert.equal(CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.length, 19, "all approved template variants must exist");
assert.equal(new Set(CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.map((item) => item.category)).size, 8, "all eight categories must exist");
assert.deepEqual(
  CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.map((item) => item.key),
  fixtures.map((item) => item.key),
  "stable keys and fixture order must remain unchanged",
);

for (const definition of CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS) {
  const fixture = fixtures.find((item) => item.key === definition.key);
  assert.ok(fixture, `missing fixture for ${definition.key}`);
  assert.equal(definition.category, fixture.category, `category changed for ${definition.key}`);
  assert.equal(definition.body, fixture.body, `captured source default changed for ${definition.key}`);
  assert.deepEqual(definition.allowed, fixture.allowed, `allowed placeholders changed for ${definition.key}`);
  assert.deepEqual(definition.required, fixture.required, `required placeholders changed for ${definition.key}`);
  assert.deepEqual(validateCustomerMessageTemplateBody(definition.key, definition.body), { valid: true });
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

console.log("Customer message template validation, default fixtures, optional sections and safe fallback tests passed (19 templates, 8 categories).");
