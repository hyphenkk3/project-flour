/**
 * Customer-facing FAQ helpers.
 * Database content is informational only — not operational rules.
 */

export type StorefrontFaqRecord = {
  id: string;
  question: string;
  answer: string;
  displayOrder: number;
  isActive: boolean;
};

export const FAQ_QUESTION_REQUIRED = "Enter a question.";
export const FAQ_ANSWER_REQUIRED = "Enter an answer.";

export function normalizeFaqQuestion(raw: string): string | null {
  const question = raw.trim().replace(/\s+/g, " ");
  return question ? question : null;
}

export function normalizeFaqAnswer(raw: string): string | null {
  const answer = raw.replace(/^\s+|\s+$/g, "");
  return answer ? answer : null;
}

export function sortFaqItems<T extends { displayOrder: number; question: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      a.displayOrder - b.displayOrder || a.question.localeCompare(b.question, "en"),
  );
}

export function activeFaqItems<T extends { isActive: boolean }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => row.isActive);
}

export function nextFaqDisplayOrder(
  rows: readonly { displayOrder: number }[],
): number {
  if (rows.length === 0) return 1;
  return Math.max(...rows.map((row) => row.displayOrder)) + 1;
}

export function moveFaqItemInOrder<
  T extends { id: string; displayOrder: number; question: string },
>(rows: readonly T[], id: string, direction: -1 | 1): T[] {
  const sorted = sortFaqItems(rows);
  const index = sorted.findIndex((row) => row.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) {
    return sorted.map((row, displayOrder) => ({
      ...row,
      displayOrder: displayOrder + 1,
    }));
  }
  const copy = [...sorted];
  const current = copy[index];
  const neighbor = copy[nextIndex];
  if (!current || !neighbor) return copy;
  copy[index] = neighbor;
  copy[nextIndex] = current;
  return copy.map((row, displayOrder) => ({
    ...row,
    displayOrder: displayOrder + 1,
  }));
}
