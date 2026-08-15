import type { ApprovalChangeLine } from "@/engines/operations/approval-change-summary";

type ApprovalChangeLinesProps = {
  lines: ApprovalChangeLine[];
  className?: string;
};

/**
 * Renders system-derived Change Requested lines with clear quantity hierarchy:
 * secondary old values (muted; struck when decreasing), primary new values (bold).
 */
export function ApprovalChangeLines({
  lines,
  className = "",
}: ApprovalChangeLinesProps) {
  if (lines.length === 0) return null;

  const body =
    lines.length === 1 ? (
      <p className="text-sm leading-relaxed">
        <ChangeLineParts line={lines[0]!} />
      </p>
    ) : (
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
        {lines.map((line) => (
          <li key={line.plain}>
            <ChangeLineParts line={line} />
          </li>
        ))}
      </ul>
    );

  return className ? <div className={className}>{body}</div> : body;
}

function ChangeLineParts({ line }: { line: ApprovalChangeLine }) {
  return (
    <>
      {line.parts.map((part, index) => {
        if (part.kind === "struck") {
          return (
            <s
              className="text-ink/40 decoration-ink/35 font-normal"
              key={`${line.plain}-s-${index}`}
            >
              {part.text}
            </s>
          );
        }
        if (part.kind === "muted") {
          return (
            <span
              className="text-ink/40 font-normal"
              key={`${line.plain}-m-${index}`}
            >
              {part.text}
            </span>
          );
        }
        if (part.kind === "emphasis") {
          return (
            <strong
              className="text-ink font-bold"
              key={`${line.plain}-e-${index}`}
            >
              {part.text}
            </strong>
          );
        }
        if (part.text === " → ") {
          return (
            <span
              className="text-ink/35 font-normal"
              key={`${line.plain}-a-${index}`}
            >
              {part.text}
            </span>
          );
        }
        return (
          <span
            className="text-ink/70 font-normal"
            key={`${line.plain}-t-${index}`}
          >
            {part.text}
          </span>
        );
      })}
    </>
  );
}
