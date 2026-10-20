"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS,
  renderCustomerMessagePreview,
  validateCustomerMessageTemplateBody,
  type CustomerMessageTemplateKey,
} from "@/engines/customer-message-templates";
import { invalidateCustomerMessageTemplates } from "@/engines/customer-message-templates-client";
import {
  getCustomerMessageTemplateRevisionsAction,
  resetCustomerMessageTemplateAction,
  restoreCustomerMessageTemplateRevisionAction,
  saveCustomerMessageTemplateAction,
} from "@/app/(app)/settings/customer-message-templates/actions";

export type EditableTemplate = {
  template_key: CustomerMessageTemplateKey;
  display_name: string;
  category: string;
  description: string;
  body: string;
  default_body: string;
  allowed_placeholders: string[];
  required_placeholders: string[];
  revision: number;
  updated_at: string | null;
};

type RevisionRow = {
  revision: number;
  action: string;
  previous_body: string | null;
  new_body: string;
  actor_display_name: string;
  created_at: string;
};

export function CustomerMessageTemplatesEditor({
  initialTemplates,
  migrationReady,
}: {
  initialTemplates: EditableTemplate[];
  migrationReady: boolean;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedKey, setSelectedKey] = useState<CustomerMessageTemplateKey>(
    initialTemplates[0]?.template_key ?? CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS[0].key,
  );
  const [draft, setDraft] = useState(initialTemplates[0]?.body ?? "");
  const [history, setHistory] = useState<{ key: string; revisions: RevisionRow[] }>({ key: "", revisions: [] });
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [mobileEditor, setMobileEditor] = useState(false);
  const [discardBackPrompt, setDiscardBackPrompt] = useState(false);
  const [comparisonRevision, setComparisonRevision] = useState<number | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const selected = templates.find((row) => row.template_key === selectedKey);
  const historyKey = `${selectedKey}:${selected?.revision ?? 0}`;
  const historyLoading = history.key !== historyKey;
  const revisions = historyLoading ? [] : history.revisions;
  const selectedDefinition = CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.find((row) => row.key === selectedKey);
  const validation = validateCustomerMessageTemplateBody(selectedKey, draft);
  const preview = useMemo(
    () => renderCustomerMessagePreview(selectedKey, draft),
    [selectedKey, draft],
  );
  const dirty = Boolean(selected && draft !== selected.body);
  const grouped = useMemo(() => {
    const categories = [...new Set(CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.map((item) => item.category))];
    const q = query.trim().toLocaleLowerCase();
    return categories.flatMap((category) => {
      const rows = templates.filter((row) => row.category === category);
      const matches = q ? (category.toLocaleLowerCase().includes(q) ? rows : rows.filter((row) => row.display_name.toLocaleLowerCase().includes(q))) : rows;
      return matches.length ? [{ category, rows: matches, total: rows.length }] : [];
    });
  }, [templates, query]);

  useEffect(() => {
    let live = true;
    const key = `${selectedKey}:${selected?.revision ?? 0}`;
    void getCustomerMessageTemplateRevisionsAction(selectedKey).then((result) => {
      if (!live) return;
      setHistory({ key, revisions: result.ok ? result.revisions as RevisionRow[] : [] });
    });
    return () => { live = false; };
  }, [selectedKey, selected?.revision]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function selectTemplate(key: CustomerMessageTemplateKey) {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    const next = templates.find((row) => row.template_key === key);
    if (!next) return;
    setSelectedKey(key);
    setDraft(next.body);
    setNotice("");
    setDiscardBackPrompt(false);
  }

  function applyResult(message: string) {
    setNotice(message);
  }

  function updateAfterWrite() {
    invalidateCustomerMessageTemplates();
    router.refresh();
    const current = templates.find((row) => row.template_key === selectedKey);
    if (current) {
      setTemplates((rows) => rows.map((row) => row.template_key === selectedKey
        ? { ...row, body: draft, revision: row.revision + 1, updated_at: new Date().toISOString() }
        : row));
    }
    setNotice("Saved. Newly prepared messages will use this wording.");
  }

  function save() {
    if (!selected || !validation.valid) return;
    startTransition(async () => {
      const result = await saveCustomerMessageTemplateAction({
        templateKey: selectedKey,
        body: draft,
        expectedRevision: selected.revision,
      });
      if (!result.ok) {
        applyResult(result.error);
        return;
      }
      updateAfterWrite();
    });
  }

  function resetDefault() {
    if (!selected || !window.confirm("Reset this message to Whitebird’s original wording?")) return;
    startTransition(async () => {
      const result = await resetCustomerMessageTemplateAction({
        templateKey: selectedKey,
        expectedRevision: selected.revision,
      });
      if (!result.ok) {
        applyResult(result.error);
        return;
      }
      const defaultBody = selected.default_body;
      setDraft(defaultBody);
      setTemplates((rows) => rows.map((row) => row.template_key === selectedKey
        ? { ...row, body: defaultBody, revision: row.revision + 1, updated_at: new Date().toISOString() }
        : row));
      invalidateCustomerMessageTemplates();
      router.refresh();
      applyResult("Original wording restored.");
    });
  }

  function restoreRevision(revision: number) {
    if (!selected || !window.confirm(`Restore revision ${revision}? This will be recorded as a new revision.`)) return;
    startTransition(async () => {
      const result = await restoreCustomerMessageTemplateRevisionAction({
        templateKey: selectedKey,
        revision,
        expectedRevision: selected.revision,
      });
      if (!result.ok) {
        applyResult(result.error);
        return;
      }
      const row = revisions.find((item) => item.revision === revision);
      if (!row) return;
      setDraft(row.new_body);
      setTemplates((rows) => rows.map((item) => item.template_key === selectedKey
        ? { ...item, body: row.new_body, revision: item.revision + 1, updated_at: new Date().toISOString() }
        : item));
      invalidateCustomerMessageTemplates();
      router.refresh();
      applyResult(`Revision ${revision} restored.`);
    });
  }

  function insertPlaceholder(token: string) {
    const area = document.getElementById("customer-message-template-body") as HTMLTextAreaElement | null;
    const insertion = `{{${token}}}`;
    const start = area?.selectionStart ?? draft.length;
    const end = area?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + insertion + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + insertion.length, start + insertion.length);
    });
  }

  useEffect(() => {
    const area = bodyRef.current;
    if (!area) return;
    const frame = requestAnimationFrame(() => {
      area.style.height = "auto";
      const contentHeight = area.scrollHeight;
      const nextHeight = Math.min(Math.max(contentHeight, 128), 520);
      area.style.height = nextHeight + "px";
      area.style.overflowY = contentHeight > 520 ? "auto" : "hidden";
    });
    return () => cancelAnimationFrame(frame);
  }, [draft, selectedKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const guardNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest("a");
      if (link?.origin !== window.location.origin) return;
      const destination = new URL(link.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardNavigation, true);
    };
  }, [dirty]);

  function variableName(token: string) {
    const names: Record<string, string> = {
      staff_name: "Staff Name", sender_name: "Staff Name", customer_name: "Customer Name",
      ready_notice: "Ready Status", recipient_instructions: "Recipient Contact Instructions",
      order_details: "Order and Fulfilment Details", amount_block: "Amount and Balance",
      payment_instruction: "Payment Instructions", payment_instructions: "Payment Instructions",
      payment_destination: "Payment Account Details", slip_instruction: "Payment Slip Instructions",
      pickup_hours: "Pickup Hours", counter_instruction: "Collection Counter Instructions",
      grabexpress_instruction: "GrabExpress Instructions", car_plate_instruction: "Car Plate Instructions",
      closing_remarks: "Closing Remarks", confirmation_url: "Confirmation Link",
      confirmation_deadline: "Confirmation Deadline", pickup_date: "Pickup Date", item_details: "Item Details",
      ready_line: "Ready Status", ready_status: "Ready Status", call_instruction: "Call Instructions",
      missed_call_remarks: "Missed Call Remarks", scheduled_delivery_line: "Scheduled Delivery Details",
      earlier_delivery_invitation: "Earlier Delivery Invitation", scheduled_delivery_instruction: "Delivery Schedule",
      recipient_contact_instruction: "Recipient Contact Instructions", item_lines: "Item Details",
      confirmation_link_instruction: "Confirmation Link Instructions", expiry_instruction: "Expiry Instructions",
    };
    return names[token] ?? token.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  }

  function malaysiaDate(value: string) {
    return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function revisionDiff(before: string | null, after: string) {
    const oldLines = (before ?? "").split("\n");
    const newLines = after.split("\n");
    let first = 0;
    while (first < oldLines.length && first < newLines.length && oldLines[first] === newLines[first]) first += 1;
    let oldEnd = oldLines.length - 1;
    let newEnd = newLines.length - 1;
    while (oldEnd >= first && newEnd >= first && oldLines[oldEnd] === newLines[newEnd]) { oldEnd -= 1; newEnd -= 1; }
    return { removed: oldLines.slice(first, oldEnd + 1), added: newLines.slice(first, newEnd + 1) };
  }

  return (
    <main className="space-y-5 pb-6">
      <header>
        <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">Settings</p>
        <h1 className="text-ink mt-1 text-2xl font-semibold">Customer Message Templates</h1>
        <p className="text-skyline mt-1 text-sm">Edit wording used when staff prepare customer messages. Messages are reviewed and sent manually.</p>
      </header>
      {!migrationReady && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Template storage is unavailable. Original Whitebird wording is being used as a safe fallback.</div>}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(225px,270px)_minmax(0,1fr)]">
        <aside className={(mobileEditor ? "hidden " : "") + "lg:sticky lg:top-4 lg:block"}>
          <div className="border-fog rounded-2xl border bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between"><h2 className="text-ink text-sm font-semibold">Templates</h2><span className="text-skyline text-xs">{templates.length} total</span></div>
            <label htmlFor="template-search" className="sr-only">Search categories and templates</label>
            <input id="template-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates…" className="border-fog text-ink mt-3 min-h-11 w-full rounded-xl border bg-snow px-3 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10" />
            <nav aria-label="Template categories" className="mt-3 space-y-2 lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto lg:pr-1">
              {grouped.map((group) => {
                const expanded = Boolean(query.trim()) || (openCategories[group.category] ?? true);
                return <section key={group.category} className="border-fog overflow-hidden rounded-xl border">
                  <button type="button" aria-expanded={expanded} onClick={() => setOpenCategories((state) => ({ ...state, [group.category]: !expanded }))} className="text-ink hover:bg-snow flex min-h-11 w-full items-center justify-between px-3 text-left text-sm font-medium">
                    <span>{group.category}</span><span className="flex items-center gap-2"><span className="text-skyline rounded-full bg-fog px-2 py-0.5 text-xs">{query.trim() ? group.rows.length : group.total}</span><span aria-hidden="true">{expanded ? "−" : "+"}</span></span>
                  </button>
                  {expanded && <div className="space-y-1 border-t border-fog p-1.5">{group.rows.map((row) =>
                    <button key={row.template_key} type="button" aria-current={selectedKey === row.template_key ? "true" : undefined}
                      onClick={() => { selectTemplate(row.template_key); setMobileEditor(true); }}
                      className={"w-full rounded-lg px-3 py-2.5 text-left text-sm leading-5 transition-colors " + (selectedKey === row.template_key ? "bg-ink text-white" : "text-ink hover:bg-fog")}>
                      {row.display_name}
                    </button>)}</div>}
                </section>;
              })}
              {!grouped.length && <div className="rounded-xl bg-snow p-4 text-center text-sm">No matching templates.<button type="button" className="text-signal ml-1 underline" onClick={() => setQuery("")}>Clear search</button></div>}
            </nav>
          </div>
        </aside>

        {selected && selectedDefinition ? <section className={(mobileEditor ? "" : "hidden ") + "min-w-0 space-y-4 lg:block"}>
          <div className="border-fog overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b border-fog p-4 sm:p-6">
              <button type="button" onClick={() => {
                if (dirty) {
                  setDiscardBackPrompt(true);
                  return;
                }
                setDraft(selected.body);
                setNotice("");
                setMobileEditor(false);
              }} className="text-signal mb-3 min-h-10 text-sm font-medium lg:hidden">← Back to Templates</button>
              {discardBackPrompt && <div role="group" aria-label="Confirm unsaved changes" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-950">You have unsaved changes. Discard them and return to templates?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setDiscardBackPrompt(false)} className="border-fog min-h-10 rounded-lg border bg-white px-3 text-sm font-medium">Keep editing</button>
                  <button type="button" onClick={() => {
                    setDraft(selected.body);
                    setNotice("");
                    setDiscardBackPrompt(false);
                    setMobileEditor(false);
                  }} className="bg-ink min-h-10 rounded-lg px-3 text-sm font-semibold text-white">Discard and go back</button>
                </div>
              </div>}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-signal text-xs font-medium">{selected.category}</p><h2 className="text-ink mt-1 text-xl font-semibold">{selected.display_name}</h2><p className="text-skyline mt-1 text-sm leading-6">{selected.description}</p>
                  <p className="text-skyline mt-2 text-xs">Revision {selected.revision}{selected.updated_at ? " · Updated " + malaysiaDate(selected.updated_at) + " MYT" : " · Original wording"}</p></div>
                <span className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (dirty ? "bg-amber-100 text-amber-900" : "bg-fog text-skyline")}>{dirty ? "Unsaved Changes" : "Saved"}</span>
              </div>
            </div>
            <div className="space-y-4 p-4 sm:p-6">
              <div>
                <label htmlFor="customer-message-template-body" className="text-ink block text-sm font-semibold">Message wording</label>
                <p className="text-skyline mt-1 text-xs">Line breaks, emojis and WhatsApp formatting are preserved.</p>
                <textarea id="customer-message-template-body" ref={bodyRef} value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} spellCheck
                  className="border-fog text-ink mt-3 block min-h-32 max-h-[32.5rem] w-full resize-y rounded-xl border bg-white px-4 py-3.5 font-sans text-[15px] leading-7 outline-none focus:border-ink focus:ring-2 focus:ring-ink/10" />
                {selected.allowed_placeholders.length > 0 && <>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label htmlFor="insert-template-variable" className="text-ink text-xs font-semibold">Insert Variable</label>
                    <select id="insert-template-variable" defaultValue="" onChange={(event) => { if (event.target.value) insertPlaceholder(event.target.value); event.currentTarget.value = ""; }}
                      className="border-fog text-ink min-h-11 min-w-56 rounded-xl border bg-white px-3 text-sm">
                      <option value="">Choose a variable…</option>
                      {selected.allowed_placeholders.map((token) => <option key={token} value={token}>{variableName(token)} — {selected.required_placeholders.includes(token) ? "Required" : "Optional"}</option>)}
                    </select>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">{selected.allowed_placeholders.map((token) => {
                    const required = selected.required_placeholders.includes(token);
                    return <button key={token} type="button" title={"Insert " + variableName(token)} onMouseDown={(event) => event.preventDefault()} onClick={() => insertPlaceholder(token)}
                      className={"inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs " + (required ? "border-ink/20 bg-snow text-ink" : "border-fog text-skyline hover:bg-snow")}>
                      <span className="font-medium">{variableName(token)}</span><span className="opacity-70">{required ? "Required" : "Optional"}</span>
                    </button>;
                  })}</div>
                </>}
                {!validation.valid && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{validation.reason} Keep required operational information in the message before saving.</p>}
              </div>
              {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">{notice}</p>}
              <div className="sticky bottom-[calc(3rem+env(safe-area-inset-bottom))] md:bottom-0 -mx-4 flex flex-wrap gap-2 border-t border-fog bg-white/95 px-4 py-3 pb-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
                <button type="button" onClick={save} disabled={!dirty || !validation.valid || pending || !migrationReady} className="bg-ink min-h-11 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-45">{pending ? "Saving…" : "Save Changes"}</button>
                <button type="button" onClick={() => { if (!dirty || window.confirm("Discard your unsaved changes?")) { setDraft(selected.body); setNotice(""); } }} disabled={!dirty || pending} className="border-fog text-ink min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-45">Cancel Changes</button>
                <div className="ml-auto flex gap-1"><button type="button" onClick={resetDefault} disabled={pending || !migrationReady || selected.body === selected.default_body} className="text-skyline min-h-11 rounded-xl px-3 text-sm font-medium disabled:opacity-45">Reset to Default</button><a href="#template-revision-history" className="text-skyline inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium">Revision History</a></div>
              </div>
            </div>
          </div>

          <div className="border-fog rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><div><p className="text-signal text-xs font-semibold uppercase tracking-wide">Customer Preview</p><h3 className="text-ink mt-1 text-lg font-semibold">How the prepared message reads</h3></div><span className="text-skyline rounded-full bg-snow px-3 py-1 text-xs">Sample data only</span></div>
            <p className="text-skyline mt-2 text-sm leading-6">Preview uses the same renderer as message preparation. Protected order, payment, link and fulfilment details remain Whitebird-controlled.</p>
            <pre className="border-fog text-ink mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border bg-snow p-4 font-sans text-[15px] leading-7 sm:p-5">{preview}</pre>
          </div>

          <section id="template-revision-history" className="border-fog rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-signal text-xs font-semibold uppercase tracking-wide">History</p><h3 className="text-ink mt-1 text-lg font-semibold">Revision History</h3><p className="text-skyline mt-1 text-sm">Restoring a version creates a new revision and preserves this history.</p></div><span className="text-skyline rounded-full bg-snow px-3 py-1 text-xs">Malaysia time · MYT</span></div>
            {historyLoading ? <p className="text-skyline mt-4 text-sm">Loading history…</p> : <div className="mt-4 divide-y divide-fog">
              {!revisions.length && <p className="text-skyline py-4 text-sm">No saved history is available.</p>}
              {revisions.map((row) => {
                const diff = revisionDiff(row.previous_body, row.new_body);
                const current = row.revision === selected.revision;
                const compare = comparisonRevision === row.revision;
                return <article key={row.revision} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-ink text-sm font-semibold">Revision {row.revision}</p>{current && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">Current version</span>}<span className="text-skyline text-xs capitalize">{row.action}</span></div><p className="text-skyline mt-1 text-xs">{row.actor_display_name || "Staff identity unavailable"} · {malaysiaDate(row.created_at)} MYT</p></div>
                    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setComparisonRevision(compare ? null : row.revision)} className="border-fog text-ink min-h-10 rounded-xl border px-3 text-xs font-semibold">{compare ? "Hide Changes" : "View Changes"}</button><button type="button" onClick={() => restoreRevision(row.revision)} disabled={pending || current} className="border-fog text-ink min-h-10 rounded-xl border px-3 text-xs font-semibold disabled:opacity-45">Restore Previous Version</button></div>
                  </div>
                  {compare && <div className="mt-3 grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-rose-200 bg-rose-50 p-3"><p className="text-xs font-semibold text-rose-900">Removed from prior wording</p><pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-rose-950">{diff.removed.join("\n") || "No removed lines."}</pre></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-900">Added in this revision</p><pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-emerald-950">{diff.added.join("\n") || (row.action === "seed" ? "Original default wording." : "No added lines.")}</pre></div></div>}
                </article>;
              })}
            </div>}
          </section>
        </section> : <div className="border-fog rounded-2xl border bg-white p-6 text-sm text-skyline">Choose a template to edit.</div>}
      </div>
    </main>
  );
}
