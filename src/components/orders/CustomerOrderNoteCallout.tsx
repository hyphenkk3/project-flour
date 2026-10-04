export function hasCustomerOrderNote(note: string | null | undefined): boolean {
  return Boolean(note?.trim());
}

export function CustomerOrderNoteCallout({
  note,
}: {
  note: string | null | undefined;
}) {
  if (!hasCustomerOrderNote(note)) return null;

  return (
    <section
      aria-label="Customer order note"
      className="border-status-info/40 bg-status-info-soft/50 rounded-xl border-2 px-4 py-4 shadow-sm"
    >
      <h2 className="text-status-info text-xs font-bold tracking-[0.14em] uppercase">
        CUSTOMER ORDER NOTE
      </h2>
      <p className="text-ink mt-2 text-base leading-relaxed font-medium whitespace-pre-wrap">
        {note}
      </p>
    </section>
  );
}
