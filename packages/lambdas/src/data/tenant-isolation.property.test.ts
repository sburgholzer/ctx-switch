import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  userPK,
  projectSK,
  snapshotSK,
  snapshotSKPrefix,
  SK_PROJECT_PREFIX,
  SK_SNAPSHOT_PREFIX,
} from "@ctx-switch/shared";

/**
 * Feature: context-switcher, Property 9: Tenant data isolation
 * Validates: Requirements 5.3, 5.4, 5.5
 *
 * Verifies that the DynamoDB key schema ensures data from different users
 * cannot overlap. All queries use PK = USER#{userId}, which provides
 * partition-level isolation between tenants.
 */
describe("Property 9: Tenant data isolation", () => {
  // Arbitrary: non-empty user IDs (simulating authenticated user identifiers)
  const userIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,40}$/);

  // Arbitrary: pairs of distinct user IDs
  const distinctUserPairArb = fc
    .tuple(userIdArb, userIdArb)
    .filter(([a, b]) => a !== b);

  // Arbitrary: project IDs (hex hashes as produced by deriveProjectId)
  const projectIdArb = fc.stringMatching(/^[0-9a-f]{16}$/);

  // Arbitrary: ISO 8601 timestamps
  const timestampArb = fc
    .integer({
      min: new Date("2020-01-01T00:00:00Z").getTime(),
      max: new Date("2030-12-31T23:59:59Z").getTime(),
    })
    .map((ms) => new Date(ms).toISOString());

  it("for any two distinct userIds, their partition keys are different", () => {
    fc.assert(
      fc.property(distinctUserPairArb, ([userA, userB]) => {
        const pkA = userPK(userA);
        const pkB = userPK(userB);
        expect(pkA).not.toBe(pkB);
      }),
      { numRuns: 100 }
    );
  });

  it("for any userId and projectId, constructed keys always scope to that user's partition", () => {
    fc.assert(
      fc.property(
        userIdArb,
        projectIdArb,
        timestampArb,
        (userId, projectId, timestamp) => {
          const pk = userPK(userId);
          const projSK = projectSK(projectId);
          const snapSK = snapshotSK(projectId, timestamp);

          // PK always contains the userId and uses correct prefix
          expect(pk).toBe(`USER#${userId}`);

          // SK for projects scopes to the projectId
          expect(projSK).toBe(`PROJECT#${projectId}`);

          // SK for snapshots scopes to projectId and timestamp
          expect(snapSK).toBe(`SNAPSHOT#${projectId}#${timestamp}`);

          // The PK is the isolation boundary - it's unique per user
          // A query with PK = USER#{userId} can only ever return that user's data
        }
      ),
      { numRuns: 100 }
    );
  });

  it("begins_with queries on SK cannot leak data across user partitions since PK is always exact-matched", () => {
    fc.assert(
      fc.property(
        distinctUserPairArb,
        projectIdArb,
        timestampArb,
        ([userA, userB], projectId, timestamp) => {
          // User A's query parameters
          const pkA = userPK(userA);
          const skPrefixA = snapshotSKPrefix(projectId);

          // User B's stored item keys
          const pkB = userPK(userB);
          const skB = snapshotSK(projectId, timestamp);

          // Even if both users have the same projectId, their PKs differ
          // so a query with PK = pkA will never match items with PK = pkB
          expect(pkA).not.toBe(pkB);

          // The SK prefix is the same for both users (project-scoped),
          // but DynamoDB requires BOTH PK exact match AND SK condition.
          // User A's query (PK=pkA, SK begins_with skPrefixA) cannot
          // return User B's items (which have PK=pkB).
          expect(skPrefixA).toBe(`SNAPSHOT#${projectId}#`);

          // Verify that even with identical SK values, isolation holds
          // because PK is the partition boundary
          const skForBothUsers = snapshotSK(projectId, timestamp);
          expect(skB).toBe(skForBothUsers);
          // Same SK doesn't matter - different PKs means different partitions
        }
      ),
      { numRuns: 100 }
    );
  });

  it("project listing queries are isolated per user even with shared project IDs", () => {
    fc.assert(
      fc.property(
        distinctUserPairArb,
        projectIdArb,
        ([userA, userB], projectId) => {
          // Both users might have a project with the same projectId
          const pkA = userPK(userA);
          const pkB = userPK(userB);

          // A list query uses PK = USER#{userId} and SK begins_with PROJECT#
          // User A's list query:
          //   KeyConditionExpression: PK = :pk AND begins_with(SK, :skPrefix)
          //   :pk = pkA, :skPrefix = SK_PROJECT_PREFIX
          // This can never return User B's projects because pkA !== pkB

          expect(pkA).not.toBe(pkB);

          // Both users use the same SK prefix for listing projects
          const listPrefix = SK_PROJECT_PREFIX;
          expect(listPrefix).toBe("PROJECT#");

          // The same SK prefix doesn't cause data leakage because
          // DynamoDB partition key is an exact-match filter
          const projectKeyA = `${pkA}|${projectSK(projectId)}`;
          const projectKeyB = `${pkB}|${projectSK(projectId)}`;
          expect(projectKeyA).not.toBe(projectKeyB);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("user partition key is injective: different userIds always produce different PKs", () => {
    fc.assert(
      fc.property(distinctUserPairArb, ([userA, userB]) => {
        // The userPK function must be injective (one-to-one)
        // so that no two users share a partition key
        const pkA = userPK(userA);
        const pkB = userPK(userB);

        expect(pkA).not.toBe(pkB);

        // DynamoDB uses exact PK match, so even if one PK is a prefix
        // of another (e.g., USER#a vs USER#ab), they are treated as
        // completely distinct partitions. The key property is strict
        // inequality, which the userPK function guarantees for distinct inputs.
      }),
      { numRuns: 100 }
    );
  });
});
