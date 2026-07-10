import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Snapshot } from "@ctx-switch/shared";
import type { APIGatewayProxyEvent } from "./capture.js";

// Mock the data layer
vi.mock("../data/snapshot-repo.js", () => ({
  getSnapshotHistory: vi.fn().mockResolvedValue([]),
}));

import { handler } from "./history.js";
import { getSnapshotHistory } from "../data/snapshot-repo.js";

describe("history handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createEvent(
    userId = "user-123",
    projectId: string | undefined = "proj-abc"
  ): APIGatewayProxyEvent & { pathParameters?: Record<string, string | undefined> } {
    return {
      body: null,
      headers: {},
      pathParameters: projectId ? { project: projectId } : undefined,
      requestContext: {
        authorizer: { userId },
      },
    };
  }

  function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
    return {
      projectId: "proj-abc",
      projectName: "test-project",
      timestamp: "2024-01-15T10:00:00.000Z",
      source: "manual",
      git: {
        branch: "main",
        lastCommits: ["fix: resolve auth issue"],
        uncommittedDiff: "",
        modifiedFiles: ["src/auth.ts"],
      },
      ...overrides,
    };
  }

  describe("successful history retrieval", () => {
    it("returns 200 with projectId and snapshots array", async () => {
      const snapshots = [
        makeSnapshot({ timestamp: "2024-01-15T10:00:00.000Z" }),
        makeSnapshot({ timestamp: "2024-01-14T09:00:00.000Z" }),
      ];
      vi.mocked(getSnapshotHistory).mockResolvedValueOnce(snapshots);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.projectId).toBe("proj-abc");
      expect(body.snapshots).toHaveLength(2);
    });

    it("includes timestamp and summary in each entry", async () => {
      const snapshots = [
        makeSnapshot({
          timestamp: "2024-01-15T10:00:00.000Z",
          note: "Working on login flow",
        }),
      ];
      vi.mocked(getSnapshotHistory).mockResolvedValueOnce(snapshots);

      const event = createEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.snapshots[0]).toEqual({
        timestamp: "2024-01-15T10:00:00.000Z",
        summary: "Working on login flow",
      });
    });

    it("derives summary from note when present", async () => {
      const snapshots = [
        makeSnapshot({ note: "Debugging performance issue" }),
      ];
      vi.mocked(getSnapshotHistory).mockResolvedValueOnce(snapshots);

      const event = createEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.snapshots[0].summary).toBe("Debugging performance issue");
    });

    it("derives summary from first commit when note is absent", async () => {
      const snapshots = [
        makeSnapshot({
          note: undefined,
          git: {
            branch: "feature/auth",
            lastCommits: ["feat: add OAuth2 support"],
            uncommittedDiff: "",
            modifiedFiles: [],
          },
        }),
      ];
      vi.mocked(getSnapshotHistory).mockResolvedValueOnce(snapshots);

      const event = createEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.snapshots[0].summary).toBe("feat: add OAuth2 support");
    });

    it("derives summary from branch name when no note or commits", async () => {
      const snapshots = [
        makeSnapshot({
          note: undefined,
          git: {
            branch: "feature/new-dashboard",
            lastCommits: [],
            uncommittedDiff: "",
            modifiedFiles: [],
          },
        }),
      ];
      vi.mocked(getSnapshotHistory).mockResolvedValueOnce(snapshots);

      const event = createEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.snapshots[0].summary).toBe("Working on feature/new-dashboard");
    });

    it("truncates summary to 80 characters", async () => {
      const longNote =
        "This is a very long note that definitely exceeds the eighty character limit and should be truncated with an ellipsis at the end";
      const snapshots = [makeSnapshot({ note: longNote })];
      vi.mocked(getSnapshotHistory).mockResolvedValueOnce(snapshots);

      const event = createEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.snapshots[0].summary.length).toBeLessThanOrEqual(80);
      expect(body.snapshots[0].summary).toContain("…");
    });

    it("does not truncate summary that is 80 chars or fewer", async () => {
      const shortNote = "Short note";
      const snapshots = [makeSnapshot({ note: shortNote })];
      vi.mocked(getSnapshotHistory).mockResolvedValueOnce(snapshots);

      const event = createEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.snapshots[0].summary).toBe(shortNote);
    });

    it("calls getSnapshotHistory with correct userId and projectId", async () => {
      vi.mocked(getSnapshotHistory).mockResolvedValueOnce([makeSnapshot()]);

      const event = createEvent("user-xyz", "proj-def");
      await handler(event);

      expect(getSnapshotHistory).toHaveBeenCalledWith("user-xyz", "proj-def");
    });
  });

  describe("project not found", () => {
    it("returns 404 when no snapshots exist for the project", async () => {
      vi.mocked(getSnapshotHistory).mockResolvedValueOnce([]);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe(
        "No context has been captured for project 'proj-abc'"
      );
    });

    it("includes the project ID in the not-found error message", async () => {
      vi.mocked(getSnapshotHistory).mockResolvedValueOnce([]);

      const event = createEvent("user-123", "my-special-project");
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe(
        "No context has been captured for project 'my-special-project'"
      );
    });
  });

  describe("input validation", () => {
    it("returns 400 when project ID is missing from path parameters", async () => {
      const event: APIGatewayProxyEvent & { pathParameters?: Record<string, string | undefined> | null } = {
        body: null,
        headers: {},
        pathParameters: null,
        requestContext: {
          authorizer: { userId: "user-123" },
        },
      };
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Project identifier is required");
    });
  });

  describe("authentication", () => {
    it("returns 401 when userId is missing from authorizer context", async () => {
      const event: APIGatewayProxyEvent & { pathParameters?: Record<string, string | undefined> } = {
        body: null,
        headers: {},
        pathParameters: { project: "proj-abc" },
        requestContext: { authorizer: {} },
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toContain("Unauthorized");
    });

    it("returns 401 when authorizer is undefined", async () => {
      const event: APIGatewayProxyEvent & { pathParameters?: Record<string, string | undefined> } = {
        body: null,
        headers: {},
        pathParameters: { project: "proj-abc" },
        requestContext: {},
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toContain("Unauthorized");
    });
  });

  describe("error handling", () => {
    it("returns 500 when getSnapshotHistory throws an unexpected error", async () => {
      vi.mocked(getSnapshotHistory).mockRejectedValueOnce(
        new Error("DynamoDB connection failed")
      );

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("DynamoDB connection failed");
    });

    it("returns 500 with generic message for non-Error throws", async () => {
      vi.mocked(getSnapshotHistory).mockRejectedValueOnce("something went wrong");

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Internal server error");
    });
  });
});
