import { STAFF_NOTIFICATION_DEFINITIONS } from "@/foundation/staff/notification-preferences";
import {
  appendStaffNotificationRecoveryTrace,
  type RecoveryDiagnosticSource,
} from "@/foundation/staff/staff-notification-recovery-diagnostics";

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
type AudioResumeOutcome =
  "not-needed" | "succeeded" | "rejected" | "not-running";
let resumeInProgress: Promise<
  Exclude<AudioResumeOutcome, "not-needed">
> | null = null;
let diagnosticTabId: string | null = null;

export type StaffNotificationSoundDiagnosticContext = {
  eventId: string;
  source: RecoveryDiagnosticSource;
  soundPreferenceEnabled: boolean;
  soundEligible: boolean;
};

function getDiagnosticTabId(): string {
  if (diagnosticTabId) return diagnosticTabId;
  try {
    diagnosticTabId = window.crypto.randomUUID();
  } catch {
    diagnosticTabId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      (character) => {
        const value = Math.floor(Math.random() * 16);
        return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
      },
    );
  }
  return diagnosticTabId;
}

function safeAudioContextState(
  state: string | undefined,
): "running" | "suspended" | "closed" | "unavailable" {
  return state === "running" || state === "suspended" || state === "closed"
    ? state
    : "unavailable";
}

function recordSoundDiagnostic(
  context: StaffNotificationSoundDiagnosticContext,
  input: {
    stage: "ownership" | "attempt" | "resume_timeout" | "result";
    ownership: "winner" | "duplicate_suppressed";
    audioContextBefore?: string;
    audioContextAfter?: string;
    resumeAttempted?: boolean;
    resumeOutcome?:
      | "not_attempted"
      | "not_needed"
      | "pending"
      | "succeeded"
      | "rejected"
      | "not_running"
      | "timeout";
    playbackOutcome?: "not_attempted" | "scheduled" | "failed";
    restriction?: StaffNotificationSoundResult["restriction"];
  },
): void {
  if (typeof window === "undefined") return;
  let visibilityState: "visible" | "hidden" | "unknown" = "unknown";
  try {
    visibilityState =
      document.visibilityState === "visible" ? "visible" : "hidden";
  } catch {
    // Diagnostics remain best-effort when document state is unavailable.
  }
  appendStaffNotificationRecoveryTrace({
    kind: "sound_diagnostic",
    eventId: context.eventId,
    source: context.source,
    tabId: getDiagnosticTabId(),
    visibilityState,
    soundStage: input.stage,
    soundOwnership: input.ownership,
    soundPreferenceEnabled: context.soundPreferenceEnabled,
    soundEligible: context.soundEligible,
    audioContextBefore:
      input.audioContextBefore === undefined
        ? undefined
        : safeAudioContextState(input.audioContextBefore),
    audioContextAfter:
      input.audioContextAfter === undefined
        ? undefined
        : safeAudioContextState(input.audioContextAfter),
    soundResumeAttempted: input.resumeAttempted,
    soundResumeOutcome: input.resumeOutcome,
    soundPlaybackOutcome: input.playbackOutcome,
    soundRestriction: input.restriction?.replaceAll("-", "_") as
      | "none"
      | "unsupported"
      | "context_create_failed"
      | "resume_rejected"
      | "context_not_running"
      | "schedule_failed"
      | undefined,
    outcome:
      input.stage === "resume_timeout"
        ? "incomplete"
        : input.stage === "result"
          ? input.playbackOutcome === "scheduled"
            ? "success"
            : input.playbackOutcome === "failed"
              ? "failure"
              : "rejected"
          : "started",
    reason:
      input.resumeOutcome === "timeout"
        ? "audio_resume_timeout"
        : input.resumeOutcome === "rejected"
          ? "audio_resume_rejected"
          : input.resumeOutcome === "not_running"
            ? "audio_resume_not_running"
            : input.restriction === "schedule-failed"
              ? "audio_schedule_failed"
              : undefined,
  });
}

export function recordStaffNotificationSoundOwnership(input: {
  eventId: string;
  source: RecoveryDiagnosticSource;
  ownership: "winner" | "duplicate_suppressed";
  soundPreferenceEnabled: boolean;
  soundEligible: boolean;
}): void {
  recordSoundDiagnostic(input, {
    stage: "ownership",
    ownership: input.ownership,
    playbackOutcome: "not_attempted",
    resumeOutcome: "not_attempted",
  });
}

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
): Promise<AudioResumeOutcome> {
  if (context.state === "running") return "not-needed";

  if (!resumeInProgress) {
    try {
      resumeInProgress = Promise.resolve(context.resume()).then(
        () =>
          readAudioContextState(context) === "running"
            ? "succeeded"
            : "not-running",
        () => "rejected",
      );
    } catch {
      return "rejected";
    }
  }

  try {
    return await resumeInProgress;
  } catch {
    return "rejected";
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
  void resumeAudioContext(context).then((resumeOutcome) => {
    if (resumeOutcome !== "succeeded" && resumeOutcome !== "not-needed") {
      reportPlaybackFailure({
        contextState: context.state,
        resumeStatus: "failed",
        playbackStatus: "not-attempted",
        restriction:
          context.state === "running" ? "none" : "context-not-running",
      });
    }
  });
}

/** Plays the configured cue and reports scheduling status, never audibility. */
export async function playStaffNotificationSound(
  diagnostic?: StaffNotificationSoundDiagnosticContext,
): Promise<StaffNotificationSoundResult> {
  const { context, restriction } = getAudioContext();
  const audioContextBefore = context
    ? safeAudioContextState(context.state)
    : "unavailable";
  const resumeAttempted = Boolean(context && context.state !== "running");
  if (diagnostic) {
    recordSoundDiagnostic(diagnostic, {
      stage: "attempt",
      ownership: "winner",
      audioContextBefore,
      audioContextAfter: audioContextBefore,
      resumeAttempted,
      resumeOutcome: context
        ? resumeAttempted
          ? "pending"
          : "not_needed"
        : "not_attempted",
      playbackOutcome: "not_attempted",
      restriction: context ? "none" : restriction,
    });
  }
  if (!context) {
    const result: StaffNotificationSoundResult = {
      contextState: "unavailable",
      resumeStatus: "failed",
      playbackStatus: "not-attempted",
      restriction,
    };
    if (diagnostic) {
      recordSoundDiagnostic(diagnostic, {
        stage: "result",
        ownership: "winner",
        audioContextBefore,
        audioContextAfter: "unavailable",
        resumeAttempted: false,
        resumeOutcome: "not_attempted",
        playbackOutcome: "not_attempted",
        restriction,
      });
    }
    reportPlaybackFailure(result);
    return result;
  }

  let resumeTimedOut = false;
  const timeoutId =
    diagnostic && resumeAttempted
      ? window.setTimeout(() => {
          resumeTimedOut = true;
          recordSoundDiagnostic(diagnostic, {
            stage: "resume_timeout",
            ownership: "winner",
            audioContextBefore,
            audioContextAfter: safeAudioContextState(context.state),
            resumeAttempted: true,
            resumeOutcome: "timeout",
            playbackOutcome: "not_attempted",
          });
        }, 5000)
      : null;
  const resumeOutcome = await resumeAudioContext(context);
  if (timeoutId !== null) window.clearTimeout(timeoutId);
  const resumeStatus =
    resumeOutcome === "not-needed" || resumeOutcome === "succeeded"
      ? resumeOutcome
      : "failed";
  const contextState: string = context.state;
  const diagnosticResumeOutcome = resumeTimedOut
    ? "timeout"
    : resumeOutcome === "rejected"
      ? "rejected"
      : resumeOutcome === "not-running"
        ? "not_running"
        : resumeOutcome === "not-needed"
          ? "not_needed"
          : resumeOutcome;
  if (contextState !== "running") {
    const result: StaffNotificationSoundResult = {
      contextState,
      resumeStatus,
      playbackStatus: "not-attempted",
      restriction:
        resumeOutcome === "rejected"
          ? "resume-rejected"
          : "context-not-running",
    };
    if (diagnostic) {
      recordSoundDiagnostic(diagnostic, {
        stage: "result",
        ownership: "winner",
        audioContextBefore,
        audioContextAfter: safeAudioContextState(context.state),
        resumeAttempted,
        resumeOutcome: diagnosticResumeOutcome,
        playbackOutcome: "not_attempted",
        restriction: result.restriction,
      });
    }
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
    if (diagnostic) {
      recordSoundDiagnostic(diagnostic, {
        stage: "result",
        ownership: "winner",
        audioContextBefore,
        audioContextAfter: safeAudioContextState(context.state),
        resumeAttempted,
        resumeOutcome: diagnosticResumeOutcome,
        playbackOutcome: "scheduled",
        restriction: "none",
      });
    }
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
    if (diagnostic) {
      recordSoundDiagnostic(diagnostic, {
        stage: "result",
        ownership: "winner",
        audioContextBefore,
        audioContextAfter: safeAudioContextState(context.state),
        resumeAttempted,
        resumeOutcome: diagnosticResumeOutcome,
        playbackOutcome: "failed",
        restriction: "schedule-failed",
      });
    }
    reportPlaybackFailure(result);
    return result;
  }
}
