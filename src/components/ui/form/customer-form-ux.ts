export const CUSTOMER_FORM_HIGHLIGHT_SUMMARY =
  "Please complete the highlighted fields before continuing.";

type ValidityKind = "enter" | "select" | "check";

function cleanLabelText(raw: string): string {
  return raw.replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

function indefiniteArticle(label: string): string {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

function fieldKind(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): ValidityKind {
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

function resolveFieldLabel(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): string {
  const id = el.id;
  if (id) {
    const labelled = el.ownerDocument.querySelector(
      `label[for="${CSS.escape(id)}"]`,
    );
    if (labelled) {
      const clone = labelled.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll("input,select,textarea,button,[role='alert']")
        .forEach((node) => node.remove());
      const text = cleanLabelText(clone.textContent ?? "");
      if (text) return text;
    }
  }
  const wrappingLabel = el.closest("label");
  if (wrappingLabel) {
    const clone = wrappingLabel.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll("input,select,textarea,button,[role='alert']")
      .forEach((node) => node.remove());
    const text = cleanLabelText(clone.textContent ?? "");
    if (text) return text;
  }
  const legend = el.closest("fieldset")?.querySelector("legend");
  if (legend) {
    const text = cleanLabelText(legend.textContent ?? "");
    if (text) return text;
  }
  const name = el.getAttribute("name") ?? el.id;
  return cleanLabelText(name.replace(/[_-]+/g, " "));
}

function isPersonalLabel(label: string): boolean {
  return /name|phone|email|whatsapp/i.test(label);
}

export function humanValidityMessage(
  validity: Pick<
    ValidityState,
    "valueMissing" | "typeMismatch" | "patternMismatch"
  >,
  label: string,
  kind: ValidityKind,
): string {
  const trimmed = cleanLabelText(label) || "this field";
  const lower = trimmed.toLowerCase();
  if (validity.valueMissing) {
    if (kind === "check") {
      return `Please confirm ${lower}.`;
    }
    if (kind === "select") {
      if (trimmed.length > 48) return "Please choose an option.";
      return `Please select ${indefiniteArticle(lower)} ${lower}.`;
    }
    if (isPersonalLabel(trimmed)) {
      return `Please enter your ${lower}.`;
    }
    return `Please enter ${indefiniteArticle(lower)} ${lower}.`;
  }
  if (validity.typeMismatch && /email/i.test(trimmed)) {
    return "Please enter a valid email address.";
  }
  if (validity.typeMismatch || validity.patternMismatch) {
    return `Please enter a valid ${lower}.`;
  }
  return `Please enter a valid ${lower}.`;
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
    >("input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])"),
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
