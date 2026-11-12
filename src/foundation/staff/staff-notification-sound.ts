import { STAFF_NOTIFICATION_DEFINITIONS } from "@/foundation/staff/notification-preferences";

export type StaffNotificationSoundResult = {
  contextState: string;
  resumeStatus: "not-needed" | "succeeded" | "failed";
  playbackStatus: "scheduled" | "failed" | "not-attempted";
  restriction:
    | "none"
    | "unsupported"
    | "context-create-failed"
    | "resume-rejected"
    | "context-not-running"
    | "schedule-failed";
};

let soundContext: AudioContext | null = null;
let resumeInProgress: Promise<void> | null = null;

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

function getAudioContext(): {
  context: AudioContext | null;
  restriction: "none" | "unsupported" | "context-create-failed";
} {
  if (typeof window === "undefined") {
    return { context: null, restriction: "unsupported" };
  }

  const audioWindow = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) {
    return { context: null, restriction: "unsupported" };
  }

  try {
    if (!soundContext || soundContext.state === "closed") {
      soundContext = new AudioContextConstructor();
      resumeInProgress = null;
    }
    return { context: soundContext, restriction: "none" };
  } catch {
    return { context: null, restriction: "context-create-failed" };
  }
}

async function resumeAudioContext(
  context: AudioContext,
): Promise<"not-needed" | "succeeded" | "failed"> {
  if (context.state === "running") return "not-needed";

  if (!resumeInProgress) {
    try {
      resumeInProgress = Promise.resolve(context.resume()).then(
        () => undefined,
        () => {
          throw new Error("audio-resume-failed");
        },
      );
    } catch {
      return "failed";
    }
  }

  try {
    await resumeInProgress;
    return readAudioContextState(context) === "running"
      ? "succeeded"
      : "failed";
  } catch {
    return "failed";
  } finally {
    resumeInProgress = null;
  }
}

function readAudioContextState(context: AudioContext): string {
  return context.state;
}

function reportPlaybackFailure(result: StaffNotificationSoundResult): void {
  console.warn("[staff-notifications] Sound playback unavailable", {
    contextState: result.contextState,
    resumeStatus: result.resumeStatus,
    playbackStatus: result.playbackStatus,
    restriction: result.restriction,
  });
}

function reportPlaybackScheduled(result: StaffNotificationSoundResult): void {
  console.info("[staff-notifications] Sound playback scheduled", {
    contextState: result.contextState,
    resumeStatus: result.resumeStatus,
    playbackStatus: result.playbackStatus,
    restriction: result.restriction,
  });
}

/**
 * Call from a direct staff gesture (for example, enabling Sound) to unlock
 * audio where the browser requires user activation. It never plays a cue.
 */
export function primeStaffNotificationSound(): void {
  const { context, restriction } = getAudioContext();
  if (!context) {
    reportPlaybackFailure({
      contextState: "unavailable",
      resumeStatus: "failed",
      playbackStatus: "not-attempted",
      restriction,
    });
    return;
  }

  if (context.state === "running") return;
  void resumeAudioContext(context).then((resumeStatus) => {
    if (resumeStatus !== "succeeded") {
      reportPlaybackFailure({
        contextState: context.state,
        resumeStatus,
        playbackStatus: "not-attempted",
        restriction:
          context.state === "running" ? "none" : "context-not-running",
      });
    }
  });
}

/** Plays the configured cue and reports scheduling status, never audibility. */
export async function playStaffNotificationSound(): Promise<StaffNotificationSoundResult> {
  const { context, restriction } = getAudioContext();
  if (!context) {
    const result: StaffNotificationSoundResult = {
      contextState: "unavailable",
      resumeStatus: "failed",
      playbackStatus: "not-attempted",
      restriction,
    };
    reportPlaybackFailure(result);
    return result;
  }

  const resumeStatus = await resumeAudioContext(context);
  const contextState: string = context.state;
  if (contextState !== "running") {
    const result: StaffNotificationSoundResult = {
      contextState,
      resumeStatus,
      playbackStatus: "not-attempted",
      restriction:
        resumeStatus === "failed" ? "resume-rejected" : "context-not-running",
    };
    reportPlaybackFailure(result);
    return result;
  }

  const scheduledNodes: AudioNode[] = [];
  try {
    const startAt = context.currentTime;
    for (const [offset, frequency] of [
      [0, 880],
      [0.14, 660],
    ] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt + offset);
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, startAt + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.12);
      oscillator.connect(gain);
      gain.connect(context.destination);
      scheduledNodes.push(oscillator, gain);
      oscillator.onended = () => {
        try {
          oscillator.disconnect();
          gain.disconnect();
        } catch {
          // Completed audio nodes are safe to ignore if already disconnected.
        }
      };
      oscillator.start(startAt + offset);
      oscillator.stop(startAt + offset + 0.13);
    }

    const result: StaffNotificationSoundResult = {
      contextState: context.state,
      resumeStatus,
      playbackStatus: "scheduled",
      restriction: "none",
    };
    reportPlaybackScheduled(result);
    return result;
  } catch {
    // Best-effort cleanup if a browser rejects partway through scheduling.
    // Audio cleanup errors are intentionally not exposed or propagated.
    for (const node of scheduledNodes) {
      try {
        node.disconnect();
      } catch {
        // Already-disconnected audio nodes are safe to ignore.
      }
    }
    const result: StaffNotificationSoundResult = {
      contextState: context.state,
      resumeStatus,
      playbackStatus: "failed",
      restriction: "schedule-failed",
    };
    reportPlaybackFailure(result);
    return result;
  }
}
