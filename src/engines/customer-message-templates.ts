export type CustomerMessageTemplateRows = Partial<Record<CustomerMessageTemplateKey, string>>;

export type CustomerMessageTemplateCategory =
  | "Order Confirmation"
  | "Payment Request"
  | "Payment Thank You"
  | "Ready for Pickup"
  | "Delivery Ready"
  | "Out for Delivery"
  | "General Thank You"
  | "Waiting List Confirmation";

export type CustomerMessageTemplateDefinition = {
  key: string;
  category: CustomerMessageTemplateCategory;
  displayName: string;
  description: string;
  body: string;
  allowed: readonly string[];
  required: readonly string[];
  sample: Record<string, string>;
};

export const CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS = [
  {
    "key": "order_confirmation",
    "category": "Order Confirmation",
    "displayName": "Order Confirmation",
    "description": "Customer-facing confirmation generated from the current order. Essential order, fulfilment and financial details are inserted as a protected block.",
    "body": "Hello {{staff_name}} here,\n\nWe've received your cakes preorder submission via online system. ;)\n\nHere's the order confirmation.\n\n──────────\n\n{{order_details}}\n\n──────────\n\nKindly review ALL the details in this confirmation carefully, as your order will be prepared based on the information provided above.\n\nOnce confirmed, any amendments or errors will not be our responsibility.\nImportant: Voucher orders are final and cannot be amended under any circumstances.\n\nWe will proceed with payment once everything is confirmed 😊",
    "allowed": [
      "staff_name",
      "order_details"
    ],
    "required": [
      "staff_name",
      "order_details"
    ],
    "sample": {
      "staff_name": "Ari",
      "order_details": "🟠 Pick-up order: 14/8 (Fri)\n\nOrdered by: Sample Customer\nPhone No: 0123456789\nTime: 3pm\n\nWhole Cake;\n~ Sample Cake 1kg x1\n\nAmount: RM135.00"
    }
  },
  {
    "key": "payment_request_wb_qr_initial",
    "category": "Payment Request",
    "displayName": "Payment Request — Whitebird QR (Initial)",
    "description": "First payment request using the standard Whitebird QR. Amount and payment instructions remain application-controlled.",
    "body": "Thank you for confirming. ;)\n\nHere are the payment details.\n\n{{amount_block}}\n\n{{payment_instruction}}\n\n{{slip_instruction}}",
    "allowed": [
      "amount_block",
      "payment_instruction",
      "slip_instruction"
    ],
    "required": [
      "amount_block",
      "payment_instruction",
      "slip_instruction"
    ],
    "sample": {
      "amount_block": "Amount: RM135.00",
      "payment_instruction": "Please make payment using the Whitebird QR code below.",
      "slip_instruction": "Do send us the payment slip WITH Status (Successful etc) once payment is completed ya. 😊"
    }
  },
  {
    "key": "payment_request_wb_qr_outstanding",
    "category": "Payment Request",
    "displayName": "Payment Request — Whitebird QR (Outstanding Balance)",
    "description": "Follow-up request for the calculated outstanding balance using the standard Whitebird QR.",
    "body": "Thank you for confirming. ;)\n\nHere are the payment details.\n\n{{amount_block}}\n\n{{payment_instruction}}\n\n{{slip_instruction}}",
    "allowed": [
      "amount_block",
      "payment_instruction",
      "slip_instruction"
    ],
    "required": [
      "amount_block",
      "payment_instruction",
      "slip_instruction"
    ],
    "sample": {
      "amount_block": "Order Total: RM270.00\nPayment Received: RM100.00\nBalance to Pay: RM170.00",
      "payment_instruction": "Please make payment of RM170.00 using the Whitebird QR code below.",
      "slip_instruction": "Do send us the payment slip WITH Status (Successful etc) once payment is completed ya. 😊"
    }
  },
  {
    "key": "payment_request_wb_qr_wholecake_preorder",
    "category": "Payment Request",
    "displayName": "Payment Request — Wholecake Preorder QR",
    "description": "Wholecake-preorder QR scenario. QR scope and payment-slip instructions are protected application blocks.",
    "body": "Thank you for confirming. ;)\n\nHere are the payment details:\n\n{{amount_block}}\n\n{{payment_instructions}}\n\n{{slip_instruction}}",
    "allowed": [
      "amount_block",
      "payment_instructions",
      "slip_instruction"
    ],
    "required": [
      "amount_block",
      "payment_instructions",
      "slip_instruction"
    ],
    "sample": {
      "amount_block": "Amount: RM135.00",
      "payment_instructions": "Please make payment using the attached Whitebird Wholecake Preorder Payment QR.\n\nJust a note — this QR is for wholecake preorder payments only. It is not for dine-in, beverages, or other items.",
      "slip_instruction": "Once payment is completed, please send us the payment slip within 24 hours, with the payment status clearly shown (e.g. “Successful”) ya. 😊"
    }
  },
  {
    "key": "payment_request_online_transfer_initial",
    "category": "Payment Request",
    "displayName": "Payment Request — Online Transfer (Initial)",
    "description": "First payment request by online bank transfer. Payment destination and amount block are structured and protected.",
    "body": "Thank you for confirming. ;)\n\nHere are the payment details.\n\n{{amount_block}}\n\n{{payment_destination}}\n\n{{slip_instruction}}",
    "allowed": [
      "amount_block",
      "payment_destination",
      "slip_instruction"
    ],
    "required": [
      "amount_block",
      "payment_destination",
      "slip_instruction"
    ],
    "sample": {
      "amount_block": "Amount: RM135.00",
      "payment_destination": "Bank: [configured bank]\nAccount Name: [configured account]\nAccount No.: [configured account number]",
      "slip_instruction": "Do send us the payment slip WITH Status (Successful etc) once payment is completed ya. 😊"
    }
  },
  {
    "key": "payment_request_online_transfer_outstanding",
    "category": "Payment Request",
    "displayName": "Payment Request — Online Transfer (Outstanding Balance)",
    "description": "Follow-up bank transfer request for the calculated outstanding balance.",
    "body": "Thank you for confirming. ;)\n\nHere are the payment details.\n\n{{amount_block}}\n\n{{payment_instruction}}\n\n{{payment_destination}}\n\n{{slip_instruction}}",
    "allowed": [
      "amount_block",
      "payment_instruction",
      "payment_destination",
      "slip_instruction"
    ],
    "required": [
      "amount_block",
      "payment_instruction",
      "payment_destination",
      "slip_instruction"
    ],
    "sample": {
      "amount_block": "Order Total: RM270.00\nPayment Received: RM100.00\nBalance to Pay: RM170.00",
      "payment_instruction": "Please transfer RM170.00 using the details below.",
      "payment_destination": "Bank: [configured bank]\nAccount Name: [configured account]\nAccount No.: [configured account number]",
      "slip_instruction": "Do send us the payment slip WITH Status (Successful etc) once payment is completed ya. 😊"
    }
  },
  {
    "key": "payment_thank_you_pickup",
    "category": "Payment Thank You",
    "displayName": "Payment Thank You — Pickup",
    "description": "Shown after a verified payment allocation for a pickup order.",
    "body": "Thank you for your payment!\n\nIn case someone is picking up on your behalf please make sure that him/her knows that it’s under whose order and the contents of the order to avoid mishandling of the cake ya. 🙏😬\n\nThank you and see you soon! ❤️",
    "allowed": [],
    "required": [],
    "sample": {}
  },
  {
    "key": "payment_thank_you_dine_in",
    "category": "Payment Thank You",
    "displayName": "Payment Thank You — Dine-in",
    "description": "Shown after a verified payment allocation for a dine-in order.",
    "body": "Thank you for your payment!\n\nKindly inform our crew on the day when you want the cake being served and we will take care of the rest ya. ☺️\n\nThank you and see you soon! ❤️",
    "allowed": [],
    "required": [],
    "sample": {}
  },
  {
    "key": "payment_thank_you_delivery_same_inform",
    "category": "Payment Thank You",
    "displayName": "Payment Thank You — Delivery (Same Recipient, Inform)",
    "description": "Delivery thank-you for the same orderer/recipient when the existing notification preference permits informing them.",
    "body": "Thank you for your payment!\n\nWe will inform you before delivery on that day ya!\n\nOnce we’ve arrange grab we will send you the grab link as well as photo for your reference ;)",
    "allowed": [],
    "required": [],
    "sample": {}
  },
  {
    "key": "payment_thank_you_delivery_same_do_not_inform",
    "category": "Payment Thank You",
    "displayName": "Payment Thank You — Delivery (Same Recipient, No Notification)",
    "description": "Delivery thank-you for the same orderer/recipient when the current preference is do not inform.",
    "body": "Thank you for your payment!\n\nYour delivery is arranged as confirmed.\n\nThank you and see you soon! ❤️",
    "allowed": [],
    "required": [],
    "sample": {}
  },
  {
    "key": "payment_thank_you_delivery_different_inform",
    "category": "Payment Thank You",
    "displayName": "Payment Thank You — Delivery (Different Recipient, Inform)",
    "description": "Delivery thank-you when the recipient differs and the existing notification preference permits messaging them.",
    "body": "Thank you for your payment!\n\nWe will inform you and also message recipient before delivery on that day ya!\n\nOnce we’ve arrange grab we will send you the grab link as well as photo for your reference ;)",
    "allowed": [],
    "required": [],
    "sample": {}
  },
  {
    "key": "payment_thank_you_delivery_different_do_not_inform",
    "category": "Payment Thank You",
    "displayName": "Payment Thank You — Delivery (Different Recipient, No Notification)",
    "description": "Delivery thank-you when the recipient differs but the existing preference is do not inform. Recipient routing remains application-controlled.",
    "body": "Thank you for your payment!\n\nWe will inform you before delivery on that day ya!\n\nOnce we’ve arrange grab we will send you the grab link as well as photo for your reference ;)",
    "allowed": [],
    "required": [],
    "sample": {}
  },
  {
    "key": "ready_pickup",
    "category": "Ready for Pickup",
    "displayName": "Ready for Pickup",
    "description": "Shared by Order and Collection workspaces for the standard pickup-ready message. Required pickup instructions remain protected blocks.",
    "body": "Good morning, {{sender_name}} here ☀️\n{{ready_notice}}\n{{counter_instruction}}\n\n{{grabexpress_instruction}}\n\n{{car_plate_instruction}}\n\n{{pickup_hours}}\n\n{{closing_remarks}}",
    "allowed": [
      "sender_name",
      "ready_notice",
      "counter_instruction",
      "grabexpress_instruction",
      "car_plate_instruction",
      "pickup_hours",
      "closing_remarks"
    ],
    "required": [
      "sender_name",
      "ready_notice",
      "counter_instruction",
      "pickup_hours"
    ],
    "sample": {
      "sender_name": "Ari",
      "ready_notice": "Just to let you know that your order is ready for pick up ✨",
      "counter_instruction": "Kindly mention the Order Name and Cake Flavour at the Whitebird counter ya 😉",
      "grabexpress_instruction": "If you would like to arrange GrabExpress, we recommend placing the booking before 3:00pm to avoid difficulty getting a driver and possible traffic delays.",
      "car_plate_instruction": "💛 We can also help bring the cake down if needed. Just send us your driver’s:\n🚗 Car Plate Number: __________ (when you have arrived) __________",
      "pickup_hours": "A gentle reminder that last pickup will be as follow.\nMon, Tue & Thurs :5:30pm\nWed :3:00pm\nFri-Sun :9:30pm",
      "closing_remarks": "Thank you, and hope to see you soon! 🤭"
    }
  },
  {
    "key": "ready_pickup_closed",
    "category": "Ready for Pickup",
    "displayName": "Ready for Pickup — Whitebird Closed",
    "description": "Used by Collection when Whitebird is closed. The contact number and closed-door instructions are protected.",
    "body": "Good morning, {{sender_name}} here ☀️\n{{ready_line}}\n\n{{call_instruction}}\n{{missed_call_remarks}}",
    "allowed": [
      "sender_name",
      "ready_line",
      "call_instruction",
      "missed_call_remarks"
    ],
    "required": [
      "sender_name",
      "ready_line",
      "call_instruction"
    ],
    "sample": {
      "sender_name": "Ari",
      "ready_line": "Just to let you know that your order above is ready for pickup ya from now until latest 5:30pm ya.",
      "call_instruction": "Do give us a CALL at [Whitebird contact number] when you arrive as we are closed today so we will open the door for you ya.",
      "missed_call_remarks": "(we might miss the message so please call, thank you)"
    }
  },
  {
    "key": "delivery_ready_scheduled",
    "category": "Delivery Ready",
    "displayName": "Delivery Ready — Scheduled Delivery",
    "description": "Existing scheduled-delivery branch. The delivery-ready status and scheduled time remain protected.",
    "body": "Good morning, {{sender_name}} here.\n{{scheduled_delivery_line}}\n{{earlier_delivery_invitation}}",
    "allowed": [
      "sender_name",
      "scheduled_delivery_line",
      "earlier_delivery_invitation"
    ],
    "required": [
      "sender_name",
      "scheduled_delivery_line"
    ],
    "sample": {
      "sender_name": "Ari",
      "ready_status": "Just to inform you that your order is ready for delivery anytime now",
      "scheduled_delivery_instruction": "we will arrange delivery base on your schedule at 3pm.",
      "earlier_delivery_invitation": "Do let us know if you like to deliver earlier ya ;)",
      "scheduled_delivery_line": "Just to inform you that your order is ready for delivery anytime now, we will arrange delivery base on your schedule at 3:00pm."
    }
  },
  {
    "key": "delivery_ready_contact_recipient",
    "category": "Delivery Ready",
    "displayName": "Delivery Ready — Contact Recipient",
    "description": "Used only when the existing different-recipient and notify rules direct staff to contact the recipient.",
    "body": "Good morning, {{sender_name}} here.\n{{ready_status}}\n{{recipient_contact_instruction}}",
    "allowed": [
      "sender_name",
      "ready_status",
      "recipient_contact_instruction"
    ],
    "required": [
      "sender_name",
      "ready_status",
      "recipient_contact_instruction"
    ],
    "sample": {
      "sender_name": "Ari",
      "ready_status": "Just to inform you that your order is ready for delivery anytime now.",
      "recipient_contact_instruction": "We will contact the recipient for arranging the delivery ya ;)"
    }
  },
  {
    "key": "out_for_delivery",
    "category": "Out for Delivery",
    "displayName": "Out for Delivery",
    "description": "Prepared for the orderer and, under existing rules, separately for the recipient.",
    "body": "Rider has picked up the order and is on his way ya!",
    "allowed": [],
    "required": [],
    "sample": {}
  },
  {
    "key": "general_thank_you",
    "category": "General Thank You",
    "displayName": "General Thank You",
    "description": "General customer thank-you offered at the existing fulfillment stages.",
    "body": "Thank you for the order and hope you enjoy ya ;)\n\nIf there’s anything please do not hesitate to let us know so we can improve and serve you better !\n\nThank you once again and have a nice day ahead!",
    "allowed": [],
    "required": [],
    "sample": {}
  },
  {
    "key": "waiting_list_confirmation",
    "category": "Waiting List Confirmation",
    "displayName": "Waiting List Confirmation",
    "description": "Generated after staff issues an eligible confirmation link. The URL, token-derived link, deadline and required instructions remain application-controlled.",
    "body": "Hi {{customer_name}} 👋\n\nGood news — we can proceed with your Whitebird Waiting List request for {{pickup_date}}.\n\nYour request:\n{{item_lines}}\n\n{{confirmation_link_instruction}}\n\n{{confirmation_url}}\n\nPlease complete your confirmation by {{deadline}}.\n\n{{expiry_instruction}}\n\nThank you! 🤍",
    "allowed": [
      "customer_name",
      "pickup_date",
      "item_lines",
      "confirmation_link_instruction",
      "confirmation_url",
      "deadline",
      "expiry_instruction"
    ],
    "required": [
      "customer_name",
      "pickup_date",
      "item_lines",
      "confirmation_link_instruction",
      "confirmation_url",
      "deadline",
      "expiry_instruction"
    ],
    "sample": {
      "customer_name": "Sample Customer",
      "pickup_date": "Friday, 14 August",
      "item_lines": "• Sample Cake · 1kg × 1",
      "confirmation_link_instruction": "Please use the link below to confirm your fulfilment details and any options:",
      "confirmation_url": "https://dev.whitebird.asia/order/waiting-list/confirm/SAMPLE-ONLY",
      "deadline": "Friday, 14 August at 12:00pm",
      "expiry_instruction": "The confirmation link will expire after this deadline."
    }
  }
] as const satisfies readonly CustomerMessageTemplateDefinition[];
export type CustomerMessageTemplateKey = typeof CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS[number]["key"];

const definitionMap = new Map<string, CustomerMessageTemplateDefinition>(
  CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.map((row) => [row.key, row]),
);

export function getCustomerMessageTemplateDefinition(key: string) {
  return definitionMap.get(key as CustomerMessageTemplateKey) ?? null;
}

export function validateCustomerMessageTemplateBody(key: string, body: string): { valid: true } | { valid: false; reason: string } {
  const definition = getCustomerMessageTemplateDefinition(key);
  if (!definition) return { valid: false, reason: "Unknown template." };
  if (!body.trim()) return { valid: false, reason: "Message body cannot be empty." };
  if (body.length > 12000) return { valid: false, reason: "Message body is too long." };
  if (/(?:sb_secret_[a-z0-9_-]{16,}|eyJ[a-z0-9_-]{24,}\.[a-z0-9_-]{12,}|SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET|RESEND_API_KEY)/i.test(body)) {
    return { valid: false, reason: "This text appears to contain a credential. Remove it before saving." };
  }
  const matches = [...body.matchAll(/\{\{([^{}]+)\}\}/g)];
  const tokens = matches.map((match) => match[1] ?? "");
  const withoutTokens = body.replace(/\{\{[^{}]+\}\}/g, "");
  if (/[{}]/.test(withoutTokens)) return { valid: false, reason: "Template placeholders must use the {{placeholder_name}} format." };
  const definitionAllowed = new Set<string>(definition.allowed);
  const unknown = [...new Set(tokens.filter((token) => !definitionAllowed.has(token)))];
  if (unknown.length) return { valid: false, reason: "Unknown placeholder: " + unknown.join(", ") + "." };
  const missing = definition.required.filter((token) => !tokens.includes(token));
  if (missing.length) return { valid: false, reason: "Required information block missing: " + missing.join(", ") + "." };
  return { valid: true };
}

export function renderCustomerMessageTemplate(key: string, templates: CustomerMessageTemplateRows | undefined, values: Record<string, string>, fallbackMessage: string): string {
  const definition = getCustomerMessageTemplateDefinition(key);
  if (!definition) return fallbackMessage;
  const candidate = templates?.[key as CustomerMessageTemplateKey];
  if (!candidate) return fallbackMessage;
  const validation = validateCustomerMessageTemplateBody(key, candidate);
  if (!validation.valid) return fallbackMessage;
  const tokens = [...candidate.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1] ?? "");
  for (const token of tokens) {
    if (!Object.prototype.hasOwnProperty.call(values, token)) return fallbackMessage;
    if (definition.required.includes(token) && !values[token]?.trim()) return fallbackMessage;
  }
  const rendered = candidate.replace(/\{\{([^{}]+)\}\}/g, (_match, token: string) => values[token] ?? "");
  return rendered.trim() ? rendered : fallbackMessage;
}

export function renderCustomerMessagePreview(key: string, body: string): string {
  const definition = getCustomerMessageTemplateDefinition(key);
  if (!definition) return "";
  const validation = validateCustomerMessageTemplateBody(key, body);
  if (!validation.valid) return validation.reason;
  const rendered = body.replace(/\{\{([^{}]+)\}\}/g, (_match, token: string) => definition.sample[token] ?? "");
  return rendered;
}

export function customerMessageTemplateSample(key: string) {
  const definition = getCustomerMessageTemplateDefinition(key);
  return definition ? renderCustomerMessagePreview(key, definition.body) : "";
}