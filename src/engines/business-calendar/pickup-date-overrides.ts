/**
 * Temporary code-config Special Operating Dates.
 * Same DTO shape a future Business Calendar / Admin UI can supply.
 * Empty by default — Product fills concrete YMD rows when ready.
 * No DB persistence / migration in this foundation slice.
 */

export type PickupScheduleBaseProfile =
  | "weekday"
  | "wednesday_walkin_closed"
  | "weekend_extended";

/**
 * Date-specific operating override.
 * - `closed`: no customer fulfilment / slots
 * - `special`: inherit weekly base (or forced baseProfile), then optional
 *   property overrides (e.g. shortened latestSelectable only)
 */
export type PickupDateOverride =
  | { mode: "closed" }
  | {
      mode: "special";
      /** Replace weekly weekday base (e.g. Wed PH → weekday). */
      baseProfile?: PickupScheduleBaseProfile;
      earliestSelectable?: string;
      usualPickupStart?: string;
      usualPickupEnd?: string;
      latestSelectable?: string;
    };

/**
 * YYYY-MM-DD → override. Prefer explicit Product-chosen dates only —
 * never auto-detect public holidays.
 */
export const PICKUP_DATE_OVERRIDES: Readonly<
  Record<string, PickupDateOverride>
> = {
  // Intentionally empty until Product supplies operating-date rows.
};
