import { describe, it, expect } from "vitest";
import { truncateSummary, formatTimestamp, formatProjectRow } from "./formatting.js";
import { SUMMARY_MAX_CHARS } from "./constants.js";

describe("formatting", () => {
  describe("truncateSummary", () => {
    it("returns the summary unchanged when within the limit", () => {
      const short = "A short summary";
      expect(truncateSummary(short)).toBe(short);
    });

    it("returns the summary unchanged when exactly at the limit", () => {
      const exact = "a".repeat(SUMMARY_MAX_CHARS);
      expect(truncateSummary(exact)).toBe(exact);
      expect(truncateSummary(exact).length).toBe(SUMMARY_MAX_CHARS);
    });

    it("truncates and appends ellipsis when exceeding the limit", () => {
      const long = "b".repeat(SUMMARY_MAX_CHARS + 20);
      const result = truncateSummary(long);
      expect(result.length).toBe(SUMMARY_MAX_CHARS);
      expect(result.endsWith("…")).toBe(true);
      expect(result).toBe("b".repeat(SUMMARY_MAX_CHARS - 1) + "…");
    });

    it("handles empty string", () => {
      expect(truncateSummary("")).toBe("");
    });

    it("handles single character over limit", () => {
      const oneOver = "c".repeat(SUMMARY_MAX_CHARS + 1);
      const result = truncateSummary(oneOver);
      expect(result.length).toBe(SUMMARY_MAX_CHARS);
      expect(result.endsWith("…")).toBe(true);
    });
  });

  describe("formatTimestamp", () => {
    it("formats a morning ISO timestamp correctly", () => {
      // Use a fixed UTC timestamp and check local formatting
      const date = new Date(2024, 0, 15, 10, 30, 0); // Jan 15, 2024, 10:30 AM local
      const iso = date.toISOString();
      const result = formatTimestamp(iso);
      expect(result).toBe("2024-01-15 10:30 AM");
    });

    it("formats an afternoon ISO timestamp correctly", () => {
      const date = new Date(2024, 5, 20, 14, 45, 0); // Jun 20, 2024, 2:45 PM local
      const iso = date.toISOString();
      const result = formatTimestamp(iso);
      expect(result).toBe("2024-06-20 02:45 PM");
    });

    it("formats midnight correctly as 12:00 AM", () => {
      const date = new Date(2024, 2, 1, 0, 0, 0); // Mar 1, 2024, 12:00 AM local
      const iso = date.toISOString();
      const result = formatTimestamp(iso);
      expect(result).toBe("2024-03-01 12:00 AM");
    });

    it("formats noon correctly as 12:00 PM", () => {
      const date = new Date(2024, 11, 25, 12, 0, 0); // Dec 25, 2024, 12:00 PM local
      const iso = date.toISOString();
      const result = formatTimestamp(iso);
      expect(result).toBe("2024-12-25 12:00 PM");
    });

    it("returns a string matching the expected format pattern", () => {
      const result = formatTimestamp("2024-01-15T10:30:00.000Z");
      // Format: YYYY-MM-DD HH:MM AM/PM
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} (AM|PM)$/);
    });
  });

  describe("formatProjectRow", () => {
    it("formats a project row with name, timestamp, and summary", () => {
      const date = new Date(2024, 0, 15, 10, 30, 0);
      const iso = date.toISOString();
      const result = formatProjectRow("my-project", iso, "Working on feature X");
      expect(result).toBe("my-project  2024-01-15 10:30 AM  Working on feature X");
    });

    it("truncates long summaries in the formatted row", () => {
      const date = new Date(2024, 0, 15, 10, 30, 0);
      const iso = date.toISOString();
      const longSummary = "x".repeat(100);
      const result = formatProjectRow("proj", iso, longSummary);
      expect(result).toContain("proj");
      expect(result).toContain("2024-01-15 10:30 AM");
      // The summary portion should be truncated to 80 chars
      const summaryPart = result.split("  ")[2];
      expect(summaryPart.length).toBe(SUMMARY_MAX_CHARS);
      expect(summaryPart.endsWith("…")).toBe(true);
    });

    it("handles empty summary", () => {
      const date = new Date(2024, 0, 15, 10, 30, 0);
      const iso = date.toISOString();
      const result = formatProjectRow("proj", iso, "");
      expect(result).toBe("proj  2024-01-15 10:30 AM  ");
    });
  });
});
