/**
 * Property-based tests for sorting utilities.
 *
 * Feature: context-switcher, Property 6: Listings are ordered newest-first
 * Validates: Requirements 2.5, 3.3
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sortProjectsByTimestamp, sortSnapshotsByTimestamp } from "./sorting.js";
import type { ProjectRecord, Snapshot } from "./models.js";

/**
 * Arbitrary that generates a random ISO 8601 timestamp.
 * Uses integer milliseconds within a safe range to avoid invalid date issues.
 */
const isoTimestampArb = fc.integer({
  min: new Date("2000-01-01T00:00:00.000Z").getTime(),
  max: new Date("2050-12-31T23:59:59.999Z").getTime(),
}).map((ms) => new Date(ms).toISOString());

/**
 * Generates an array of distinct ISO timestamps.
 */
const distinctTimestampsArb = (minLength: number, maxLength: number) =>
  fc.uniqueArray(isoTimestampArb, { minLength, maxLength });

/**
 * Generates a ProjectRecord with a given timestamp.
 */
const projectRecordWithTimestamp = (timestamp: string, index: number): ProjectRecord => ({
  userId: `user-${index}`,
  projectId: `project-${index}`,
  projectName: `project-name-${index}`,
  lastParkTimestamp: timestamp,
  summary: `summary for project ${index}`,
  snapshotCount: index + 1,
});

/**
 * Generates a Snapshot with a given timestamp.
 */
const snapshotWithTimestamp = (timestamp: string, index: number): Snapshot => ({
  projectId: `project-${index}`,
  projectName: `project-name-${index}`,
  timestamp,
  source: index % 2 === 0 ? "manual" : "auto",
  git: {
    branch: `branch-${index}`,
    lastCommits: [`commit-${index}`],
    uncommittedDiff: "",
    modifiedFiles: [`file-${index}.ts`],
  },
});

describe("Feature: context-switcher, Property 6: Listings are ordered newest-first", () => {
  describe("sortProjectsByTimestamp", () => {
    it("returns projects ordered newest-first (each timestamp ≥ the next)", () => {
      fc.assert(
        fc.property(
          distinctTimestampsArb(1, 50),
          (timestamps) => {
            const projects = timestamps.map((ts, i) => projectRecordWithTimestamp(ts, i));
            const sorted = sortProjectsByTimestamp(projects);

            for (let i = 0; i < sorted.length - 1; i++) {
              expect(sorted[i].lastParkTimestamp >= sorted[i + 1].lastParkTimestamp).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("produces output with the same length as the input", () => {
      fc.assert(
        fc.property(
          distinctTimestampsArb(0, 50),
          (timestamps) => {
            const projects = timestamps.map((ts, i) => projectRecordWithTimestamp(ts, i));
            const sorted = sortProjectsByTimestamp(projects);
            expect(sorted.length).toBe(projects.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("contains all the same elements as the input (just reordered)", () => {
      fc.assert(
        fc.property(
          distinctTimestampsArb(0, 50),
          (timestamps) => {
            const projects = timestamps.map((ts, i) => projectRecordWithTimestamp(ts, i));
            const sorted = sortProjectsByTimestamp(projects);

            const inputIds = new Set(projects.map((p) => p.projectId));
            const outputIds = new Set(sorted.map((p) => p.projectId));
            expect(outputIds).toEqual(inputIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("does not mutate the input array", () => {
      fc.assert(
        fc.property(
          distinctTimestampsArb(1, 50),
          (timestamps) => {
            const projects = timestamps.map((ts, i) => projectRecordWithTimestamp(ts, i));
            const originalOrder = projects.map((p) => p.projectId);

            sortProjectsByTimestamp(projects);

            expect(projects.map((p) => p.projectId)).toEqual(originalOrder);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("sortSnapshotsByTimestamp", () => {
    it("returns snapshots ordered newest-first (each timestamp ≥ the next)", () => {
      fc.assert(
        fc.property(
          distinctTimestampsArb(1, 50),
          (timestamps) => {
            const snapshots = timestamps.map((ts, i) => snapshotWithTimestamp(ts, i));
            const sorted = sortSnapshotsByTimestamp(snapshots);

            for (let i = 0; i < sorted.length - 1; i++) {
              expect(sorted[i].timestamp >= sorted[i + 1].timestamp).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("produces output with the same length as the input", () => {
      fc.assert(
        fc.property(
          distinctTimestampsArb(0, 50),
          (timestamps) => {
            const snapshots = timestamps.map((ts, i) => snapshotWithTimestamp(ts, i));
            const sorted = sortSnapshotsByTimestamp(snapshots);
            expect(sorted.length).toBe(snapshots.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("contains all the same elements as the input (just reordered)", () => {
      fc.assert(
        fc.property(
          distinctTimestampsArb(0, 50),
          (timestamps) => {
            const snapshots = timestamps.map((ts, i) => snapshotWithTimestamp(ts, i));
            const sorted = sortSnapshotsByTimestamp(snapshots);

            const inputIds = new Set(snapshots.map((s) => s.projectId));
            const outputIds = new Set(sorted.map((s) => s.projectId));
            expect(outputIds).toEqual(inputIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("does not mutate the input array", () => {
      fc.assert(
        fc.property(
          distinctTimestampsArb(1, 50),
          (timestamps) => {
            const snapshots = timestamps.map((ts, i) => snapshotWithTimestamp(ts, i));
            const originalOrder = snapshots.map((s) => s.timestamp);

            sortSnapshotsByTimestamp(snapshots);

            expect(snapshots.map((s) => s.timestamp)).toEqual(originalOrder);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
