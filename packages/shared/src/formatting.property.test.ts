import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { truncateSummary } from "./formatting.js";
import { SUMMARY_MAX_CHARS } from "./constants.js";

describe("Feature: context-switcher, Property 7: Summary truncation to 80 characters", () => {
  /**
   * Validates: Requirements 3.1, 3.3
   *
   * For any string, truncateSummary output is at most 80 characters.
   */
  it("output is always at most 80 characters for any input string", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = truncateSummary(input);
        expect(result.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 3.1, 3.3
   *
   * For strings ≤ 80 chars, the output equals the input exactly.
   */
  it("returns the input unchanged when length is at most 80 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: SUMMARY_MAX_CHARS }),
        (input) => {
          const result = truncateSummary(input);
          expect(result).toBe(input);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 3.1, 3.3
   *
   * For strings > 80 chars, the output ends with "…" and has length exactly 80.
   */
  it("truncates strings over 80 characters to exactly 80 chars ending with ellipsis", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: SUMMARY_MAX_CHARS + 1 }),
        (input) => {
          const result = truncateSummary(input);
          expect(result.length).toBe(SUMMARY_MAX_CHARS);
          expect(result.endsWith("…")).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 3.1, 3.3
   *
   * The output always preserves a prefix of the original string.
   */
  it("output preserves a prefix of the original string", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = truncateSummary(input);
        if (input.length <= SUMMARY_MAX_CHARS) {
          // When not truncated, the entire string is preserved
          expect(input.startsWith(result)).toBe(true);
        } else {
          // When truncated, the result minus the ellipsis is a prefix of the input
          const prefix = result.slice(0, -1); // remove the trailing "…"
          expect(input.startsWith(prefix)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});
