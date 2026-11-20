const STAFF_PUSH_COPY = {
  new_order: {
    title: "New order received",
    body: "A new preorder needs attention.",
    href: "/owner",
  },
  order_paid: {
    title: "Order paid",
    body: "An order payment was recorded.",
    href: "/owner",
  },
  order_confirmed: {
    title: "Order confirmed",
    body: "An order was confirmed.",
    href: "/owner",
  },
  order_cancelled: {
    title: "Order cancelled",
    body: "An order was cancelled.",
    href: "/owner",
  },
  order_edited: {
    title: "Order updated",
    body: "An order was updated.",
    href: "/owner",
  },
  approval_required: {
    title: "Approval required",
    body: "A staff action needs review.",
    href: "/owner/approvals",
  },
  last_minute: {
    title: "Last-minute order",
    body: "Urgent order activity needs attention.",
    href: "/owner",
  },
  fresh_pick_walk_in_hold_reminder: {
    title: "Fresh Pick hold reminder",
    body: "A Fresh Pick hold needs attention.",
    href: "/customer-operations/fresh-picks",
  },
  waiting_list_new_request: {
    title: "New waiting list request",
    body: "A customer joined the waiting list.",
    href: "/bakery/availability#waiting-list-heading",
  },
};

const STAFF_ORDER_CODES = new Set([
  "new_order",
  "order_paid",
  "order_confirmed",
  "order_cancelled",
  "order_edited",
  "last_minute",
]);
const STAFF_ORDER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function staffNotificationHref(code, orderId) {
  if (!STAFF_ORDER_CODES.has(code)) return STAFF_PUSH_COPY[code].href;
  return typeof orderId === "string" && STAFF_ORDER_ID.test(orderId)
    ? `/owner/orders/${orderId}`
    : "/owner";
}

self.addEventListener("push", (event) => {
  let message;
  try {
    message = event.data?.json();
  } catch {
    return;
  }
  if (
    message?.version !== 1 ||
    typeof message.eventId !== "string" ||
    !Object.hasOwn(STAFF_PUSH_COPY, message.code)
  ) {
    return;
  }

  const copy = STAFF_PUSH_COPY[message.code];
  event.waitUntil(
    self.registration.showNotification(copy.title, {
      body: copy.body,
      icon: "/icons/whitebird-w-bird-icon-192.png",
      badge: "/icons/whitebird-w-bird-icon-192.png",
      tag: `whitebird-staff-${message.eventId}`,
      renotify: false,
      data: { href: staffNotificationHref(message.code, message.orderId) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const href = event.notification?.data?.href;
  event.notification.close();
  if (typeof href !== "string" || !href.startsWith("/")) return;

  let target;
  try {
    const targetUrl = new URL(href, self.location.origin);
    if (targetUrl.origin !== self.location.origin) return;
    target = targetUrl.href;
  } catch {
    return;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });
        if (existing) {
          return existing
            .navigate(target)
            .then(() => existing.focus())
            .catch(() => self.clients.openWindow(target));
        }
        return self.clients.openWindow(target);
      }),
  );
});
