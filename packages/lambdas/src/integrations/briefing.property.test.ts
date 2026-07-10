/**
 * Feature: context-switcher, Property 12: Briefing structure and content constraints
 * Validates: Requirements 8.1, 8.2, 8.3, 8.5
 *
 * For any valid snapshot, the generated briefing SHALL contain exactly four sections
 * in this order: "Last Session Summary", "Key Changes", "Open Items", "Suggested Next Steps".
 * The total briefing length SHALL be ≤ 500 words. Any developer-provided notes SHALL appear
 * verbatim in the "Open Items" section. Any section with no relevant snapshot data SHALL
 * display "None" under its heading.
 *
 * Since we cannot call Bedrock in tests, we test the parser/validator chain:
 * generate well-formed briefing texts, parse them, and verify the validators work correctly.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  parseBriefing,
  validateBriefing,
  validateVerbatimNotes,
  countWords,
  BRIEFING_SECTIONS,
} from "./briefing.js";

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate a short content string that uses a few words (1-15 words). */
const shortContentArb = fc
  .array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,12}$/), { minLength: 1, maxLength: 15 })
  .map((words) => words.join(" "));

/** Generate a developer note (non-empty, contains at least one non-whitespace char). */
const developerNoteArb = fc
  .array(fc.stringMatching(/^[a-zA-Z0-9.,!?_-]{1,20}$/), { minLength: 1, maxLength: 5 })
  .map((parts) => parts.join(" "))
  .filter((note) => note.trim().length > 0);

/**
 * Generate a well-formed briefing text with all 4 sections and content that
 * stays within the 500-word limit.
 */
const validBriefingTextArb = fc
  .tuple(shortContentArb, shortContentArb, shortContentArb, shortContentArb)
  .map(([summary, changes, openItems, nextSteps]) => {
    return [
      `## Last Session Summary`,
      summary,
      ``,
      `## Key Changes`,
      `- ${changes}`,
      ``,
      `## Open Items`,
      `- ${openItems}`,
      ``,
      `## Suggested Next Steps`,
      `1. ${nextSteps}`,
    ].join("\n");
  })
  .filter((text) => countWords(text) <= 500);

/**
 * Generate a briefing text that includes a specific developer note in Open Items.
 */
function briefingWithNoteArb(noteArb: fc.Arbitrary<string>) {
  return fc
    .tuple(shortContentArb, shortContentArb, noteArb, shortContentArb)
    .map(([summary, changes, note, nextSteps]) => {
      return {
        text: [
          `## Last Session Summary`,
          summary,
          ``,
          `## Key Changes`,
          `- ${changes}`,
          ``,
          `## Open Items`,
          `- ${note}`,
          ``,
          `## Suggested Next Steps`,
          `1. ${nextSteps}`,
        ].join("\n"),
        note,
      };
    })
    .filter(({ text }) => countWords(text) <= 500);
}

/**
 * Generate a briefing text that exceeds 500 words.
 */
const overLimitBriefingTextArb = fc
  .integer({ min: 100, max: 150 })
  .map((extraWords) => {
    const bulkContent = Array(480).fill("word").join(" ");
    const extra = Array(extraWords).fill("extra").join(" ");
    return [
      `## Last Session Summary`,
      `${bulkContent} ${extra}`,
      ``,
      `## Key Changes`,
      `- Change made`,
      ``,
      `## Open Items`,
      `None`,
      ``,
      `## Suggested Next Steps`,
      `1. Do something`,
    ].join("\n");
  })
  .filter((text) => countWords(text) > 500);

/**
 * Generate a briefing text where one or more sections show "None".
 */
const briefingWithNoneSectionsArb = fc
  .tuple(
    fc.constantFrom("None"),
    fc.constantFrom("None"),
    fc.constantFrom("None"),
    fc.constantFrom("None"),
    shortContentArb
  )
  .chain(([_s1, _s2, _s3, _s4, content]) => {
    // Pick which sections are "None" (at least one)
    return fc
      .subarray(["summary", "changes", "openItems", "nextSteps"] as const, {
        minLength: 1,
        maxLength: 4,
      })
      .map((noneSections) => {
        const summary = noneSections.includes("summary") ? "None" : content;
        const changes = noneSections.includes("changes") ? "None" : `- ${content}`;
        const openItems = noneSections.includes("openItems") ? "None" : `- ${content}`;
        const nextSteps = noneSections.includes("nextSteps") ? "None" : `1. ${content}`;
        return [
          `## Last Session Summary`,
          summary,
          ``,
          `## Key Changes`,
          changes,
          ``,
          `## Open Items`,
          openItems,
          ``,
          `## Suggested Next Steps`,
          nextSteps,
        ].join("\n");
      });
  })
  .filter((text) => countWords(text) <= 500);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe("Property 12: Briefing structure and content constraints", () => {
  /**
   * Validates: Requirements 8.1, 8.2
   *
   * For any valid briefing text ≤ 500 words with all 4 sections:
   * parseBriefing returns exactly 4 sections in the correct order,
   * and validateBriefing passes.
   */
  it("valid briefing texts parse into exactly 4 sections in correct order and pass validation", () => {
    fc.assert(
      fc.property(validBriefingTextArb, (briefingText) => {
        const briefing = parseBriefing(briefingText);

        // Exactly 4 sections
        expect(briefing.sections).toHaveLength(4);

        // Correct order
        expect(briefing.sections[0].heading).toBe("Last Session Summary");
        expect(briefing.sections[1].heading).toBe("Key Changes");
        expect(briefing.sections[2].heading).toBe("Open Items");
        expect(briefing.sections[3].heading).toBe("Suggested Next Steps");

        // Sections match the BRIEFING_SECTIONS constant
        for (let i = 0; i < BRIEFING_SECTIONS.length; i++) {
          expect(briefing.sections[i].heading).toBe(BRIEFING_SECTIONS[i]);
        }

        // validateBriefing passes
        const validation = validateBriefing(briefing);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirement 8.3
   *
   * For any briefing text with a developer note in Open Items:
   * validateVerbatimNotes returns true.
   */
  it("developer notes in Open Items are detected by validateVerbatimNotes", () => {
    fc.assert(
      fc.property(briefingWithNoteArb(developerNoteArb), ({ text, note }) => {
        const briefing = parseBriefing(text);

        // The note should be found verbatim in the Open Items section
        expect(validateVerbatimNotes(briefing, note)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirement 8.2
   *
   * For any briefing text > 500 words: validateBriefing returns invalid
   * with a word count error.
   */
  it("briefings exceeding 500 words fail validation with word count error", () => {
    fc.assert(
      fc.property(overLimitBriefingTextArb, (briefingText) => {
        const briefing = parseBriefing(briefingText);
        const validation = validateBriefing(briefing);

        // Should be invalid
        expect(validation.valid).toBe(false);

        // Should have a word count error
        expect(
          validation.errors.some((e) => e.includes("500 word limit"))
        ).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirement 8.5
   *
   * For any briefing text with an empty section showing "None":
   * validateBriefing passes (None is valid content for empty sections).
   */
  it("sections with None as content pass validation", () => {
    fc.assert(
      fc.property(briefingWithNoneSectionsArb, (briefingText) => {
        const briefing = parseBriefing(briefingText);
        const validation = validateBriefing(briefing);

        // All "None" sections should be accepted as valid
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 8.1
   *
   * For any well-formed briefing text with all 4 sections:
   * parseBriefing always returns exactly 4 sections, each with non-empty content.
   */
  it("parseBriefing extracts non-empty content for all 4 sections in well-formed input", () => {
    fc.assert(
      fc.property(validBriefingTextArb, (briefingText) => {
        const briefing = parseBriefing(briefingText);

        expect(briefing.sections).toHaveLength(4);

        // Each section should have non-empty content since we generate content for all
        for (const section of briefing.sections) {
          expect(section.content.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });
});
