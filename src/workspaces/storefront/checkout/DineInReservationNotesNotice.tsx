import {
  DINE_IN_RESERVATION_NOTES_HEADING,
  DINE_IN_RESERVATION_RULES,
} from "@/engines/orders/dine-in-party";

/**
 * Informational Dine-in reservation rules.
 * Display only — no acknowledgement or validation.
 */
export function DineInReservationNotesNotice() {
  return (
    <div className="text-status-danger space-y-2">
      <p className="text-sm leading-snug font-bold">
        {DINE_IN_RESERVATION_NOTES_HEADING}
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
        {DINE_IN_RESERVATION_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </div>
  );
}
