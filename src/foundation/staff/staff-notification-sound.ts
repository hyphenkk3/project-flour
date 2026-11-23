import { STAFF_NOTIFICATION_DEFINITIONS } from "@/foundation/staff/notification-preferences";

export type StaffNotificationSoundDiagnostic = {
  eventId: string;
  ownership: "winner" | "duplicate_suppressed";
  soundEnabled: boolean;
  eligible: boolean;
};

export function recordStaffNotificationSoundOwnership(
  input: StaffNotificationSoundDiagnostic,
): void {
  let visibility: "visible" | "hidden" | "unknown" = "unknown";
  try {
    visibility = document.visibilityState === "visible" ? "visible" : "hidden";
  } catch {
    // Best-effort metadata only.
  }
  console.info("[staff-notifications] audio ownership", {
    eventId: input.eventId,
    tabId: getTabDiagnosticId(),
    visibility,
    ownership: input.ownership,
    soundEnabled: input.soundEnabled,
    eligible: input.eligible,
    playback: "not-attempted",
  });
}

export type StaffNotificationSoundResult = {
  contextState:
    | "running"
    | "suspended"
    | "interrupted"
    | "closed"
    | "unavailable";
  contextStateBefore:
    | "running"
    | "suspended"
    | "interrupted"
    | "closed"
    | "unavailable";
  resume: "not-needed" | "succeeded" | "failed" | "timeout";
  playback: "scheduled" | "failed" | "not-attempted";
  restriction: "none" | "unsupported" | "resume-failed" | "schedule-failed";
};

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

let audioContext: AudioContext | null = null;
let tabDiagnosticId: string | null = null;

function getTabDiagnosticId(): string {
  if (tabDiagnosticId) return tabDiagnosticId;
  try {
    tabDiagnosticId = window.crypto.randomUUID();
  } catch {
    tabDiagnosticId = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return tabDiagnosticId;
}

function safeState(
  context: AudioContext | null,
): StaffNotificationSoundResult["contextState"] {
  if (!context) return "unavailable";
  const state = (context as AudioContext & { state: string }).state;
  return state === "running" ||
    state === "suspended" ||
    state === "interrupted" ||
    state === "closed"
    ? state
    : "unavailable";
}

function diagnostic(
  stage: string,
  eventId: string,
  ownership: StaffNotificationSoundDiagnostic["ownership"],
  soundEnabled: boolean,
  eligible: boolean,
  details: Record<string, string | boolean>,
) {
  let visibility: "visible" | "hidden" | "unknown" = "unknown";
  try {
    visibility = document.visibilityState === "visible" ? "visible" : "hidden";
  } catch {
    // Best-effort metadata only.
  }
  console.info("[staff-notifications] audio", {
    stage,
    eventId,
    tabId: getTabDiagnosticId(),
    visibility,
    ownership,
    soundEnabled,
    eligible,
    ...details,
  });
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const audioWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const Constructor = window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!Constructor) return null;
  try {
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new Constructor();
    }
    return audioContext;
  } catch {
    return null;
  }
}

/** Unlocks the shared context synchronously from a staff input gesture. */
export function primeStaffNotificationSound(): void {
  const audio = getAudioContext();
  if (!audio) {
    diagnostic("prime_unavailable", "manual-prime", "winner", true, true, {
      audioContextBefore: "unavailable",
      resumeAttempted: false,
    });
    return;
  }
  if (audio.state === "running") return;

  try {
    const resumePromise = audio.resume();
    void resumePromise.then(
      () => {
        diagnostic("prime_result", "manual-prime", "winner", true, true, {
          audioContextAfter: safeState(audio),
          resume: audio.state === "running" ? "succeeded" : "failed",
        });
      },
      () => {
        diagnostic("prime_result", "manual-prime", "winner", true, true, {
          audioContextAfter: safeState(audio),
          resume: "failed",
        });
      },
    );
  } catch {
    diagnostic("prime_result", "manual-prime", "winner", true, true, {
      audioContextAfter: safeState(audio),
      resume: "failed",
    });
  }
}

function stopAndRelease(nodes: AudioNode[], oscillators: OscillatorNode[]) {
  for (const oscillator of oscillators) {
    try {
      oscillator.stop();
    } catch {
      // It may already have stopped.
    }
  }
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      // Best-effort cleanup.
    }
  }
}

/** Uses one shared context and cue for the settings test and eligible notifications. */
export async function playStaffNotificationSound(
  context: Partial<StaffNotificationSoundDiagnostic> = {},
): Promise<StaffNotificationSoundResult> {
  const eventId = context.eventId ?? "manual-test";
  const ownership = context.ownership ?? "winner";
  const soundEnabled = context.soundEnabled ?? true;
  const eligible = context.eligible ?? true;
  const audio = getAudioContext();
  const before = safeState(audio);

  if (!audio) {
    const result: StaffNotificationSoundResult = {
      contextState: "unavailable",
      contextStateBefore: before,
      resume: "failed",
      playback: "not-attempted",
      restriction: "unsupported",
    };
    diagnostic("unavailable", eventId, ownership, soundEnabled, eligible, {
      audioContextBefore: before,
      resumeAttempted: false,
      playback: result.playback,
      restriction: result.restriction,
    });
    return result;
  }

  let resume: StaffNotificationSoundResult["resume"] = "not-needed";
  let resumePromise: Promise<void> | null = null;
  if (audio.state !== "running") {
    diagnostic("resume_started", eventId, ownership, soundEnabled, eligible, {
      audioContextBefore: before,
      resumeAttempted: true,
    });
    try {
      // Call resume and schedule the short cue before awaiting either one.
      // iOS Safari may require both operations to remain in the tap's gesture.
      resumePromise = audio.resume();
    } catch {
      resume = "failed";
    }
  }

  if (audio.state !== "running" && !resumePromise) {
    const result: StaffNotificationSoundResult = {
      contextState: safeState(audio),
      contextStateBefore: before,
      resume: "failed",
      playback: "not-attempted",
      restriction: "resume-failed",
    };
    diagnostic("resume_failed", eventId, ownership, soundEnabled, eligible, {
      audioContextBefore: before,
      audioContextAfter: result.contextState,
      resumeAttempted: true,
      resume: result.resume,
      playback: result.playback,
      restriction: result.restriction,
    });
    return result;
  }

  const scheduled: AudioNode[] = [];
  const oscillators: OscillatorNode[] = [];
  try {
    const startAt = audio.currentTime;
    for (const [offset, frequency] of [
      [0, 880],
      [0.14, 660],
    ] as const) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillators.push(oscillator);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt + offset);
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, startAt + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.12);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.onended = () => {
        try {
          oscillator.disconnect();
          gain.disconnect();
        } catch {
          /* already released */
        }
      };
      scheduled.push(oscillator, gain);
      oscillator.start(startAt + offset);
      oscillator.stop(startAt + offset + 0.13);
    }
    if (resumePromise) {
      let timeoutId: number | undefined;
      const outcome = await Promise.race([
        resumePromise.then(
          () => "settled" as const,
          () => "rejected" as const,
        ),
        new Promise<"timeout">((resolve) => {
          timeoutId = window.setTimeout(() => resolve("timeout"), 1500);
        }),
      ]);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      resume =
        outcome === "timeout"
          ? "timeout"
          : outcome === "rejected" || safeState(audio) !== "running"
            ? "failed"
            : "succeeded";
      if (resume !== "succeeded") {
        stopAndRelease(scheduled, oscillators);
        const failed: StaffNotificationSoundResult = {
          contextState: safeState(audio),
          contextStateBefore: before,
          resume,
          playback: "not-attempted",
          restriction: "resume-failed",
        };
        diagnostic("resume_failed", eventId, ownership, soundEnabled, eligible, {
          audioContextBefore: before,
          audioContextAfter: failed.contextState,
          resumeAttempted: true,
          resume: failed.resume,
          playback: failed.playback,
          restriction: failed.restriction,
        });
        return failed;
      }
    }

    const result: StaffNotificationSoundResult = {
      contextState: safeState(audio),
      contextStateBefore: before,
      resume: resumePromise ? resume : "not-needed",
      playback: "scheduled",
      restriction: "none",
    };
    diagnostic("playback_result", eventId, ownership, soundEnabled, eligible, {
      audioContextBefore: before,
      audioContextAfter: result.contextState,
      resumeAttempted: before !== "running",
      resume: result.resume,
      playback: result.playback,
      restriction: result.restriction,
    });
    return result;
  } catch {
    stopAndRelease(scheduled, oscillators);
    const result: StaffNotificationSoundResult = {
      contextState: safeState(audio),
      contextStateBefore: before,
      resume,
      playback: "failed",
      restriction: "schedule-failed",
    };
    diagnostic("playback_result", eventId, ownership, soundEnabled, eligible, {
      audioContextBefore: before,
      audioContextAfter: result.contextState,
      resumeAttempted: before !== "running",
      resume: result.resume,
      playback: result.playback,
      restriction: result.restriction,
    });
    return result;
  }
}
