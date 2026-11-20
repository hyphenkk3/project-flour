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
  contextState: "running" | "suspended" | "closed" | "unavailable";
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
  return context.state === "running" ||
    context.state === "suspended" ||
    context.state === "closed"
    ? context.state
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
  if (audio.state !== "running") {
    diagnostic("resume_started", eventId, ownership, soundEnabled, eligible, {
      audioContextBefore: before,
      resumeAttempted: true,
    });
    try {
      let timeoutId: number | undefined;
      const outcome = await Promise.race([
        audio.resume().then(
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
    } catch {
      resume = "failed";
    }
  }

  if (audio.state !== "running") {
    const result: StaffNotificationSoundResult = {
      contextState: safeState(audio),
      resume: resume === "not-needed" ? "failed" : resume,
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
  try {
    const startAt = audio.currentTime;
    for (const [offset, frequency] of [
      [0, 880],
      [0.14, 660],
    ] as const) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
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
    const result: StaffNotificationSoundResult = {
      contextState: safeState(audio),
      resume,
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
    for (const node of scheduled) {
      try {
        node.disconnect();
      } catch {
        /* best-effort cleanup */
      }
    }
    const result: StaffNotificationSoundResult = {
      contextState: safeState(audio),
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
