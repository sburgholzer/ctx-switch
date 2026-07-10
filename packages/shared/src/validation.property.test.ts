import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  validateNote,
  truncateHistory,
  truncatePRs,
  truncateComments,
} from "./validation.js";
import { calculatePayloadSize, needsOverflow } from "./overflow.js";
import { ValidationError } from "./errors.js";
import {
  NOTE_MAX_CHARS,
  HISTORY_MAX_LINES,
  PR_MAX,
  COMMENTS_MAX,
  OVERFLOW_THRESHOLD_BYTES,
} from "./constants.js";
import type { PullRequest, ReviewComment, Snapshot } from "./models.js";

// --- Arbitraries ---

const arbPullRequest: fc.Arbitrary<PullRequest> = fc.record({
  number: fc.nat(),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  url: fc.webUrl(),
  state: fc.constantFrom("open", "closed", "merged"),
});

const arbReviewComment: fc.Arbitrary<ReviewComment> = fc.record({
  prNumber: fc.nat(),
  body: fc.string({ minLength: 1, maxLength: 200 }),
  path: fc.string({ minLength: 1, maxLength: 100 }),
  line: fc.nat({ max: 10000 }),
  status: fc.constantFrom("open", "resolved", "dismissed"),
});

function arbSnapshot(opts?: { diffSize?: number }): fc.Arbitrary<Snapshot> {
  const diffArb = opts?.diffSize != null
    ? fc.constant("x".repeat(opts.diffSize))
    : fc.string({ minLength: 0, maxLength: 500 });

  return fc.record({
    projectId: fc.string({ minLength: 8, maxLength: 16, unit: "grapheme" }),
    projectName: fc.string({ minLength: 1, maxLength: 50 }),
    timestamp: fc.integer({ min: 0, max: 2524608000000 }).map((ms) => new Date(ms).toISOString()),
    source: fc.constantFrom("manual" as const, "auto" as const),
    git: fc.record({
      branch: fc.string({ minLength: 1, maxLength: 50 }),
      lastCommits: fc.array(fc.string({ minLength: 1, maxLength: 80 }), { minLength: 0, maxLength: 5 }),
      uncommittedDiff: diffArb,
      modifiedFiles: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 20 }),
    }),
    note: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
    terminalHistory: fc.option(
      fc.array(fc.string({ minLength: 0, maxLength: 100 }), { minLength: 0, maxLength: 10 }),
      { nil: undefined }
    ),
    github: fc.option(
      fc.record({
        pullRequests: fc.array(arbPullRequest, { minLength: 0, maxLength: 5 }),
        unresolvedComments: fc.array(arbReviewComment, { minLength: 0, maxLength: 10 }),
      }),
      { nil: undefined }
    ),
  });
}

// --- Property 2: Input field limits are enforced ---
// Validates: Requirements 1.3, 1.4

describe("Feature: context-switcher, Property 2: Input field limits are enforced", () => {
  it("validateNote does not throw for notes ≤ 5000 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: NOTE_MAX_CHARS }),
        (note) => {
          expect(() => validateNote(note)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("validateNote throws ValidationError for notes > 5000 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: NOTE_MAX_CHARS + 1, maxLength: NOTE_MAX_CHARS + 5000 }),
        (note) => {
          expect(() => validateNote(note)).toThrow(ValidationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("truncateHistory returns at most 50 lines", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 0, maxLength: 200 }), { minLength: 0, maxLength: 200 }),
        (lines) => {
          const result = truncateHistory(lines);
          expect(result.length).toBeLessThanOrEqual(HISTORY_MAX_LINES);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("truncateHistory returns the LAST lines when truncated", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 0, maxLength: 200 }), { minLength: HISTORY_MAX_LINES + 1, maxLength: 200 }),
        (lines) => {
          const result = truncateHistory(lines);
          const expected = lines.slice(-HISTORY_MAX_LINES);
          expect(result).toEqual(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("truncateHistory preserves all lines when input is within limit", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 0, maxLength: 200 }), { minLength: 0, maxLength: HISTORY_MAX_LINES }),
        (lines) => {
          const result = truncateHistory(lines);
          expect(result).toEqual(lines);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 4: Overflow routing by payload size ---
// Validates: Requirements 1.7

describe("Feature: context-switcher, Property 4: Overflow routing by payload size", () => {
  it("needsOverflow returns true when payload exceeds 400KB", () => {
    // Generate snapshots that are guaranteed to exceed threshold via large diff
    fc.assert(
      fc.property(
        arbSnapshot({ diffSize: OVERFLOW_THRESHOLD_BYTES + 1000 }),
        (snapshot) => {
          const size = calculatePayloadSize(snapshot);
          expect(size).toBeGreaterThan(OVERFLOW_THRESHOLD_BYTES);
          expect(needsOverflow(snapshot)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("needsOverflow returns false when payload is ≤ 400KB", () => {
    // Generate small snapshots that won't exceed threshold
    fc.assert(
      fc.property(
        arbSnapshot(),
        (snapshot) => {
          const size = calculatePayloadSize(snapshot);
          // Only assert on snapshots that are under the threshold
          fc.pre(size <= OVERFLOW_THRESHOLD_BYTES);
          expect(needsOverflow(snapshot)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("needsOverflow is consistent with calculatePayloadSize", () => {
    fc.assert(
      fc.property(
        arbSnapshot(),
        (snapshot) => {
          const size = calculatePayloadSize(snapshot);
          const overflow = needsOverflow(snapshot);
          if (size > OVERFLOW_THRESHOLD_BYTES) {
            expect(overflow).toBe(true);
          } else {
            expect(overflow).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 8: GitHub data respects configured maximums ---
// Validates: Requirements 4.1, 4.2

describe("Feature: context-switcher, Property 8: GitHub data respects configured maximums", () => {
  it("truncatePRs returns at most 20 pull requests", () => {
    fc.assert(
      fc.property(
        fc.array(arbPullRequest, { minLength: 0, maxLength: 100 }),
        (prs) => {
          const result = truncatePRs(prs);
          expect(result.length).toBeLessThanOrEqual(PR_MAX);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("truncatePRs preserves input when array length ≤ 20", () => {
    fc.assert(
      fc.property(
        fc.array(arbPullRequest, { minLength: 0, maxLength: PR_MAX }),
        (prs) => {
          const result = truncatePRs(prs);
          expect(result).toEqual(prs);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("truncatePRs returns the first 20 items when exceeding limit", () => {
    fc.assert(
      fc.property(
        fc.array(arbPullRequest, { minLength: PR_MAX + 1, maxLength: 100 }),
        (prs) => {
          const result = truncatePRs(prs);
          expect(result).toEqual(prs.slice(0, PR_MAX));
        }
      ),
      { numRuns: 100 }
    );
  });

  it("truncateComments returns at most 50 review comments", () => {
    fc.assert(
      fc.property(
        fc.array(arbReviewComment, { minLength: 0, maxLength: 150 }),
        (comments) => {
          const result = truncateComments(comments);
          expect(result.length).toBeLessThanOrEqual(COMMENTS_MAX);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("truncateComments preserves input when array length ≤ 50", () => {
    fc.assert(
      fc.property(
        fc.array(arbReviewComment, { minLength: 0, maxLength: COMMENTS_MAX }),
        (comments) => {
          const result = truncateComments(comments);
          expect(result).toEqual(comments);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("truncateComments returns the first 50 items when exceeding limit", () => {
    fc.assert(
      fc.property(
        fc.array(arbReviewComment, { minLength: COMMENTS_MAX + 1, maxLength: 150 }),
        (comments) => {
          const result = truncateComments(comments);
          expect(result).toEqual(comments.slice(0, COMMENTS_MAX));
        }
      ),
      { numRuns: 100 }
    );
  });
});
