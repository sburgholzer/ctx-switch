/**
 * DynamoDB key schema utilities for the Context Switcher single-table design.
 *
 * Table: ctx-switch-context-store
 * PK/SK patterns:
 *   PK = USER#{userId}         SK = PROJECT#{projectId}
 *   PK = USER#{userId}         SK = SNAPSHOT#{projectId}#{timestamp}
 *
 * GSI-1 (Auto-capture lookup):
 *   PK = AUTOCAP#{userId}      SK = PROJECT#{projectId}
 */

// --- Prefixes ---
export const PK_USER_PREFIX = 'USER#';
export const SK_PROJECT_PREFIX = 'PROJECT#';
export const SK_SNAPSHOT_PREFIX = 'SNAPSHOT#';
export const GSI1_AUTOCAP_PREFIX = 'AUTOCAP#';

// --- Primary Key Constructors ---

/**
 * Constructs the partition key for a user's records.
 * Format: USER#{userId}
 */
export function userPK(userId: string): string {
  return `${PK_USER_PREFIX}${userId}`;
}

/**
 * Constructs the sort key for a project record.
 * Format: PROJECT#{projectId}
 */
export function projectSK(projectId: string): string {
  return `${SK_PROJECT_PREFIX}${projectId}`;
}

/**
 * Constructs the sort key for a snapshot record.
 * Format: SNAPSHOT#{projectId}#{timestamp}
 */
export function snapshotSK(projectId: string, timestamp: string): string {
  return `${SK_SNAPSHOT_PREFIX}${projectId}#${timestamp}`;
}

/**
 * Constructs the sort key prefix for querying all snapshots of a project.
 * Used with begins_with for access patterns like get latest, get history, delete all.
 * Format: SNAPSHOT#{projectId}#
 */
export function snapshotSKPrefix(projectId: string): string {
  return `${SK_SNAPSHOT_PREFIX}${projectId}#`;
}

// --- GSI-1 Key Constructors (Auto-capture lookup) ---

/**
 * Constructs the GSI-1 partition key for auto-capture lookup.
 * Format: AUTOCAP#{userId}
 */
export function autoCapturePK(userId: string): string {
  return `${GSI1_AUTOCAP_PREFIX}${userId}`;
}

/**
 * Constructs the GSI-1 sort key for auto-capture lookup.
 * Reuses the same PROJECT#{projectId} format as the main table SK.
 * Format: PROJECT#{projectId}
 */
export function autoCaptureSK(projectId: string): string {
  return `${SK_PROJECT_PREFIX}${projectId}`;
}

// --- Key Parsing Utilities ---

/**
 * Extracts the userId from a USER#{userId} partition key.
 */
export function parseUserIdFromPK(pk: string): string {
  if (!pk.startsWith(PK_USER_PREFIX)) {
    throw new Error(`Invalid PK format: expected "${PK_USER_PREFIX}" prefix, got "${pk}"`);
  }
  return pk.slice(PK_USER_PREFIX.length);
}

/**
 * Extracts the projectId from a PROJECT#{projectId} sort key.
 */
export function parseProjectIdFromSK(sk: string): string {
  if (!sk.startsWith(SK_PROJECT_PREFIX)) {
    throw new Error(`Invalid SK format: expected "${SK_PROJECT_PREFIX}" prefix, got "${sk}"`);
  }
  return sk.slice(SK_PROJECT_PREFIX.length);
}

/**
 * Extracts the projectId and timestamp from a SNAPSHOT#{projectId}#{timestamp} sort key.
 */
export function parseSnapshotSK(sk: string): { projectId: string; timestamp: string } {
  if (!sk.startsWith(SK_SNAPSHOT_PREFIX)) {
    throw new Error(`Invalid SK format: expected "${SK_SNAPSHOT_PREFIX}" prefix, got "${sk}"`);
  }
  const remainder = sk.slice(SK_SNAPSHOT_PREFIX.length);
  // The projectId is a hex hash (no # characters), timestamp follows the next #
  const separatorIndex = remainder.indexOf('#');
  if (separatorIndex === -1) {
    throw new Error(`Invalid snapshot SK format: missing timestamp separator in "${sk}"`);
  }
  return {
    projectId: remainder.slice(0, separatorIndex),
    timestamp: remainder.slice(separatorIndex + 1),
  };
}

/**
 * Extracts the userId from an AUTOCAP#{userId} GSI-1 partition key.
 */
export function parseUserIdFromAutoCapturePK(pk: string): string {
  if (!pk.startsWith(GSI1_AUTOCAP_PREFIX)) {
    throw new Error(`Invalid GSI-1 PK format: expected "${GSI1_AUTOCAP_PREFIX}" prefix, got "${pk}"`);
  }
  return pk.slice(GSI1_AUTOCAP_PREFIX.length);
}
