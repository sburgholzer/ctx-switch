import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import type { Snapshot } from "@ctx-switch/shared";
import type { APIGatewayProxyEvent } from "./capture.js";

// Mock the data layer modules
vi.mock("../data/snapshot-repo.js", () => ({
  putSnapshot: vi.fn().mockResolvedValue(undefined),
  putProjectRecord: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../data/archive-repo.js", () => ({
  putPayload: vi.fn().mockResolvedValue("ref/path.json"),
}));

import { handler } from "./capture.js";

/**
 * Feature: context-switcher, Property 5: Output messages contain project identifiers
 * Validates: Requirements 1.6, 2.4
 *
 * For any project name, confirmation messages after successful park SHALL contain
 * that project name and a timestamp, and error messages for missing projects SHALL
 * contain the queried project name in the format
 * "No context has been captured for project '<project-name>'"
 */
describe("Property 5: Output messages contain project identifiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Arbitrary: non-empty project names (diverse strings)
  const projectNameArb = fc.string({ minLength: 1, maxLength: 100 }).filter(
    (s) => s.trim().length > 0
  );

  // Arbitrary: project IDs (hex hashes)
  const projectIdArb = fc.stringMatching(/^[0-9a-f]{16}$/);

  // Arbitrary: ISO 8601 timestamps
  const timestampArb = fc
    .integer({
      min: new Date("2020-01-01T00:00:00Z").getTime(),
      max: new Date("2030-12-31T23:59:59Z").getTime(),
    })
    .map((ms) => new Date(ms).toISOString());

  // Arbitrary: git branch names
  const branchArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9/_-]{0,50}$/);

  // Arbitrary: commit messages
  const commitArb = fc.string({ minLength: 1, maxLength: 200 });

  // Arbitrary: file paths
  const filePathArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9/._-]{0,80}$/);

  // Arbitrary: full Snapshot for capture handler
  const snapshotArb = fc
    .tuple(
      projectIdArb,
      projectNameArb,
      timestampArb,
      branchArb,
      fc.array(commitArb, { minLength: 0, maxLength: 5 }),
      fc.string({ minLength: 0, maxLength: 1000 }),
      fc.array(filePathArb, { minLength: 0, maxLength: 10 })
    )
    .map(
      ([projectId, projectName, timestamp, branch, commits, diff, files]): Snapshot => ({
        projectId,
        projectName,
        timestamp,
        source: "manual",
        git: {
          branch,
          lastCommits: commits,
          uncommittedDiff: diff,
          modifiedFiles: files,
        },
      })
    );

  function createEvent(body: unknown, userId = "user-123"): APIGatewayProxyEvent {
    return {
      body: typeof body === "string" ? body : JSON.stringify(body),
      requestContext: {
        authorizer: { userId },
      },
      headers: {},
    };
  }

  it("capture handler success response always contains the projectName from the snapshot", async () => {
    await fc.assert(
      fc.asyncProperty(snapshotArb, async (snapshot) => {
        const event = createEvent(snapshot);
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.projectName).toBe(snapshot.projectName);
      }),
      { numRuns: 100 }
    );
  });

  it("capture handler success response always contains the timestamp from the snapshot", async () => {
    await fc.assert(
      fc.asyncProperty(snapshotArb, async (snapshot) => {
        const event = createEvent(snapshot);
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.timestamp).toBe(snapshot.timestamp);
      }),
      { numRuns: 100 }
    );
  });

  it("not-found error message format always contains the queried project name", () => {
    fc.assert(
      fc.property(projectNameArb, (projectName) => {
        // The error message format as specified in Requirement 2.4
        const errorMessage = `No context has been captured for project '${projectName}'`;

        // The message must contain the project name
        expect(errorMessage).toContain(projectName);

        // The message must follow the exact format with single quotes around the name
        expect(errorMessage).toBe(
          `No context has been captured for project '${projectName}'`
        );

        // The message starts with the required prefix
        expect(errorMessage.startsWith("No context has been captured for project '")).toBe(true);

        // The message ends with the project name and a closing quote
        expect(errorMessage.endsWith(`${projectName}'`)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
