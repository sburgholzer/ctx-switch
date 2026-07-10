/**
 * Payload size calculation and S3 overflow routing utilities.
 *
 * Determines whether a snapshot payload exceeds DynamoDB's 400KB item limit
 * and should be stored in S3 instead (Requirement 1.7).
 */

import { OVERFLOW_THRESHOLD_BYTES } from "./constants.js";
import type { Snapshot } from "./models.js";

/**
 * Calculates the serialized byte size of a snapshot payload.
 * Uses JSON.stringify and counts UTF-8 bytes via TextEncoder.
 *
 * @param snapshot - The snapshot to measure.
 * @returns The byte size of the JSON-serialized snapshot.
 */
export function calculatePayloadSize(snapshot: Snapshot): number {
  const json = JSON.stringify(snapshot);
  return new TextEncoder().encode(json).byteLength;
}

/**
 * Determines whether a snapshot payload needs to be stored in S3
 * because it exceeds the overflow threshold (400KB).
 *
 * @param snapshot - The snapshot to check.
 * @returns True if the payload size exceeds OVERFLOW_THRESHOLD_BYTES.
 */
export function needsOverflow(snapshot: Snapshot): boolean {
  return calculatePayloadSize(snapshot) > OVERFLOW_THRESHOLD_BYTES;
}
