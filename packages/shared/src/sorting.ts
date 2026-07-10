/**
 * Sorting utilities for Context Switcher.
 *
 * Provides functions to sort projects and snapshots by timestamp
 * descending (newest first). Uses ISO 8601 string comparison which
 * is lexicographically correct for sorting.
 */

import type { ProjectRecord, Snapshot } from "./models.js";

/**
 * Returns a new array of projects sorted by lastParkTimestamp descending (newest first).
 * Does not mutate the input array.
 */
export function sortProjectsByTimestamp(projects: ProjectRecord[]): ProjectRecord[] {
  return [...projects].sort(
    (a, b) => b.lastParkTimestamp.localeCompare(a.lastParkTimestamp)
  );
}

/**
 * Returns a new array of snapshots sorted by timestamp descending (newest first).
 * Does not mutate the input array.
 */
export function sortSnapshotsByTimestamp(snapshots: Snapshot[]): Snapshot[] {
  return [...snapshots].sort(
    (a, b) => b.timestamp.localeCompare(a.timestamp)
  );
}
