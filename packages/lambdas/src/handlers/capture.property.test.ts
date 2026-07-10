import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import type { Snapshot } from "@ctx-switch/shared";

// Mock the data layer modules
vi.mock("../data/snapshot-repo.js", () => ({
  putSnapshot: vi.fn().mockResolvedValue(undefined),
  putProjectRecord: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../data/archive-repo.js", () => ({
  putPayload: vi.fn().mockResolvedValue("mock-s3-key"),
}));

import { handler } from "./capture.js";
import { putSnapshot, putProjectRecord } from "../data/snapshot-repo.js";
import { putPayload } from "../data/archive-repo.js";

/**
 * Feature: context-switcher, Property 1: Snapshot captures complete git state
 * Validates: Requirements 1.1, 1.2
 *
 * For any git repository with a branch name, commit history, uncommitted changes,
 * and modified files, the capture function SHALL produce a snapshot containing
 * the exact branch name, the last 5 (or fewer if less exist) commit messages,
 * the full uncommitted diff, and the complete list of modified files.
 */
describe("Property 1: Snapshot captures complete git state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Arbitrary: non-empty branch name (realistic git branch format)
  const branchArb = fc.stringMatching(/^[a-z0-9\-_/]{1,60}$/);

  // Arbitrary: commit messages (1 to 5, non-empty strings)
  const commitsArb = fc.array(
    fc.string({ minLength: 1, maxLength: 200 }),
    { minLength: 0, maxLength: 5 }
  );

  // Arbitrary: uncommitted diff (keep small to stay under overflow threshold)
  const diffArb = fc.string({ minLength: 0, maxLength: 500 });

  // Arbitrary: modified files list
  const modifiedFilesArb = fc.array(
    fc.stringMatching(/^[a-z0-9\-_/.]{1,80}$/),
    { minLength: 0, maxLength: 20 }
  );

  // Arbitrary: project ID (16-char hex hash)
  const projectIdArb = fc.stringMatching(/^[0-9a-f]{16}$/);

  // Arbitrary: project name
  const projectNameArb = fc.string({ minLength: 1, maxLength: 50 });

  // Arbitrary: ISO 8601 timestamp (generated from integer ms to avoid invalid date issues)
  const timestampArb = fc
    .integer({
      min: new Date("2020-01-01T00:00:00Z").getTime(),
      max: new Date("2030-12-31T23:59:59Z").getTime(),
    })
    .map((ms) => new Date(ms).toISOString());

  // Arbitrary: source
  const sourceArb = fc.constantFrom("manual" as const, "auto" as const);

  // Arbitrary: userId
  const userIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,40}$/);

  // Composite arbitrary: Snapshot with small payload (under overflow threshold)
  const snapshotArb = fc.record({
    projectId: projectIdArb,
    projectName: projectNameArb,
    timestamp: timestampArb,
    source: sourceArb,
    git: fc.record({
      branch: branchArb,
      lastCommits: commitsArb,
      uncommittedDiff: diffArb,
      modifiedFiles: modifiedFilesArb,
    }),
  }) as fc.Arbitrary<Snapshot>;

  /**
   * Helper to construct an API Gateway event for the capture handler.
   */
  function makeEvent(userId: string, snapshot: Snapshot) {
    return {
      body: JSON.stringify(snapshot),
      headers: {},
      requestContext: {
        authorizer: { userId },
      },
    };
  }

  it("stored snapshot preserves the exact git branch name for any valid input", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, snapshotArb, async (userId, snapshot) => {
        vi.clearAllMocks();
        const event = makeEvent(userId, snapshot);

        const result = await handler(event);
        expect(result.statusCode).toBe(200);

        // Verify putSnapshot was called
        expect(putSnapshot).toHaveBeenCalledTimes(1);
        const storedSnapshot = (putSnapshot as ReturnType<typeof vi.fn>).mock
          .calls[0][1] as Snapshot;

        // Branch name is preserved in both overflow and non-overflow paths
        // (the lightweight snapshot still stores the branch name)
        expect(storedSnapshot.git.branch).toBe(snapshot.git.branch);
      }),
      { numRuns: 100 }
    );
  });

  it("stored snapshot preserves all commit messages (up to 5) for any valid input", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, snapshotArb, async (userId, snapshot) => {
        vi.clearAllMocks();
        const event = makeEvent(userId, snapshot);

        const result = await handler(event);
        expect(result.statusCode).toBe(200);

        expect(putSnapshot).toHaveBeenCalledTimes(1);

        // Only check non-overflow path for commit completeness in DynamoDB
        if ((putPayload as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
          // On overflow, full snapshot goes to S3 — verify it was called with complete data
          const s3Snapshot = (putPayload as ReturnType<typeof vi.fn>).mock
            .calls[0][3] as Snapshot;
          expect(s3Snapshot.git.lastCommits).toEqual(snapshot.git.lastCommits);
          expect(s3Snapshot.git.lastCommits.length).toBeLessThanOrEqual(5);
        } else {
          const storedSnapshot = (putSnapshot as ReturnType<typeof vi.fn>).mock
            .calls[0][1] as Snapshot;
          expect(storedSnapshot.git.lastCommits).toEqual(snapshot.git.lastCommits);
          expect(storedSnapshot.git.lastCommits.length).toBeLessThanOrEqual(5);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("stored snapshot preserves the full uncommitted diff when under overflow threshold", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, snapshotArb, async (userId, snapshot) => {
        vi.clearAllMocks();
        const event = makeEvent(userId, snapshot);

        const result = await handler(event);
        expect(result.statusCode).toBe(200);

        if ((putPayload as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
          // On overflow, verify the full diff was sent to S3
          const s3Snapshot = (putPayload as ReturnType<typeof vi.fn>).mock
            .calls[0][3] as Snapshot;
          expect(s3Snapshot.git.uncommittedDiff).toBe(
            snapshot.git.uncommittedDiff
          );
        } else {
          // Non-overflow: verify DynamoDB has the full diff
          expect(putSnapshot).toHaveBeenCalledTimes(1);
          const storedSnapshot = (putSnapshot as ReturnType<typeof vi.fn>).mock
            .calls[0][1] as Snapshot;
          expect(storedSnapshot.git.uncommittedDiff).toBe(
            snapshot.git.uncommittedDiff
          );
        }
      }),
      { numRuns: 100 }
    );
  });

  it("stored snapshot preserves the complete list of modified files for any valid input", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, snapshotArb, async (userId, snapshot) => {
        vi.clearAllMocks();
        const event = makeEvent(userId, snapshot);

        const result = await handler(event);
        expect(result.statusCode).toBe(200);

        if ((putPayload as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
          // On overflow, verify the full modified files were sent to S3
          const s3Snapshot = (putPayload as ReturnType<typeof vi.fn>).mock
            .calls[0][3] as Snapshot;
          expect(s3Snapshot.git.modifiedFiles).toEqual(
            snapshot.git.modifiedFiles
          );
        } else {
          // Non-overflow: verify DynamoDB has all modified files
          expect(putSnapshot).toHaveBeenCalledTimes(1);
          const storedSnapshot = (putSnapshot as ReturnType<typeof vi.fn>).mock
            .calls[0][1] as Snapshot;
          expect(storedSnapshot.git.modifiedFiles).toEqual(
            snapshot.git.modifiedFiles
          );
        }
      }),
      { numRuns: 100 }
    );
  });
});
