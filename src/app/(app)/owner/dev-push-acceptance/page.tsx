import { notFound } from "next/navigation";

import { requireStaff } from "@/foundation/auth/session";
import { inspectDeploymentIdentity } from "@/foundation/staff/dev-push-acceptance-core.mjs";
import { DevPushAcceptancePanel } from "@/components/staff/DevPushAcceptancePanel";

export const dynamic = "force-dynamic";

export default async function DevPushAcceptancePage() {
  const staff = await requireStaff();
  const authorization =
    staff.isActive &&
    !staff.archivedAt &&
    !staff.mustChangePassword &&
    staff.isMasterOwner &&
    staff.role.code === "owner";
  const deployment = inspectDeploymentIdentity(process.env);

  if (!authorization || !deployment.ok) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-amber-700 uppercase">
          Temporary DEV-only acceptance control
        </p>
        <h1 className="text-2xl font-bold text-slate-950">
          One-shot iPhone Push acceptance
        </h1>
        <p className="text-sm leading-6 text-slate-700">
          This action is available only on the approved protected DEV Preview.
          Arming is read-only. The second confirmation creates one fixed
          synthetic notification event, then attempts Push for that event ID
          only. It cannot create an order, use batch retry, or be reset by
          deleting the event.
        </p>
      </header>

      <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <h2 className="font-semibold">Before continuing</h2>
        <p className="mt-2">
          The expected audience is seven Web-eligible staff, one Sound-eligible
          staff member, and one Push-eligible staff account with three Owner
          subscriptions. Any of those three devices may display the Push; two
          older subscriptions have not been mapped to physical devices. Six
          non-Owner Web listeners must already be coordinated inactive.
        </p>
        <p className="mt-2">
          The one-minute extra walk-in hold reminder and expiry jobs were
          observed active in a prior DEV catalog check. They do not dispatch
          Push, but may produce separate Fresh Pick Web events. This action
          cannot verify pg_cron state through the application API; do not
          continue unless the current operational check confirms the required
          Fresh Pick schedule state and you accept that separate reminder
          activity.
        </p>
        <p className="mt-2">
          The Owner&apos;s New Order Sound preference may also produce an
          audible cue. Email dispatch is paused and event-triggered dispatch
          must remain disabled. A provider-accepted Push is not proof that the
          iPhone displayed it; record device receipt separately.
        </p>
      </section>

      <DevPushAcceptancePanel
        deploymentId={deployment.deploymentId}
        commitSha={deployment.commitSha}
      />
    </main>
  );
}
