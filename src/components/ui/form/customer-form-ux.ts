export const CUSTOMER_FORM_HIGHLIGHT_SUMMARY =
  "Please complete the highlighted fields before continuing.";

type ValidityKind = "enter" | "select" | "check";

type FieldValidityCopy = {
  missing: string;
  invalid?: string;
};

const FIELD_VALIDITY_COPY: Record<string, FieldValidityCopy> = {
  customer_name: { missing: "Please enter your name." },
  wl_customer_name: { missing: "Please enter your name." },
  phone: {
    missing: "Please enter your WhatsApp number.",
    invalid: "Please enter a valid WhatsApp number.",
  },
  wl_phone: {
    missing: "Please enter your WhatsApp number.",
    invalid: "Please enter a valid WhatsApp number.",
  },
  recipient_name: { missing: "Please enter the recipient name." },
  recipient_phone: {
    missing: "Please enter the recipient phone number.",
    invalid: "Please enter a valid recipient phone number.",
  },
  email: {
    missing: "Please enter your email address.",
    invalid: "Please enter a valid email address.",
  },
  reservation_time: { missing: "Please select a reservation time." },
  dine_in_venue: { missing: "Please select a venue." },
  adult_count: { missing: "Please enter the number of adults." },
  address_line_1: { missing: "Please enter address line 1." },
  postcode: { missing: "Please enter the postcode." },
  city: { missing: "Please enter the city." },
  state: { missing: "Please enter the state." },
  include_receipt: {
    missing: "Please choose whether you would like a copy of the receipt.",
  },
  recipient_notify_preference: {
    missing: "Please choose whether we should inform the recipient.",
  },
  open_to_alternatives: { missing: "Please choose an option." },
  fulfilment_method: {
    missing: "Please choose how you would like to receive your order.",
  },
  delivery_processing_fee_ack_accepted: {
    missing:
      "Please acknowledge the RM5 delivery processing fee before submitting your order.",
  },
  price_ack_accepted: {
    missing:
      "Please confirm you accept the updated prices for your selected pickup date.",
  },
  whitebird_split_seating_acknowledged: {
    missing:
      "Please confirm you understand Whitebird seating for groups above 6 guests.",
  },
};

const LABEL_MISSING_MESSAGES: Record<string, string> = {
  name: "Please enter your name.",
  "whatsapp phone": "Please enter your WhatsApp number.",
  whatsapp: "Please enter your WhatsApp number.",
  phone: "Please enter your phone number.",
  email: "Please enter your email address.",
  adults: "Please enter the number of adults.",
  venue: "Please select a venue.",
  "recipient name": "Please enter the recipient name.",
  "recipient phone": "Please enter the recipient phone number.",
  "address line 1": "Please enter address line 1.",
  postcode: "Please enter the postcode.",
  city: "Please enter the city.",
  state: "Please enter the state.",
  "collection date": "Please select a collection date.",
  "pickup date": "Please select a pickup date.",
  "delivery date": "Please select a delivery date.",
  "dine-in date": "Please select a dine-in date.",
  "collection time": "Please select a collection time.",
  "pickup time": "Please select a pickup time.",
  "delivery time": "Please select a delivery time.",
  "dine-in reservation time": "Please select a reservation time.",
  "cake serving time": "Please select a cake serving time.",
};

function cleanLabelText(raw: string): string {
  return raw.replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

function indefiniteArticle(label: string): string {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

function fieldKind(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): ValidityKind {
  if (el instanceof HTMLSelectElement) return "select";
  if (el instanceof HTMLTextAreaElement) return "enter";
  const type = el.type;
  if (type === "checkbox") return "check";
  if (
    type === "radio" ||
    type === "date" ||
    type === "time" ||
    type === "datetime-local"
  ) {
    return "select";
  }
  return "enter";
}

function titleFromRoot(root: Element): string | null {
  const marked = root.querySelector("[data-field-label]");
  if (marked) {
    const text = cleanLabelText(marked.textContent ?? "");
    return text || null;
  }
  const clone = root.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      "input,select,textarea,button,[role='alert'],[data-field-help]",
    )
    .forEach((node) => node.remove());
  const text = cleanLabelText(clone.textContent ?? "");
  return text || null;
}

function resolveFieldLabel(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): string {
  const id = el.id;
  if (id) {
    const labelled = el.ownerDocument.querySelector(
      `label[for="${CSS.escape(id)}"]`,
    );
    const fromFor = labelled ? titleFromRoot(labelled) : null;
    if (fromFor) return fromFor;
  }
  const wrappingLabel = el.closest("label");
  const fromWrap = wrappingLabel ? titleFromRoot(wrappingLabel) : null;
  if (fromWrap) return fromWrap;
  const fieldset = el.closest("fieldset");
  if (fieldset) {
    const fromFieldset = titleFromRoot(fieldset);
    if (fromFieldset) return fromFieldset;
    const legend = fieldset.querySelector("legend");
    const fromLegend = legend ? cleanLabelText(legend.textContent ?? "") : "";
    if (fromLegend) return fromLegend;
  }
  const name = el.getAttribute("name") ?? el.id;
  return cleanLabelText(name.replace(/[_-]+/g, " "));
}

function lookupFieldCopy(
  name?: string | null,
  id?: string | null,
): FieldValidityCopy | null {
  if (name && FIELD_VALIDITY_COPY[name]) return FIELD_VALIDITY_COPY[name];
  if (id && FIELD_VALIDITY_COPY[id]) return FIELD_VALIDITY_COPY[id];
  return null;
}

function preserveKnownCapitalization(label: string): string {
  return label.replace(/\bwhatsapp\b/gi, "WhatsApp");
}

export function humanValidityMessage(
  validity: Pick<
    ValidityState,
    "valueMissing" | "typeMismatch" | "patternMismatch"
  >,
  label: string,
  kind: ValidityKind,
  fieldKey?: string | null,
): string {
  const copy = fieldKey ? lookupFieldCopy(fieldKey, fieldKey) : null;
  if (copy) {
    if (
      !validity.valueMissing &&
      (validity.typeMismatch || validity.patternMismatch) &&
      copy.invalid
    ) {
      return copy.invalid;
    }
    if (validity.valueMissing) return copy.missing;
    if (copy.invalid) return copy.invalid;
  }

  const trimmed = cleanLabelText(label) || "this field";
  const labelKey = trimmed.toLowerCase();
  if (validity.valueMissing) {
    const known = LABEL_MISSING_MESSAGES[labelKey];
    if (known) return known;
    if (kind === "check") {
      return "Please confirm this required field.";
    }
    if (kind === "select") {
      if (trimmed.length > 48) return "Please choose an option.";
      return `Please select ${indefiniteArticle(labelKey)} ${preserveKnownCapitalization(labelKey)}.`;
    }
    return `Please enter ${indefiniteArticle(labelKey)} ${preserveKnownCapitalization(labelKey)}.`;
  }
  if (validity.typeMismatch && /email/i.test(trimmed)) {
    return "Please enter a valid email address.";
  }
  if (validity.typeMismatch || validity.patternMismatch) {
    if (/whatsapp|phone/i.test(trimmed)) {
      return "Please enter a valid WhatsApp number.";
    }
    if (/email/i.test(trimmed)) {
      return "Please enter a valid email address.";
    }
    return `Please enter a valid ${preserveKnownCapitalization(labelKey)}.`;
  }
  return `Please enter a valid ${preserveKnownCapitalization(labelKey)}.`;
}

export function customerFieldValidityMessage(input: {
  name?: string;
  id?: string;
  label: string;
  kind: ValidityKind;
  validity: Pick<
    ValidityState,
    "valueMissing" | "typeMismatch" | "patternMismatch"
  >;
}): string {
  return humanValidityMessage(
    input.validity,
    input.label,
    input.kind,
    input.name ?? input.id,
  );
}

function fieldKey(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): string {
  return el.name || el.id || resolveFieldLabel(el);
}

export function collectInvalidFieldMessages(
  form: HTMLFormElement,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const controls = Array.from(form.elements).filter(
    (el): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement,
  );
  for (const el of controls) {
    if (el.disabled || el.type === "hidden" || el.type === "submit") continue;
    if (el.checkValidity()) continue;
    const key = fieldKey(el);
    if (errors[key]) continue;
    errors[key] = humanValidityMessage(
      el.validity,
      resolveFieldLabel(el),
      fieldKind(el),
      el.name || el.id,
    );
  }
  return errors;
}

export function focusFirstInvalidField(
  form: HTMLFormElement | null | undefined,
): HTMLElement | null {
  if (!form) return null;
  const candidates = Array.from(
    form.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(
      "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])",
    ),
  );
  const first =
    candidates.find((el) => !el.checkValidity()) ??
    candidates.find((el) => el.getAttribute("aria-invalid") === "true") ??
    null;
  if (!first) return null;
  first.focus({ preventScroll: true });
  first.scrollIntoView({ behavior: "smooth", block: "center" });
  return first;
}

export function focusElementById(id: string): HTMLElement | null {
  const el = document.getElementById(id);
  if (!el) return null;
  if (el instanceof HTMLElement) {
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return el;
}
