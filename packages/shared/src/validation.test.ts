import { describe, it, expect } from "vitest";
import {
  validateNote,
  truncateHistory,
  truncatePRs,
  truncateComments,
} from "./validation.js";
import { ValidationError } from "./errors.js";
import type { PullRequest, ReviewComment } from "./models.js";

describe("validateNote", () => {
  it("accepts a note within the limit", () => {
    expect(() => validateNote("short note")).not.toThrow();
  });

  it("accepts a note at exactly 5000 characters", () => {
    const note = "a".repeat(5000);
    expect(() => validateNote(note)).not.toThrow();
  });

  it("throws ValidationError for a note exceeding 5000 characters", () => {
    const note = "a".repeat(5001);
    expect(() => validateNote(note)).toThrow(ValidationError);
  });

  it("accepts an empty note", () => {
    expect(() => validateNote("")).not.toThrow();
  });
});

describe("truncateHistory", () => {
  it("returns all lines when under the limit", () => {
    const lines = ["line1", "line2", "line3"];
    expect(truncateHistory(lines)).toEqual(lines);
  });

  it("returns exactly 50 lines when at the limit", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
    expect(truncateHistory(lines)).toHaveLength(50);
  });

  it("returns the last 50 lines when over the limit", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const result = truncateHistory(lines);
    expect(result).toHaveLength(50);
    expect(result[0]).toBe("line 50");
    expect(result[49]).toBe("line 99");
  });

  it("returns an empty array for empty input", () => {
    expect(truncateHistory([])).toEqual([]);
  });
});

describe("truncatePRs", () => {
  const makePR = (n: number): PullRequest => ({
    number: n,
    title: `PR #${n}`,
    url: `https://github.com/org/repo/pull/${n}`,
    state: "open",
  });

  it("returns all PRs when under the limit", () => {
    const prs = Array.from({ length: 5 }, (_, i) => makePR(i));
    expect(truncatePRs(prs)).toHaveLength(5);
  });

  it("returns exactly 20 PRs when at the limit", () => {
    const prs = Array.from({ length: 20 }, (_, i) => makePR(i));
    expect(truncatePRs(prs)).toHaveLength(20);
  });

  it("truncates to first 20 PRs when over the limit", () => {
    const prs = Array.from({ length: 30 }, (_, i) => makePR(i));
    const result = truncatePRs(prs);
    expect(result).toHaveLength(20);
    expect(result[0].number).toBe(0);
    expect(result[19].number).toBe(19);
  });
});

describe("truncateComments", () => {
  const makeComment = (n: number): ReviewComment => ({
    prNumber: 1,
    body: `Comment ${n}`,
    path: `src/file${n}.ts`,
    line: n,
    status: "open",
  });

  it("returns all comments when under the limit", () => {
    const comments = Array.from({ length: 10 }, (_, i) => makeComment(i));
    expect(truncateComments(comments)).toHaveLength(10);
  });

  it("returns exactly 50 comments when at the limit", () => {
    const comments = Array.from({ length: 50 }, (_, i) => makeComment(i));
    expect(truncateComments(comments)).toHaveLength(50);
  });

  it("truncates to first 50 comments when over the limit", () => {
    const comments = Array.from({ length: 75 }, (_, i) => makeComment(i));
    const result = truncateComments(comments);
    expect(result).toHaveLength(50);
    expect(result[0].body).toBe("Comment 0");
    expect(result[49].body).toBe("Comment 49");
  });
});
