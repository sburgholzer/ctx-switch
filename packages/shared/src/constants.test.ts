import { describe, it, expect } from "vitest";
import {
  NOTE_MAX_CHARS,
  HISTORY_MAX_LINES,
  PR_MAX,
  COMMENTS_MAX,
  OVERFLOW_THRESHOLD_BYTES,
  SUMMARY_MAX_CHARS,
  BRIEFING_MAX_WORDS,
  AUTOCAPTURE_MAX_PROJECTS,
} from "./constants.js";

describe("constants", () => {
  it("NOTE_MAX_CHARS is 5000", () => {
    expect(NOTE_MAX_CHARS).toBe(5000);
  });

  it("HISTORY_MAX_LINES is 50", () => {
    expect(HISTORY_MAX_LINES).toBe(50);
  });

  it("PR_MAX is 20", () => {
    expect(PR_MAX).toBe(20);
  });

  it("COMMENTS_MAX is 50", () => {
    expect(COMMENTS_MAX).toBe(50);
  });

  it("OVERFLOW_THRESHOLD_BYTES is 400000", () => {
    expect(OVERFLOW_THRESHOLD_BYTES).toBe(400_000);
  });

  it("SUMMARY_MAX_CHARS is 80", () => {
    expect(SUMMARY_MAX_CHARS).toBe(80);
  });

  it("BRIEFING_MAX_WORDS is 500", () => {
    expect(BRIEFING_MAX_WORDS).toBe(500);
  });

  it("AUTOCAPTURE_MAX_PROJECTS is 20", () => {
    expect(AUTOCAPTURE_MAX_PROJECTS).toBe(20);
  });

  it("all constants are positive numbers", () => {
    const constants = [
      NOTE_MAX_CHARS,
      HISTORY_MAX_LINES,
      PR_MAX,
      COMMENTS_MAX,
      OVERFLOW_THRESHOLD_BYTES,
      SUMMARY_MAX_CHARS,
      BRIEFING_MAX_WORDS,
      AUTOCAPTURE_MAX_PROJECTS,
    ];
    constants.forEach((value) => {
      expect(value).toBeGreaterThan(0);
      expect(Number.isInteger(value)).toBe(true);
    });
  });
});
