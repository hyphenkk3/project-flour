/**
 * M4-P1 Test 7 correction — confirmation invalidation while Awaiting Payment.
 * Run: npx tsx scripts/test-m4-p1-test7-confirmation-reconfirm.ts
 */
import assert from "node:assert/strict";
import {
  canAccessCustomerConfirmation,
  nextStatusAfterConfirmationMarkedSent,
  orderMateriallyAffectsConfirmation,
  shouldOfferUpdatedConfirmationAction,
  shouldOutdateSentConfirmation,
} from "@/engines/orders/confirmation-validity";
import { messageActionsForOperationalState } from "@/engines/orders/message-availability";
import type { StorefrontOrder } from "@/types/storefront";

const baseOrder = {
  customerName: "Amy",
  phone: "012",
  pickupDate: "2026-08-15",
  pickupTime: "14:00",
  items: [
    {
      cakeId: "c1",
      cakeSizeId: "s1",
      quantity: 1,
      unitPrice: 125,
      cakeName: "Cake",
      sizeLabel: '6"',
    },
  ],
  complimentaryItems: [],
  paidAddons: [],
  status: "awaiting_payment",
} as unknown as StorefrontOrder;

const afterBc = {
  customerName: "Amy",
  phone: "012",
  pickupDate: "2026-08-15",
  pickupTime: "14:00",
  items: baseOrder.items,
  complimentaryItems: [],
  paidAddons: [
    {
      code: "birthday_card",
      quantity: 1,
      unitPrice: 3,
      name: "Birthday Card",
      financialShorthand: "BC",
      messages: [{ cardIndex: 1, writtenMessage: "Happy Birthday" }],
    },
  ],
};

// 1. sent confirmation + add BC → material + invalidate while awaiting_payment
{
  assert.equal(orderMateriallyAffectsConfirmation(baseOrder, afterBc), true);
  assert.equal(
    shouldOutdateSentConfirmation({
      materialChange: true,
      orderStatus: "awaiting_payment",
    }),
    true,
  );
}

// 2. awaiting_payment + needs resend → Customer Confirmation available
{
  assert.equal(
    canAccessCustomerConfirmation({
      status: "awaiting_payment",
      confirmationNeedsResend: true,
    }),
    true,
  );
  assert.equal(
    shouldOfferUpdatedConfirmationAction({
      status: "awaiting_payment",
      confirmationNeedsResend: true,
    }),
    true,
  );
  // Without needs_resend, no confirmation UI while awaiting payment
  assert.equal(
    canAccessCustomerConfirmation({
      status: "awaiting_payment",
      confirmationNeedsResend: false,
    }),
    false,
  );
}

// 3. mark updated confirmation sent → stay awaiting_payment; clear needs_resend is action-side
{
  assert.equal(
    nextStatusAfterConfirmationMarkedSent("awaiting_payment"),
    "awaiting_payment",
  );
  assert.equal(
    nextStatusAfterConfirmationMarkedSent("submitted"),
    "pending_confirmation",
  );
  assert.equal(
    nextStatusAfterConfirmationMarkedSent("pending_confirmation"),
    "pending_confirmation",
  );
  assert.equal(nextStatusAfterConfirmationMarkedSent("paid"), "paid");
}

// 4. message-only card edit → material + outdated availability
{
  const withMsgA = {
    ...baseOrder,
    paidAddons: [
      {
        id: "a1",
        orderId: "o1",
        paidAddonTypeId: "t",
        code: "birthday_card",
        name: "Birthday Card",
        unitPrice: 3,
        financialShorthand: "BC",
        quantity: 1,
        writtenMessage: null,
        messages: [{ cardIndex: 1, writtenMessage: "Amy" }],
        sortOrder: 0,
      },
    ],
  } as unknown as StorefrontOrder;

  assert.equal(
    orderMateriallyAffectsConfirmation(withMsgA, {
      customerName: "Amy",
      phone: "012",
      pickupDate: "2026-08-15",
      pickupTime: "14:00",
      items: withMsgA.items,
      complimentaryItems: [],
      paidAddons: [
        {
          code: "birthday_card",
          quantity: 1,
          unitPrice: 3,
          name: "Birthday Card",
          financialShorthand: "BC",
          messages: [{ cardIndex: 1, writtenMessage: "Mum" }],
        },
      ],
    }),
    true,
  );
  assert.equal(
    shouldOutdateSentConfirmation({
      materialChange: true,
      orderStatus: "awaiting_payment",
    }),
    true,
  );
}

// 5. no sent confirmation (submitted) + edit → no invalidation
{
  assert.equal(
    shouldOutdateSentConfirmation({
      materialChange: true,
      orderStatus: "submitted",
    }),
    false,
  );
}

// 6. Awaiting Payment status preserved through mark-as-sent helper
{
  assert.equal(
    nextStatusAfterConfirmationMarkedSent("awaiting_payment"),
    "awaiting_payment",
  );
}

// 7–8. Preview 3B message availability unchanged (not_ready = crew only)
{
  const notReady = messageActionsForOperationalState({
    readyAt: null,
    pickedUpAt: null,
  });
  assert.deepEqual(
    notReady.map((a) => a.type),
    ["crew"],
  );

  const ready = messageActionsForOperationalState({
    readyAt: "2026-08-10T10:00:00Z",
    pickedUpAt: null,
  });
  assert.deepEqual(
    ready.map((a) => a.type),
    ["crew", "customer_ready"],
  );

  const pickedUp = messageActionsForOperationalState({
    readyAt: "2026-08-10T10:00:00Z",
    pickedUpAt: "2026-08-10T12:00:00Z",
  });
  assert.deepEqual(
    pickedUp.map((a) => a.type),
    ["crew", "customer_thank_you", "customer_ready"],
  );
}

console.log("M4-P1 Test 7 confirmation-reconfirm tests: PASSED");
