import { STAFF_NOTIFICATION_DEFINITIONS } from "@/foundation/staff/notification-preferences";

let soundContext: AudioContext | null = null;

export function shouldPlayStaffNotificationSound(input: {
  code: string;
  soundEnabled?: boolean | null;
}): boolean {
  return (
    input.soundEnabled === true &&
    STAFF_NOTIFICATION_DEFINITIONS.some(
      (definition) => definition.code === input.code,
    )
  );
}

/**
 * Recovered events are coalesced into at most one cue per pass. If a warning
 * category is present, prefer it over earlier informational events so the
 * bounded sound policy does not let an earlier routine event mask it.
 */
export function recoveredStaffNotificationSoundPriority(input: {
  code: string;
  soundEnabled?: boolean | null;
}): number {
  if (!shouldPlayStaffNotificationSound(input)) return 0;
  return [
    "order_cancelled",
    "approval_required",
    "last_minute",
    "fresh_pick_walk_in_hold_reminder",
  ].includes(input.code)
    ? 2
    : 1;
}

/** Call only from an explicit staff gesture to satisfy browser audio policies. */
export function primeStaffNotificationSound(): void {
  if (typeof window === "undefined" || !window.AudioContext) return;

  try {
    soundContext ??= new window.AudioContext();
    if (soundContext.state === "suspended") {
      void soundContext.resume().catch(() => undefined);
    }
  } catch {
    // Audio is optional and must never affect staff workflows.
  }
}

/** Plays a short, quiet two-note cue. Browser/device failures are intentionally ignored. */
export async function playStaffNotificationSound(): Promise<void> {
  if (typeof window === "undefined" || !window.AudioContext) return;

  try {
    soundContext ??= new window.AudioContext();
    if (soundContext.state === "suspended") {
      await soundContext.resume();
    }
    if (soundContext.state !== "running") return;

    const startAt = soundContext.currentTime;
    for (const [offset, frequency] of [
      [0, 880],
      [0.14, 660],
    ] as const) {
      const oscillator = soundContext.createOscillator();
      const gain = soundContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt + offset);
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, startAt + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.12);
      oscillator.connect(gain);
      gain.connect(soundContext.destination);
      oscillator.start(startAt + offset);
      oscillator.stop(startAt + offset + 0.13);
    }
  } catch {
    // Audio is best-effort and cannot block or fail notification rendering.
  }
}
