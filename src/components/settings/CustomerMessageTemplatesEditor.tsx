"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  const selected = templates.find((row) => row.template_key === selectedKey);
  const selectedDefinition = CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.find((row) => row.key === selectedKey);
  const validation = validateCustomerMessageTemplateBody(selectedKey, draft);
  const preview = useMemo(
    () => renderCustomerMessagePreview(selectedKey, draft),
    [selectedKey, draft],
  );
  const dirty = Boolean(selected && draft !== selected.body);
  const grouped = useMemo(
    () => [...new Set(templates.map((row) => row.category))].map((category) => ({
      category,
      rows: templates.filter((row) => row.category === category),
    })),
    [templates],
  );

  useEffect(() => {
    let live = true;
    setHistoryLoading(true);
    void getCustomerMessageTemplateRevisionsAction(selectedKey).then((result) => {
      if (!live) return;
      setRevisions(result.ok ? result.revisions as RevisionRow[] : []);
      setHistoryLoading(false);
    });
    return () => { live = false; };
  }, [selectedKey, templates]);

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

  return (
    <main className="space-y-5">
      <header>
        <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">Settings</p>
        <h1 className="text-ink mt-1 text-2xl font-semibold">Customer Message Templates</h1>
        <p className="text-skyline mt-1 text-sm">Edit wording used when staff prepare customer messages. Messages are still reviewed and sent manually.</p>
      </header>

      {!migrationReady && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          DEV template storage is not available yet. The original Whitebird wording is shown as a safe fallback.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,2fr)]">
        <nav aria-label="Template categories" className="border-fog max-h-[70vh] space-y-4 overflow-y-auto rounded-xl border bg-white p-3">
          {grouped.map((group) => (
            <section key={group.category}>
              <h2 className="text-skyline px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide">{group.category}</h2>
              <div className="space-y-1">
                {group.rows.map((row) => (
                  <button key={row.template_key} type="button" onClick={() => selectTemplate(row.template_key)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedKey === row.template_key ? "bg-ink text-white" : "text-ink hover:bg-fog"}`}>
                    {row.display_name}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </nav>

        {selected && selectedDefinition && (
          <section className="space-y-4">
            <div className="border-fog rounded-xl border bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-ink text-lg font-semibold">{selected.display_name}</h2>
                  <p className="text-skyline mt-1 text-sm">{selected.description}</p>
                  <p className="text-skyline mt-2 text-xs">Current revision {selected.revision}{selected.updated_at ? ` · Updated ${new Date(selected.updated_at).toLocaleString()}` : ""}</p>
                </div>
              </div>

              <label htmlFor="customer-message-template-body" className="text-ink mt-5 block text-sm font-medium">Message wording</label>
              <textarea id="customer-message-template-body" value={draft} onChange={(event) => setDraft(event.target.value)}
                rows={15} spellCheck className="border-fog text-ink mt-2 w-full rounded-lg border p-3 font-mono text-sm leading-6 focus:border-ink focus:outline-none" />

              <div className="mt-3">
                <p className="text-ink text-xs font-semibold">Available placeholders</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.allowed_placeholders.map((token) => (
                    <button key={token} type="button" onClick={() => insertPlaceholder(token)}
                      className="border-fog text-ink rounded-full border px-2.5 py-1 font-mono text-xs hover:bg-fog">
                      {"{{"}{token}{"}}"}
                    </button>
                  ))}
                  {selected.allowed_placeholders.length === 0 && <span className="text-skyline text-xs">No placeholders.</span>}
                </div>
                <p className="text-skyline mt-2 text-xs">Required protected information: {selected.required_placeholders.length ? selected.required_placeholders.map((token) => `{{${token}}}`).join(", ") : "None"}.</p>
              </div>

              {!validation.valid && <p role="alert" className="mt-3 text-sm text-red-700">{validation.reason}</p>}
              {notice && <p role="status" className="mt-3 text-sm text-signal">{notice}</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={save} disabled={!dirty || !validation.valid || pending || !migrationReady}
                  className="bg-ink rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save Changes"}</button>
                <button type="button" onClick={() => { if (!dirty || window.confirm("Discard your unsaved changes?")) { setDraft(selected.body); setNotice(""); } }}
                  disabled={!dirty || pending} className="border-fog text-ink rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel Changes</button>
                <button type="button" onClick={resetDefault} disabled={pending || !migrationReady}
                  className="border-fog text-ink rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Reset to Default</button>
              </div>
            </div>

            <div className="border-fog rounded-xl border bg-white p-4 sm:p-5">
              <h3 className="text-ink text-sm font-semibold">Preview</h3>
              <p className="text-skyline mt-1 text-xs">Sample data only (for example, Ari and sample order details). Structured order, payment, link and fulfilment values remain controlled by Whitebird.</p>
              <pre className="border-fog text-ink mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg border bg-snow p-3 text-sm leading-6">{preview}</pre>
            </div>

            <div className="border-fog rounded-xl border bg-white p-4 sm:p-5">
              <h3 className="text-ink text-sm font-semibold">Revision History</h3>
              <p className="text-skyline mt-1 text-xs">Restore creates a new revision, preserving the audit trail.</p>
              {historyLoading ? <p className="text-skyline mt-3 text-sm">Loading history…</p> : (
                <div className="mt-3 divide-y divide-fog">
                  {revisions.length === 0 && <p className="text-skyline py-3 text-sm">No saved changes yet.</p>}
                  {revisions.map((row) => (
                    <div key={row.revision} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="text-sm">
                        <p className="text-ink font-medium">Revision {row.revision} · {row.action}</p>
                        <p className="text-skyline mt-1 text-xs">{row.actor_display_name} · {new Date(row.created_at).toLocaleString()}</p>
                      </div>
                      <button type="button" onClick={() => restoreRevision(row.revision)} disabled={pending || row.revision === selected.revision}
                        className="border-fog text-ink rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Restore Previous Version</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
