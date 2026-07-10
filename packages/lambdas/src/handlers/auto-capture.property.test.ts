import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { AUTOCAPTURE_MAX_PROJECTS } from "@ctx-switch/shared";
import type { Snapshot } from "@ctx-switch/shared";

// Mock DynamoDB docClient
vi.mock("../data/dynamo-client.js", () => ({
  docClient: { send: vi.fn() },
  TABLE_NAME: "test-table",
}));

// Mock the snapshot repo
vi.mock("../data/snapshot-repo.js", () => ({
  putSnapshot: vi.fn().mockResolvedValue(undefined),
  putProjectRecord: vi.fn().mockResolvedValue(undefined),
}));

import { handler } from "./auto-capture.js";
import type { AutoCaptureEvent } from "./auto-capture.js";
import { putSnapshot, putProjectRecord } from "../data/snapshot-repo.js";
import { docClient } from "../data/dynamo-client.js";

/**
 * Feature: context-switcher, Property 10: Auto-capture configuration enforcement
 * Validates: Requirements 7.1, 7.3
 *
 * For any auto-capture configuration with N configured projects, the auto-capture
 * function SHALL process at most 20 projects, and every snapshot produced SHALL
 * have its source field set to "auto".
 */
describe("Property 10: Auto-capture configuration enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  // Arbitrary: userId
  const userIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,40}$/);

  // Arbitrary: project ID (16-char hex hash)
  const projectIdArb = fc.stringMatching(/^[0-9a-f]{16}$/);

  // Arbitrary: project name
  const projectNameArb = fc.string({ minLength: 1, maxLength: 50 });

  // Arbitrary: git branch name
  const branchArb = fc.stringMatching(/^[a-z0-9\-_/]{1,40}$/);

  // Arbitrary: commit messages
  const commitsArb = fc.array(
    fc.string({ minLength: 1, maxLength: 100 }),
    { minLength: 0, maxLength: 5 }
  );

  // Arbitrary: optional note
  const noteArb = fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined });

  // Arbitrary: a single auto-capture project item
  const projectItemArb = fc.record({
    projectId: projectIdArb,
    projectName: projectNameArb,
    gitBranch: fc.option(branchArb, { nil: undefined }),
    lastCommits: fc.option(commitsArb, { nil: undefined }),
    note: noteArb,
  });

  // Arbitrary: list of configured projects (0 to 30 to test beyond the max)
  const projectListArb = fc.array(projectItemArb, { minLength: 0, maxLength: 30 });

  function createEvent(userId: string): AutoCaptureEvent {
    return { detail: { userId } };
  }

  function mockGSI1Response(userId: string, projects: Array<{
    projectId: string;
    projectName: string;
    gitBranch?: string;
    lastCommits?: string[];
    note?: string;
  }>) {
    // GSI-1 query enforces Limit: AUTOCAPTURE_MAX_PROJECTS, so at most 20 are returned
    const limited = projects.slice(0, AUTOCAPTURE_MAX_PROJECTS);
    const items = limited.map((p) => ({
      GSI1PK: `AUTOCAP#${userId}`,
      GSI1SK: `PROJECT#${p.projectId}`,
      projectId: p.projectId,
      projectName: p.projectName,
      gitBranch: p.gitBranch,
      lastCommits: p.lastCommits,
      note: p.note,
    }));

    vi.mocked(docClient.send).mockResolvedValueOnce({
      Items: items,
      $metadata: {},
    } as never);
  }

  it("processes at most AUTOCAPTURE_MAX_PROJECTS (20) projects regardless of how many are configured", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, projectListArb, async (userId, projects) => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});

        mockGSI1Response(userId, projects);

        const result = await handler(createEvent(userId));

        // The handler should process at most 20 projects
        const expectedTotal = Math.min(projects.length, AUTOCAPTURE_MAX_PROJECTS);
        expect(result.total).toBe(expectedTotal);
        expect(result.total).toBeLessThanOrEqual(AUTOCAPTURE_MAX_PROJECTS);
      }),
      { numRuns: 100 }
    );
  });

  it("every snapshot produced has source field set to 'auto'", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, projectListArb, async (userId, projects) => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});

        mockGSI1Response(userId, projects);

        await handler(createEvent(userId));

        // Every call to putSnapshot must have source="auto"
        const calls = vi.mocked(putSnapshot).mock.calls;
        for (const call of calls) {
          const snapshot = call[1] as Snapshot;
          expect(snapshot.source).toBe("auto");
        }
      }),
      { numRuns: 100 }
    );
  });

  it("the number of putSnapshot calls equals the total projects processed", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, projectListArb, async (userId, projects) => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});

        mockGSI1Response(userId, projects);

        const result = await handler(createEvent(userId));

        // putSnapshot should be called once per project attempted
        expect(vi.mocked(putSnapshot).mock.calls.length).toBe(result.total);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: context-switcher, Property 11: Auto-capture resilience
 * Validates: Requirements 7.4, 7.5
 *
 * For any set of configured projects where a subset fail during capture, the
 * auto-capture function SHALL successfully capture all non-failing projects
 * and produce a summary where the success count plus failure count equals
 * the total projects attempted.
 */
describe("Property 11: Auto-capture resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  // Arbitrary: userId
  const userIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,40}$/);

  // Arbitrary: project ID (16-char hex hash)
  const projectIdArb = fc.stringMatching(/^[0-9a-f]{16}$/);

  // Arbitrary: project name
  const projectNameArb = fc.string({ minLength: 1, maxLength: 50 });

  // Arbitrary: git branch name
  const branchArb = fc.stringMatching(/^[a-z0-9\-_/]{1,40}$/);

  // Arbitrary: list of configured projects (1 to 20)
  const projectListArb = fc.array(
    fc.record({
      projectId: projectIdArb,
      projectName: projectNameArb,
      gitBranch: fc.option(branchArb, { nil: undefined }),
      lastCommits: fc.option(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
        { nil: undefined }
      ),
      note: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    }),
    { minLength: 1, maxLength: 20 }
  );

  // Arbitrary: failure pattern — boolean array indicating which projects should fail
  // (true = fail, false = succeed)
  function failurePatternArb(length: number) {
    return fc.array(fc.boolean(), { minLength: length, maxLength: length });
  }

  function createEvent(userId: string): AutoCaptureEvent {
    return { detail: { userId } };
  }

  function mockGSI1Response(userId: string, projects: Array<{
    projectId: string;
    projectName: string;
    gitBranch?: string;
    lastCommits?: string[];
    note?: string;
  }>) {
    const items = projects.map((p) => ({
      GSI1PK: `AUTOCAP#${userId}`,
      GSI1SK: `PROJECT#${p.projectId}`,
      projectId: p.projectId,
      projectName: p.projectName,
      gitBranch: p.gitBranch,
      lastCommits: p.lastCommits,
      note: p.note,
    }));

    vi.mocked(docClient.send).mockResolvedValueOnce({
      Items: items,
      $metadata: {},
    } as never);
  }

  it("successCount + failureCount always equals total projects attempted", async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        projectListArb,
        async (userId, projects) => {
          vi.clearAllMocks();
          vi.spyOn(console, "error").mockImplementation(() => {});
          vi.spyOn(console, "log").mockImplementation(() => {});

          // Generate a random failure pattern for this run
          const failurePattern = await fc.sample(failurePatternArb(projects.length), 1)[0];

          mockGSI1Response(userId, projects);

          // Configure putSnapshot to fail or succeed based on the pattern
          const mockPutSnapshot = vi.mocked(putSnapshot);
          for (let i = 0; i < projects.length; i++) {
            if (failurePattern[i]) {
              mockPutSnapshot.mockRejectedValueOnce(new Error(`Simulated failure for project ${i}`));
            } else {
              mockPutSnapshot.mockResolvedValueOnce(undefined);
            }
          }

          const result = await handler(createEvent(userId));

          // Core invariant: success + failure = total
          expect(result.successCount + result.failureCount).toBe(result.total);
          expect(result.total).toBe(projects.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("all non-failing projects are successfully captured", async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        projectListArb,
        async (userId, projects) => {
          vi.clearAllMocks();
          vi.spyOn(console, "error").mockImplementation(() => {});
          vi.spyOn(console, "log").mockImplementation(() => {});

          // Generate a random failure pattern
          const failurePattern = await fc.sample(failurePatternArb(projects.length), 1)[0];

          mockGSI1Response(userId, projects);

          // Configure putSnapshot to fail or succeed based on the pattern
          const mockPutSnapshot = vi.mocked(putSnapshot);
          for (let i = 0; i < projects.length; i++) {
            if (failurePattern[i]) {
              mockPutSnapshot.mockRejectedValueOnce(new Error(`Simulated failure`));
            } else {
              mockPutSnapshot.mockResolvedValueOnce(undefined);
            }
          }

          const result = await handler(createEvent(userId));

          // The number of successful captures equals the number of non-failing projects
          const expectedSuccesses = failurePattern.filter((f) => !f).length;
          const expectedFailures = failurePattern.filter((f) => f).length;

          expect(result.successCount).toBe(expectedSuccesses);
          expect(result.failureCount).toBe(expectedFailures);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("failing projects do not prevent subsequent projects from being captured", async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        projectListArb,
        async (userId, projects) => {
          vi.clearAllMocks();
          vi.spyOn(console, "error").mockImplementation(() => {});
          vi.spyOn(console, "log").mockImplementation(() => {});

          // Make the first project always fail but subsequent ones succeed
          mockGSI1Response(userId, projects);

          const mockPutSnapshot = vi.mocked(putSnapshot);
          mockPutSnapshot.mockRejectedValueOnce(new Error("First project fails"));
          for (let i = 1; i < projects.length; i++) {
            mockPutSnapshot.mockResolvedValueOnce(undefined);
          }

          const result = await handler(createEvent(userId));

          // First project failed, rest succeeded
          expect(result.failureCount).toBeGreaterThanOrEqual(1);
          if (projects.length > 1) {
            expect(result.successCount).toBe(projects.length - 1);
          }
          // Total is always the full set
          expect(result.total).toBe(projects.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("summary userId matches the event userId", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, projectListArb, async (userId, projects) => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});

        mockGSI1Response(userId, projects);

        const result = await handler(createEvent(userId));

        expect(result.userId).toBe(userId);
      }),
      { numRuns: 100 }
    );
  });
});
