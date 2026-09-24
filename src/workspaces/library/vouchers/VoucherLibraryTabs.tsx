import Link from "next/link";

type VoucherLibraryTabsProps = {
  active: "catalogue" | "rm10";
  showRm10: boolean;
};

const TAB_CLASS =
  "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium";

export function VoucherLibraryTabs({
  active,
  showRm10,
}: VoucherLibraryTabsProps) {
  return (
    <nav
      aria-label="Voucher Library types"
      className="border-fog flex flex-wrap gap-2 border-b pb-3"
    >
      <Link
        aria-current={active === "catalogue" ? "page" : undefined}
        className={
          active === "catalogue"
            ? `${TAB_CLASS} bg-ink text-mist`
            : `${TAB_CLASS} text-skyline hover:text-ink hover:bg-mist`
        }
        href="/library/vouchers"
      >
        All Vouchers
      </Link>
      {showRm10 ? (
        <Link
          aria-current={active === "rm10" ? "page" : undefined}
          className={
            active === "rm10"
              ? `${TAB_CLASS} bg-ink text-mist`
              : `${TAB_CLASS} text-skyline hover:text-ink hover:bg-mist`
          }
          href="/library/vouchers/rm10"
        >
          RM10 Physical Cards
        </Link>
      ) : null}
    </nav>
  );
}
