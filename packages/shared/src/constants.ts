/**
 * System-wide limits and thresholds for Context Switcher.
 *
 * These constants enforce the constraints defined in the requirements
 * and are shared across CLI validation, Lambda handlers, and tests.
 */

/** Maximum characters allowed in a developer-provided note (Requirement 1.3). */
export const NOTE_MAX_CHARS = 5000;

/** Maximum lines of terminal history to capture (Requirement 1.4). */
export const HISTORY_MAX_LINES = 50;

/** Maximum number of open pull requests to include in a snapshot (Requirement 4.1). */
export const PR_MAX = 20;

/** Maximum number of unresolved review comments to include (Requirement 4.2). */
export const COMMENTS_MAX = 50;

/** Byte threshold above which a snapshot payload overflows to S3 (Requirement 1.7). */
export const OVERFLOW_THRESHOLD_BYTES = 400_000;

/** Maximum characters for a truncated summary in list/history views (Requirements 3.1, 3.3). */
export const SUMMARY_MAX_CHARS = 80;

/** Maximum word count for AI-generated briefings (Requirement 8.2). */
export const BRIEFING_MAX_WORDS = 500;

/** Maximum number of projects for scheduled auto-capture (Requirement 7.1). */
export const AUTOCAPTURE_MAX_PROJECTS = 20;
