/**
 * Payload validation and truncation utilities for Context Switcher.
 *
 * These functions enforce the field-level limits defined in the requirements:
 * - Note length ≤ 5000 characters (Requirement 1.3)
 * - Terminal history ≤ 50 lines (Requirement 1.4)
 * - Pull requests ≤ 20 (Requirement 4.1)
 * - Review comments ≤ 50 (Requirement 4.2)
 */

import {
  NOTE_MAX_CHARS,
  HISTORY_MAX_LINES,
  PR_MAX,
  COMMENTS_MAX,
} from "./constants.js";
import { ValidationError } from "./errors.js";
import type { PullRequest, ReviewComment } from "./models.js";

/**
 * Validates that a note does not exceed the maximum allowed length.
 * Throws a ValidationError if the note is too long.
 *
 * @param note - The developer-provided note string to validate.
 * @throws {ValidationError} If note exceeds NOTE_MAX_CHARS (5000) characters.
 */
export function validateNote(note: string): void {
  if (note.length > NOTE_MAX_CHARS) {
    throw new ValidationError(
      `Note exceeds maximum length of ${NOTE_MAX_CHARS} characters (got ${note.length})`
    );
  }
}

/**
 * Truncates terminal history to the last HISTORY_MAX_LINES lines.
 * If the input has fewer lines than the limit, returns the array unchanged.
 *
 * @param lines - Array of terminal history lines.
 * @returns The last HISTORY_MAX_LINES (50) lines.
 */
export function truncateHistory(lines: string[]): string[] {
  if (lines.length <= HISTORY_MAX_LINES) {
    return lines;
  }
  return lines.slice(-HISTORY_MAX_LINES);
}

/**
 * Truncates pull requests to the first PR_MAX items.
 * If fewer than the limit, returns the array unchanged.
 *
 * @param prs - Array of pull requests from GitHub.
 * @returns The first PR_MAX (20) pull requests.
 */
export function truncatePRs(prs: PullRequest[]): PullRequest[] {
  if (prs.length <= PR_MAX) {
    return prs;
  }
  return prs.slice(0, PR_MAX);
}

/**
 * Truncates review comments to the first COMMENTS_MAX items.
 * If fewer than the limit, returns the array unchanged.
 *
 * @param comments - Array of review comments from GitHub.
 * @returns The first COMMENTS_MAX (50) review comments.
 */
export function truncateComments(comments: ReviewComment[]): ReviewComment[] {
  if (comments.length <= COMMENTS_MAX) {
    return comments;
  }
  return comments.slice(0, COMMENTS_MAX);
}
