import { formatDateTime } from "@/lib/dates";
import type { StaffCredentialActivityItem } from "@/foundation/staff/credential-audit";

type StaffCredentialActivityProps = {
  events: StaffCredentialActivityItem[];
};

export function StaffCredentialActivity({
  events,
}: StaffCredentialActivityProps) {
  return (
    <section className="border-fog rounded-xl border bg-white p-5">
      <h3 className="text-ink text-sm font-semibold">Credential activity</h3>
      <p className="text-skyline mt-1 text-sm">
        Successful staff username, email, password, and Passkey changes.
      </p>

      {events.length === 0 ? (
        <p className="text-skyline mt-4 text-sm">
          No credential changes have been recorded yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {events.map((event) => {
            const sameStaff = event.actorName === event.subjectName;
            return (
              <li className="border-fog border-t pt-4 first:border-t-0 first:pt-0" key={event.id}>
                <p className="text-skyline text-xs">
                  {formatDateTime(event.createdAt)}
                </p>
                <p className="text-ink mt-1 text-sm font-medium">{event.label}</p>
                {sameStaff ? (
                  <p className="text-skyline mt-1 text-sm">{event.actorName}</p>
                ) : (
                  <>
                    <p className="text-skyline mt-1 text-sm">
                      Performed by {event.actorName}
                    </p>
                    <p className="text-skyline text-sm">For {event.subjectName}</p>
                  </>
                )}
                {event.detail ? (
                  <p className="text-ink mt-1 text-sm">{event.detail}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
