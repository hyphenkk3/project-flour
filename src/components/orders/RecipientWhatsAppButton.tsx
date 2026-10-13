import {
  recipientWhatsAppLink,
  type RecipientWhatsAppInput,
} from "@/engines/orders/recipient-whatsapp";

export function RecipientWhatsAppButton(props: RecipientWhatsAppInput) {
  const link = recipientWhatsAppLink(props);
  if (!link.visible) return null;

  const className =
    "border-fog text-ink hover:bg-mist inline-flex min-h-11 w-full items-center justify-center rounded-lg border px-4 text-sm font-medium";

  return (
    <div className="space-y-1.5">
      {link.url ? (
        <a
          className={className}
          href={link.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          WhatsApp Recipient
        </a>
      ) : (
        <button
          className={`${className} cursor-not-allowed opacity-50`}
          disabled
          type="button"
        >
          WhatsApp Recipient
        </button>
      )}
      {link.reason ? (
        <p className="text-skyline text-xs">{link.reason}</p>
      ) : null}
    </div>
  );
}
