import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPostPaymentDineInKey,
  classifyPaidOrderSave,
  decidePostPaymentSave,
} from "@/engines/orders/post-payment-customer-change";
import {
  buildAssistedFulfilmentRpcParams,
  defaultAssistedDineInDraft,
  validateAssistedOwnerOverrideFulfilment,
} from "@/engines/orders/assisted-fulfilment";
import { defaultDeliveryCreateDraft } from "@/engines/orders/fulfilment";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const ownerForm = read("src/workspaces/owner/orders/StaffGuestOrderForm.tsx");
const fulfilmentFields = read(
  "src/workspaces/owner/orders/OrderFulfilmentCreateFields.tsx",
);
const createAction = read("src/workspaces/owner/orders/actions.ts");
const createHelper = read(
  "src/workspaces/owner/orders/create-staff-preorder.ts",
);
const editForm = read("src/workspaces/owner/orders/OrderWorkspaceForm.tsx");

assert.match(ownerForm, /allowDineIn/);
assert.match(ownerForm, /dineIn=\{dineInDraft\}/);
assert.match(fulfilmentFields, /label: "Dine-in"/);
assert.match(fulfilmentFields, /label="Dine-in reservation time"/);
assert.match(fulfilmentFields, /DineInVenuePartyFields/);
assert.match(fulfilmentFields, /label="Reservation note \(optional\)"/);
assert.match(createAction, /rawFulfilmentMethod !== "dine_in"/);
assert.match(createAction, /dineIn: parseDineInDraftFromForm\(formData\)/);
assert.match(createHelper, /if \(websiteMethod === "dine_in"\)/);
assert.match(createHelper, /rpcArgs\.p_dine_in = fulfilmentRpc\.p_dine_in/);
assert.match(editForm, /order\.fulfilmentMethod === "dine_in"/);
assert.match(editForm, /reservation_time/);

const dineInDraft = {
  ...defaultAssistedDineInDraft(),
  reservationTime: "13:00",
  venue: "whitebird",
  adultCount: "2",
  kidCount: "0",
  toddlerCount: "0",
};
assert.equal(
  validateAssistedOwnerOverrideFulfilment({
    method: "dine_in",
    dateYmd: "2026-11-19",
    timeValue: "13:30",
    delivery: defaultDeliveryCreateDraft(),
    dineIn: dineInDraft,
  }),
  null,
);
assert.match(
  validateAssistedOwnerOverrideFulfilment({
    method: "dine_in",
    dateYmd: "2026-11-19",
    timeValue: "14:30",
    delivery: defaultDeliveryCreateDraft(),
    dineIn: dineInDraft,
  }) ?? "",
  /within 1 hour/,
);
const dineInRpc = buildAssistedFulfilmentRpcParams({
  method: "dine_in",
  delivery: defaultDeliveryCreateDraft(),
  dineIn: dineInDraft,
});
assert.equal(dineInRpc.p_fulfilment_method, "dine_in");
assert.deepEqual(dineInRpc.p_dine_in, {
  venue: "whitebird",
  adult_count: 2,
  kid_count: 0,
  toddler_count: 0,
  guest_count: 2,
  reservation_time: "13:00",
  reservation_note: null,
  whitebird_split_seating_acknowledged: false,
});

const before = {
  customerName: "Owner Test",
  phone: "",
  email: "",
  pickupDate: "2026-11-20",
  pickupTime: "13:30",
  notes: null,
  fulfilmentMethod: "dine_in",
  delivery: null,
  dineInReservation: {
    reservationDate: "2026-11-20",
    reservationTime: "13:00:00",
    venue: "whitebird",
    guestCount: 2,
    adultCount: 2,
    kidCount: 0,
    toddlerCount: 0,
    whitebirdSplitSeatingAcknowledged: false,
    reservationNote: null,
  },
  items: [{ cakeId: "cake-a", cakeSizeId: "size-a", quantity: 1 }],
  complimentaryItems: [],
  paidAddons: [],
};
const proposed = {
  guestName: "Owner Test",
  guestPhone: "",
  guestEmail: "",
  pickupDate: "2026-11-20",
  pickupTime: "13:30",
  customerNotes: "",
  fulfilmentMethod: "dine_in",
  deliveryKey: "",
  dineInKey: buildPostPaymentDineInKey({
    reservationDate: "2026-11-20",
    reservationTime: "13:00",
    venue: "whitebird",
    guestCount: 2,
    adultCount: 2,
    kidCount: 0,
    toddlerCount: 0,
    whitebirdSplitSeatingAcknowledged: false,
    reservationNote: null,
  }),
  items: [{ cakeId: "cake-a", cakeSizeId: "size-a", quantity: 1 }],
  complimentary: [],
  paidAddons: [],
};
const unchangedDineIn = classifyPaidOrderSave(before, proposed);
assert.equal(unchangedDineIn.pickupOrFulfilmentChanged, false);
assert.equal(unchangedDineIn.customerFacingChange, false);
assert.deepEqual(
  decidePostPaymentSave({
    status: "paid",
    changeCount: 1,
    role: "owner",
    override: false,
    classification: unchangedDineIn,
  }),
  { action: "allow_staff_only" },
);

const changedReservation = classifyPaidOrderSave(before, {
  ...proposed,
  dineInKey: buildPostPaymentDineInKey({
    reservationDate: "2026-11-20",
    reservationTime: "13:30",
    venue: "hyphen",
    guestCount: 3,
    adultCount: 2,
    kidCount: 1,
    toddlerCount: 0,
    whitebirdSplitSeatingAcknowledged: false,
    reservationNote: "Near the window",
  }),
});
assert.equal(changedReservation.pickupOrFulfilmentChanged, true);
assert.equal(changedReservation.customerFacingChange, true);
assert.deepEqual(
  decidePostPaymentSave({
    status: "paid",
    changeCount: 1,
    role: "owner",
    override: false,
    classification: changedReservation,
  }),
  {
    action: "block_used",
    error:
      "The one-time post-payment customer change has already been used. Manager or Owner override is required for any further change or cancellation.",
  },
);

const actualPickupChange = classifyPaidOrderSave(before, {
  ...proposed,
  fulfilmentMethod: "pickup",
});
assert.equal(actualPickupChange.pickupOrFulfilmentChanged, true);

console.log("Owner Dine-In New Order/Edit Order checks passed.");
