import { describe, it, expect } from "vitest";
import { calculatePayloadSize, needsOverflow } from "./overflow.js";
import type { Snapshot } from "./models.js";
import { OVERFLOW_THRESHOLD_BYTES } from "./constants.js";

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    projectId: "abc123",
    projectName: "test-project",
    timestamp: "2024-01-15T10:30:00.000Z",
    source: "manual",
    git: {
      branch: "main",
      lastCommits: ["initial commit"],
      uncommittedDiff: "",
      modifiedFiles: [],
    },
    ...overrides,
  };
}

describe("calculatePayloadSize", () => {
  it("returns the byte size of the serialized snapshot", () => {
    const snapshot = makeSnapshot();
    const json = JSON.stringify(snapshot);
    const expectedSize = new TextEncoder().encode(json).byteLength;
    expect(calculatePayloadSize(snapshot)).toBe(expectedSize);
  });

  it("returns a larger size for a snapshot with more data", () => {
    const small = makeSnapshot();
    const large = makeSnapshot({
      git: {
        branch: "feature/long-branch-name",
        lastCommits: ["commit 1", "commit 2", "commit 3", "commit 4", "commit 5"],
        uncommittedDiff: "a".repeat(10000),
        modifiedFiles: Array.from({ length: 50 }, (_, i) => `src/file${i}.ts`),
      },
    });
    expect(calculatePayloadSize(large)).toBeGreaterThan(calculatePayloadSize(small));
  });

  it("correctly measures multi-byte characters", () => {
    const snapshot = makeSnapshot({ note: "こんにちは" }); // 5 chars but 15 bytes in UTF-8
    const json = JSON.stringify(snapshot);
    const expectedSize = new TextEncoder().encode(json).byteLength;
    expect(calculatePayloadSize(snapshot)).toBe(expectedSize);
  });
});

describe("needsOverflow", () => {
  it("returns false for a small snapshot", () => {
    const snapshot = makeSnapshot();
    expect(needsOverflow(snapshot)).toBe(false);
  });

  it("returns true for a snapshot exceeding 400KB", () => {
    const snapshot = makeSnapshot({
      git: {
        branch: "main",
        lastCommits: [],
        uncommittedDiff: "x".repeat(OVERFLOW_THRESHOLD_BYTES + 1),
        modifiedFiles: [],
      },
    });
    expect(needsOverflow(snapshot)).toBe(true);
  });

  it("returns false for a snapshot at exactly 400KB", () => {
    // Build a snapshot and measure, then adjust to hit exactly the threshold
    const baseSnapshot = makeSnapshot({
      git: {
        branch: "main",
        lastCommits: [],
        uncommittedDiff: "",
        modifiedFiles: [],
      },
    });
    const baseSize = calculatePayloadSize(baseSnapshot);
    // Fill uncommittedDiff to reach exactly the threshold
    const fillNeeded = OVERFLOW_THRESHOLD_BYTES - baseSize;
    // Account for the extra JSON string overhead (existing "" vs the filled string)
    const snapshot = makeSnapshot({
      git: {
        branch: "main",
        lastCommits: [],
        uncommittedDiff: "a".repeat(fillNeeded),
        modifiedFiles: [],
      },
    });
    // The exact size may be slightly over due to JSON encoding, just verify the logic
    const size = calculatePayloadSize(snapshot);
    if (size === OVERFLOW_THRESHOLD_BYTES) {
      expect(needsOverflow(snapshot)).toBe(false);
    } else {
      // Size is slightly different due to JSON structure; just verify the threshold comparison
      expect(needsOverflow(snapshot)).toBe(size > OVERFLOW_THRESHOLD_BYTES);
    }
  });
});
