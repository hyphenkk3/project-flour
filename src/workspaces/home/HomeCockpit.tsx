import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatLongBusinessDate } from "@/lib/dates";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import { ownerOrderWorkspaceHref } from "@/workspaces/owner/navigation/return-to";
import { dineInVenueLabel } from "@/engines/business-calendar/dine-in-hours";
import {
  collectionDateNavHref,
  collectionOrderHref,
} from "@/workspaces/collection/date";
import type { HomeCockpitModel } from "@/workspaces/home/cockpit-model";
import type { HomeDineInHandoffPreview } from "@/workspaces/home/cockpit-model";
import { HomeLiveRefresh } from "@/workspaces/home/HomeLiveRefresh";
import { HomeGuestPreorderNotificationListener } from "@/workspaces/home/HomeGuestPreorderNotificationListener";
import { homeGreetingTitle } from "@/workspaces/home/greeting";

const HOME_RETURN = "/home";
const OPERATIONS_TODAY_HREF = "/owner?pickup=today";

type HomeCockpitProps = {
  staffId: string;
  staffDisplayName: string;
  roleName: string;
  model: HomeCockpitModel;
  knownGuestOrderIds: string[];
  canAccessOperations: boolean;
  canAccessCollection: boolean;
  canAccessBakery: boolean;
  canAccessCalendar: boolean;
  canAccessApprovals: boolean;
  /** Role-specific pending-approvals destination (inbox vs Operations section). */
  pendingApprovalsHref: string;
  /**
   * Owner Home: schedule CTA prefers Whole Cake Calendar.
   * Manager keeps Bakery when bakery access exists.
   */
  preferCalendarScheduleCta?: boolean;
};

function SummaryChip({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  if (value === 0 && !emphasize) return null;
  return (
    <div
      className={[
        "border-fog min-w-[5.5rem] flex-1 rounded-xl border px-3 py-2.5",
        emphasize && value > 0
          ? "border-status-warning/30 bg-status-warning-soft"
          : "bg-white",
      ].join(" ")}
    >
      <p className="text-skyline text-[11px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="text-ink mt-1 text-2xl font-semibold tracking-tight">
        {value}
      </p>
    </div>
  );
}

function SectionHeader({
  title,
  href,
  linkLabel,
  extraLinks,
}: {
  title: string;
  href?: string | null;
  linkLabel?: string;
  extraLinks?: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-ink text-sm font-semibold tracking-wide">{title}</h2>
      {href || (extraLinks && extraLinks.length > 0) ? (
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {href && linkLabel ? (
            <Link
              className="text-signal hover:text-ink text-sm font-medium transition"
              href={href}
            >
              {linkLabel}
            </Link>
          ) : null}
          {extraLinks?.map((link) => (
            <Link
              className="text-signal hover:text-ink text-sm font-medium transition"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function dineInPreviewMeta(item: HomeDineInHandoffPreview): string {
  const parts: string[] = [];
  if (item.venue) parts.push(dineInVenueLabel(item.venue));
  if (item.guestCount != null && item.guestCount > 0) {
    parts.push(
      `${item.guestCount} guest${item.guestCount === 1 ? "" : "s"}`,
    );
  }
  const reservation = item.reservationTime
    ? formatPickupTime(item.reservationTime)
    : null;
  const serving = formatPickupTime(item.servingTime);
  if (reservation) {
    parts.push(`Reservation ${reservation}`);
  }
  parts.push(`Cake ${serving}`);
  parts.push(item.orderNumber);
  return parts.join(" · ");
}

export function HomeCockpit({
  staffId,
  staffDisplayName,
  roleName,
  model,
  knownGuestOrderIds,
  canAccessOperations,
  canAccessCollection,
  canAccessBakery,
  canAccessCalendar,
  canAccessApprovals,
  pendingApprovalsHref,
  preferCalendarScheduleCta = false,
}: HomeCockpitProps) {
  const { summary, attentionGroups, attentionPreview, handoffs, schedule } =
    model;
  const dateLabel = formatLongBusinessDate(model.todayYmd);
  const scheduleHref =
    preferCalendarScheduleCta && canAccessCalendar
      ? "/owner/calendar"
      : canAccessBakery
        ? "/bakery"
        : canAccessCalendar
          ? "/owner/calendar"
          : null;
  const scheduleLinkLabel =
    preferCalendarScheduleCta && canAccessCalendar
      ? "View Calendar →"
      : canAccessBakery
        ? "View Bakery →"
        : canAccessCalendar
          ? "View Calendar →"
          : undefined;

  const summaryChips: Array<{
    label: string;
    value: number;
    emphasize?: boolean;
  }> = [
    { label: "Orders", value: summary.ordersToday },
    { label: "Pickups", value: summary.pickupsToday },
    { label: "Deliveries", value: summary.deliveriesToday },
    { label: "Dine-in", value: summary.dineInsToday },
    { label: "Ready", value: summary.ready },
    { label: "Completed", value: summary.completed },
    {
      label: "Attention",
      value: summary.needAttention,
      emphasize: true,
    },
  ];
  if (canAccessApprovals || canAccessOperations) {
    summaryChips.push({
      label: "Approvals",
      value: summary.pendingApprovals,
      emphasize: true,
    });
  }

  const visibleSummary = summaryChips.filter((chip) => chip.value > 0);
  const hasAnyTodayActivity =
    summary.ordersToday > 0 ||
    summary.pendingApprovals > 0 ||
    handoffs.ready > 0 ||
    handoffs.pickedUp > 0 ||
    handoffs.delivered > 0 ||
    handoffs.dineInPending > 0 ||
    handoffs.dineInCompleted > 0 ||
    schedule.total > 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-1 pb-10 sm:px-0">
      <HomeLiveRefresh />
      <HomeGuestPreorderNotificationListener
        initialOrderIds={knownGuestOrderIds}
        staffId={staffId}
      />
      <div>
        <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
          Home
        </p>
        <PageHeader
          description={`${roleName} · ${dateLabel}`}
          title={homeGreetingTitle(staffDisplayName)}
        />
      </div>

      <section aria-labelledby="home-today">
        <h2
          className="text-ink mb-3 text-sm font-semibold tracking-wide"
          id="home-today"
        >
          Today
        </h2>
        {!hasAnyTodayActivity ? (
          <p className="text-skyline text-sm">No orders today.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleSummary.map((chip) => (
              <SummaryChip
                emphasize={chip.emphasize}
                key={chip.label}
                label={chip.label}
                value={chip.value}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="home-attention">
        <SectionHeader
          href={canAccessOperations ? OPERATIONS_TODAY_HREF : null}
          linkLabel={canAccessOperations ? "View Operations →" : undefined}
          title="Needs Attention"
        />
        {attentionGroups.length === 0 &&
        summary.pendingApprovals === 0 ? (
          <p className="text-skyline text-sm">Nothing needs your attention.</p>
        ) : (
          <div className="space-y-2">
            {canAccessApprovals && summary.pendingApprovals > 0 ? (
              <Link
                className="border-fog hover:border-skyline flex items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-3 transition"
                href={pendingApprovalsHref}
              >
                <span className="text-ink text-sm font-medium">
                  Pending approvals
                </span>
                <span className="text-signal text-sm font-semibold">
                  {summary.pendingApprovals}
                </span>
              </Link>
            ) : null}
            {attentionGroups.map((group) => (
              <Link
                className="border-fog hover:border-skyline flex items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-3 transition"
                href={
                  canAccessOperations
                    ? OPERATIONS_TODAY_HREF
                    : attentionPreview[0]
                      ? ownerOrderWorkspaceHref(
                          attentionPreview[0].id,
                          HOME_RETURN,
                        )
                      : HOME_RETURN
                }
                key={group.key}
              >
                <span className="text-ink text-sm font-medium">
                  {group.label}
                </span>
                <span className="text-signal text-sm font-semibold">
                  {group.count}
                </span>
              </Link>
            ))}
            {attentionPreview.length > 0 && canAccessOperations ? (
              <ul className="border-fog divide-fog divide-y rounded-xl border bg-white">
                {attentionPreview.map((item) => (
                  <li key={item.id}>
                    <Link
                      className="hover:bg-mist flex items-center justify-between gap-3 px-3.5 py-2.5 transition"
                      href={ownerOrderWorkspaceHref(item.id, HOME_RETURN)}
                    >
                      <span className="min-w-0">
                        <span className="text-ink block truncate text-sm font-medium">
                          {item.customerName}
                        </span>
                        <span className="text-skyline text-xs">
                          {item.orderNumber} · {item.primaryLabel}
                        </span>
                      </span>
                      <span className="text-signal shrink-0 text-sm font-medium">
                        Open →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      {canAccessCollection ? (
        <section aria-labelledby="home-handoffs">
          <SectionHeader
            extraLinks={[
              {
                href: collectionDateNavHref(model.todayYmd, "dine_in"),
                label: "View Dine-in →",
              },
            ]}
            href={collectionDateNavHref(model.todayYmd, "ready")}
            linkLabel="View Pickup →"
            title="Today's Handoffs"
          />
          {(() => {
            const hasPickupDeliveryHandoffs =
              handoffs.ready > 0 ||
              handoffs.pickedUp > 0 ||
              handoffs.outForDelivery > 0 ||
              handoffs.delivered > 0;
            const hasDineInHandoffs =
              handoffs.dineInPending > 0 || handoffs.dineInCompleted > 0;
            if (!hasPickupDeliveryHandoffs && !hasDineInHandoffs) {
              return (
                <p className="text-skyline text-sm">
                  No pickups or deliveries yet.
                </p>
              );
            }
            return (
              <div className="space-y-4">
                {hasPickupDeliveryHandoffs ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          ["Ready", handoffs.ready],
                          ["Picked Up", handoffs.pickedUp],
                          ["Out for Delivery", handoffs.outForDelivery],
                          ["Delivered", handoffs.delivered],
                        ] as const
                      ).map(([label, value]) => (
                        <div
                          className="border-fog rounded-xl border bg-white px-3 py-2.5"
                          key={label}
                        >
                          <p className="text-skyline text-[11px] font-medium tracking-wide uppercase">
                            {label}
                          </p>
                          <p className="text-ink mt-1 text-xl font-semibold">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                    {handoffs.readyPreview.length > 0 ? (
                      <ul className="border-fog divide-fog divide-y rounded-xl border bg-white">
                        {handoffs.readyPreview.map((item) => (
                          <li
                            className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                            key={item.id}
                          >
                            <span className="min-w-0">
                              <span className="text-ink block truncate text-sm font-medium">
                                {item.guestName}
                              </span>
                              <span className="text-skyline text-xs">
                                {formatPickupTime(item.pickupTime)} ·{" "}
                                {item.orderNumber}
                              </span>
                            </span>
                            <Link
                              className="text-signal hover:text-ink shrink-0 text-sm font-medium"
                              href={`/collection/orders/${item.id}?date=${encodeURIComponent(model.todayYmd)}`}
                            >
                              Open →
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {hasDineInHandoffs ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["Dine-in pending", handoffs.dineInPending],
                          ["Dine-in completed", handoffs.dineInCompleted],
                        ] as const
                      ).map(([label, value]) => (
                        <div
                          className="border-fog rounded-xl border bg-white px-3 py-2.5"
                          key={label}
                        >
                          <p className="text-skyline text-[11px] font-medium tracking-wide uppercase">
                            {label}
                          </p>
                          <p className="text-ink mt-1 text-xl font-semibold">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                    {handoffs.dineInPreview.length > 0 ? (
                      <ul className="border-fog divide-fog divide-y rounded-xl border bg-white">
                        {handoffs.dineInPreview.map((item) => (
                          <li
                            className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                            key={item.id}
                          >
                            <span className="min-w-0">
                              <span className="text-ink block truncate text-sm font-medium">
                                {item.guestName}
                              </span>
                              <span className="text-skyline text-xs">
                                {dineInPreviewMeta(item)}
                              </span>
                            </span>
                            <Link
                              className="text-signal hover:text-ink shrink-0 text-sm font-medium"
                              href={collectionOrderHref(
                                item.id,
                                model.todayYmd,
                                "dine_in",
                              )}
                            >
                              Open →
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {handoffs.dineInCompletedPreview.length > 0 ? (
                      <ul className="border-fog divide-fog divide-y rounded-xl border bg-white">
                        {handoffs.dineInCompletedPreview.map((item) => (
                          <li
                            className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                            key={`done-${item.id}`}
                          >
                            <span className="min-w-0">
                              <span className="text-ink block truncate text-sm font-medium">
                                {item.guestName}
                              </span>
                              <span className="text-skyline text-xs">
                                Completed · {dineInPreviewMeta(item)}
                              </span>
                            </span>
                            <Link
                              className="text-signal hover:text-ink shrink-0 text-sm font-medium"
                              href={collectionOrderHref(
                                item.id,
                                model.todayYmd,
                                "completed",
                              )}
                            >
                              Open →
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })()}
        </section>
      ) : null}

      {(canAccessBakery || canAccessCalendar) && (
        <section aria-labelledby="home-schedule">
          <SectionHeader
            href={scheduleHref}
            linkLabel={scheduleLinkLabel}
            title="Today's Schedule"
          />
          {schedule.total === 0 ? (
            <p className="text-skyline text-sm">
              No production scheduled for today.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-skyline text-sm">
                {schedule.total} on bakery board · {schedule.notStarted} not
                started · {schedule.inProduction} in production ·{" "}
                {schedule.ready} ready
              </p>
              <ul className="border-fog divide-fog divide-y rounded-xl border bg-white">
                {schedule.preview.map((item) => (
                  <li
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                    key={item.id}
                  >
                    <span className="min-w-0">
                      <span className="text-ink block truncate text-sm font-medium">
                        {item.guestName}
                      </span>
                      <span className="text-skyline text-xs">
                        {formatPickupTime(item.pickupTime)} · {item.label}
                      </span>
                    </span>
                    {canAccessBakery ? (
                      <Link
                        className="text-signal hover:text-ink shrink-0 text-sm font-medium"
                        href={`/bakery/orders/${item.id}?date=${encodeURIComponent(model.todayYmd)}`}
                      >
                        Open →
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {model.quickLinks.length > 0 ? (
        <section aria-labelledby="home-quick-links">
          <h2
            className="text-ink mb-3 text-sm font-semibold tracking-wide"
            id="home-quick-links"
          >
            Quick Links
          </h2>
          <ul className="flex flex-wrap gap-2">
            {model.quickLinks.map((item) => (
              <li key={item.id}>
                <Link
                  className="border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center rounded-xl border bg-white px-4 text-sm font-medium transition"
                  href={item.href ?? "/home"}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
