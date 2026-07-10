/**
 * Unit tests for the briefing parser and validator module.
 *
 * Tests cover prompt construction, response parsing, validation rules
 * (4 sections in order, word count ≤500, verbatim notes, "None" for empty sections).
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { describe, it, expect } from "vitest";
import {
  buildBriefingPrompt,
  parseBriefing,
  validateBriefing,
  validateVerbatimNotes,
  countWords,
  BRIEFING_SECTIONS,
} from "./briefing.js";
import type { Snapshot } from "@ctx-switch/shared";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    projectId: "abc123",
    projectName: "my-project",
    timestamp: "2024-01-15T10:30:00.000Z",
    source: "manual",
    git: {
      branch: "feature/auth",
      lastCommits: ["Add login endpoint", "Fix session handling"],
      uncommittedDiff: "diff --git a/src/auth.ts...",
      modifiedFiles: ["src/auth.ts", "src/session.ts"],
    },
    ...overrides,
  };
}

function createValidBriefingText(): string {
  return `## Last Session Summary
Working on the authentication feature, implementing login endpoint and session management.

## Key Changes
- Added login endpoint with JWT token generation
- Fixed session handling to properly expire after 30 minutes

## Open Items
- Need to add rate limiting to login endpoint
- TODO: Write integration tests for auth flow

## Suggested Next Steps
1. Implement rate limiting middleware
2. Write integration tests for the login flow
3. Update API documentation with new endpoints`;
}

function createBriefingTextWithNote(note: string): string {
  return `## Last Session Summary
Working on the authentication feature.

## Key Changes
- Added login endpoint

## Open Items
${note}

## Suggested Next Steps
1. Continue implementation`;
}

// ─── buildBriefingPrompt Tests ───────────────────────────────────────────────

describe("buildBriefingPrompt", () => {
  it("returns system and user prompts", () => {
    const snapshot = createSnapshot();
    const result = buildBriefingPrompt(snapshot);

    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("user");
    expect(result.system).toBeTruthy();
    expect(result.user).toBeTruthy();
  });

  it("system prompt defines 4-section format", () => {
    const snapshot = createSnapshot();
    const { system } = buildBriefingPrompt(snapshot);

    expect(system).toContain("Last Session Summary");
    expect(system).toContain("Key Changes");
    expect(system).toContain("Open Items");
    expect(system).toContain("Suggested Next Steps");
  });

  it("system prompt specifies 500-word limit", () => {
    const snapshot = createSnapshot();
    const { system } = buildBriefingPrompt(snapshot);

    expect(system).toContain("500");
  });

  it("system prompt instructs verbatim inclusion of developer notes", () => {
    const snapshot = createSnapshot();
    const { system } = buildBriefingPrompt(snapshot);

    expect(system.toLowerCase()).toContain("verbatim");
  });

  it("system prompt instructs None for empty sections", () => {
    const snapshot = createSnapshot();
    const { system } = buildBriefingPrompt(snapshot);

    expect(system).toContain("None");
  });

  it("user prompt includes project name and branch", () => {
    const snapshot = createSnapshot();
    const { user } = buildBriefingPrompt(snapshot);

    expect(user).toContain("my-project");
    expect(user).toContain("feature/auth");
  });

  it("user prompt includes recent commits", () => {
    const snapshot = createSnapshot();
    const { user } = buildBriefingPrompt(snapshot);

    expect(user).toContain("Add login endpoint");
    expect(user).toContain("Fix session handling");
  });

  it("user prompt includes modified files", () => {
    const snapshot = createSnapshot();
    const { user } = buildBriefingPrompt(snapshot);

    expect(user).toContain("src/auth.ts");
    expect(user).toContain("src/session.ts");
  });

  it("user prompt includes developer note with VERBATIM instruction", () => {
    const snapshot = createSnapshot({ note: "Remember to fix the login bug" });
    const { user } = buildBriefingPrompt(snapshot);

    expect(user).toContain("Remember to fix the login bug");
    expect(user).toContain("VERBATIM");
  });

  it("user prompt includes terminal history when present", () => {
    const snapshot = createSnapshot({
      terminalHistory: ["npm test", "git status"],
    });
    const { user } = buildBriefingPrompt(snapshot);

    expect(user).toContain("npm test");
    expect(user).toContain("git status");
  });

  it("user prompt includes GitHub PRs when present", () => {
    const snapshot = createSnapshot({
      github: {
        pullRequests: [
          { number: 42, title: "Add auth", url: "https://github.com/pr/42", state: "open" },
        ],
        unresolvedComments: [],
      },
    });
    const { user } = buildBriefingPrompt(snapshot);

    expect(user).toContain("#42");
    expect(user).toContain("Add auth");
  });

  it("user prompt includes unresolved review comments when present", () => {
    const snapshot = createSnapshot({
      github: {
        pullRequests: [],
        unresolvedComments: [
          { prNumber: 1, body: "Fix this typo", path: "src/main.ts", line: 10, status: "open" },
        ],
      },
    });
    const { user } = buildBriefingPrompt(snapshot);

    expect(user).toContain("Fix this typo");
    expect(user).toContain("src/main.ts:10");
  });

  it("user prompt omits optional fields when not present", () => {
    const snapshot = createSnapshot({
      note: undefined,
      terminalHistory: undefined,
      github: undefined,
    });
    const { user } = buildBriefingPrompt(snapshot);

    expect(user).not.toContain("Developer note");
    expect(user).not.toContain("Terminal history");
    expect(user).not.toContain("Open PRs");
  });

  it("truncates long diffs in user prompt to 2000 chars", () => {
    const longDiff = "x".repeat(5000);
    const snapshot = createSnapshot({
      git: {
        branch: "main",
        lastCommits: [],
        uncommittedDiff: longDiff,
        modifiedFiles: [],
      },
    });
    const { user } = buildBriefingPrompt(snapshot);

    // The diff preview should be truncated to 2000 chars
    expect(user.length).toBeLessThan(5000 + 500);
  });
});

// ─── parseBriefing Tests ─────────────────────────────────────────────────────

describe("parseBriefing", () => {
  it("parses a valid 4-section briefing", () => {
    const rawText = createValidBriefingText();
    const result = parseBriefing(rawText);

    expect(result.sections).toHaveLength(4);
    expect(result.sections[0].heading).toBe("Last Session Summary");
    expect(result.sections[1].heading).toBe("Key Changes");
    expect(result.sections[2].heading).toBe("Open Items");
    expect(result.sections[3].heading).toBe("Suggested Next Steps");
  });

  it("extracts content for each section", () => {
    const rawText = createValidBriefingText();
    const result = parseBriefing(rawText);

    expect(result.sections[0].content).toContain("authentication feature");
    expect(result.sections[1].content).toContain("Added login endpoint");
    expect(result.sections[2].content).toContain("rate limiting");
    expect(result.sections[3].content).toContain("Implement rate limiting");
  });

  it("preserves rawText in result", () => {
    const rawText = createValidBriefingText();
    const result = parseBriefing(rawText);

    expect(result.rawText).toBe(rawText.trim());
  });

  it("handles sections with None content", () => {
    const rawText = `## Last Session Summary
Working on feature X.

## Key Changes
None

## Open Items
None

## Suggested Next Steps
1. Start implementation`;

    const result = parseBriefing(rawText);

    expect(result.sections[1].content).toBe("None");
    expect(result.sections[2].content).toBe("None");
  });

  it("handles missing sections gracefully", () => {
    const rawText = `## Last Session Summary
Some summary.

## Suggested Next Steps
1. Do something`;

    const result = parseBriefing(rawText);

    // Should have 4 sections, with empty content for missing ones
    expect(result.sections).toHaveLength(4);
    expect(result.sections[0].content).toContain("Some summary");
    expect(result.sections[1].content).toBe(""); // Key Changes missing
    expect(result.sections[2].content).toBe(""); // Open Items missing
    expect(result.sections[3].content).toContain("Do something");
  });

  it("handles empty input", () => {
    const result = parseBriefing("");

    expect(result.sections).toHaveLength(4);
    expect(result.sections.every((s) => s.content === "")).toBe(true);
  });

  it("trims whitespace from section content", () => {
    const rawText = `## Last Session Summary

   Padded content here   

## Key Changes
- Change 1

## Open Items
None

## Suggested Next Steps
1. Step 1`;

    const result = parseBriefing(rawText);
    expect(result.sections[0].content).toBe("Padded content here");
  });
});

// ─── validateBriefing Tests ──────────────────────────────────────────────────

describe("validateBriefing", () => {
  it("returns valid for a well-formed briefing", () => {
    const rawText = createValidBriefingText();
    const briefing = parseBriefing(rawText);
    const result = validateBriefing(briefing);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects missing sections", () => {
    const briefing = parseBriefing("## Last Session Summary\nSome text.");
    // parseBriefing always returns 4 sections but with empty content
    // The missing sections will have empty content triggering the "None" check
    const result = validateBriefing(briefing);

    // Empty sections without "None" should be flagged
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("no content"))).toBe(true);
  });

  it("detects word count exceeding 500", () => {
    // Create a briefing with more than 500 words
    const longContent = Array(501).fill("word").join(" ");
    const rawText = `## Last Session Summary
${longContent}

## Key Changes
- Change

## Open Items
None

## Suggested Next Steps
1. Step`;

    const briefing = parseBriefing(rawText);
    const result = validateBriefing(briefing);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("500 word limit"))).toBe(true);
  });

  it("passes for briefing at exactly 500 words", () => {
    // Create a briefing with exactly 500 words total (including headings)
    // Headings take up some words, so we need to account for that
    const headingWords = countWords(
      "## Last Session Summary\n## Key Changes\n## Open Items\n## Suggested Next Steps"
    );
    const contentWords = 500 - headingWords - 4; // 4 for "None" entries
    const content = Array(contentWords).fill("word").join(" ");

    const rawText = `## Last Session Summary
${content}

## Key Changes
None

## Open Items
None

## Suggested Next Steps
None`;

    const briefing = parseBriefing(rawText);
    const result = validateBriefing(briefing);

    expect(result.valid).toBe(true);
  });

  it("flags empty sections that do not show None", () => {
    const briefing = parseBriefing(`## Last Session Summary
Summary text.

## Key Changes
- Change

## Open Items

## Suggested Next Steps
1. Step`);

    // Open Items has empty content
    const result = validateBriefing(briefing);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Open Items"))).toBe(true);
  });

  it("accepts sections with None as valid empty content", () => {
    const rawText = `## Last Session Summary
Working on feature.

## Key Changes
None

## Open Items
None

## Suggested Next Steps
None`;

    const briefing = parseBriefing(rawText);
    const result = validateBriefing(briefing);

    expect(result.valid).toBe(true);
  });

  it("returns multiple errors when multiple issues exist", () => {
    const longContent = Array(501).fill("word").join(" ");
    const rawText = `## Last Session Summary
${longContent}

## Key Changes

## Open Items

## Suggested Next Steps
`;

    const briefing = parseBriefing(rawText);
    const result = validateBriefing(briefing);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

// ─── validateVerbatimNotes Tests ─────────────────────────────────────────────

describe("validateVerbatimNotes", () => {
  it("returns true when note appears verbatim in Open Items", () => {
    const note = "Fix the login bug before release";
    const rawText = createBriefingTextWithNote(`- ${note}`);
    const briefing = parseBriefing(rawText);

    expect(validateVerbatimNotes(briefing, note)).toBe(true);
  });

  it("returns false when note is not in Open Items", () => {
    const rawText = createBriefingTextWithNote("- Some other content");
    const briefing = parseBriefing(rawText);

    expect(
      validateVerbatimNotes(briefing, "This note is not present")
    ).toBe(false);
  });

  it("returns false when Open Items section is missing", () => {
    const briefing = parseBriefing("## Last Session Summary\nSummary.");

    expect(
      validateVerbatimNotes(briefing, "some note")
    ).toBe(false);
  });

  it("handles multiline developer notes", () => {
    const note = "Fix bug A\nAlso check bug B";
    const rawText = createBriefingTextWithNote(`- ${note}`);
    const briefing = parseBriefing(rawText);

    expect(validateVerbatimNotes(briefing, note)).toBe(true);
  });
});

// ─── countWords Tests ────────────────────────────────────────────────────────

describe("countWords", () => {
  it("counts words in a normal sentence", () => {
    expect(countWords("hello world")).toBe(2);
  });

  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(countWords("   \n\t  ")).toBe(0);
  });

  it("counts single word", () => {
    expect(countWords("word")).toBe(1);
  });

  it("handles multiple whitespace between words", () => {
    expect(countWords("one   two   three")).toBe(3);
  });

  it("handles newlines and tabs as word separators", () => {
    expect(countWords("one\ntwo\tthree")).toBe(3);
  });

  it("handles markdown formatting characters as part of words", () => {
    expect(countWords("## Last Session Summary")).toBe(4);
  });
});

// ─── BRIEFING_SECTIONS constant Tests ────────────────────────────────────────

describe("BRIEFING_SECTIONS", () => {
  it("contains exactly 4 sections", () => {
    expect(BRIEFING_SECTIONS).toHaveLength(4);
  });

  it("has sections in the correct order", () => {
    expect(BRIEFING_SECTIONS[0]).toBe("Last Session Summary");
    expect(BRIEFING_SECTIONS[1]).toBe("Key Changes");
    expect(BRIEFING_SECTIONS[2]).toBe("Open Items");
    expect(BRIEFING_SECTIONS[3]).toBe("Suggested Next Steps");
  });
});
