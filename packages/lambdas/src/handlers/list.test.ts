import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProjectRecord } from "@ctx-switch/shared";
import type { APIGatewayProxyEvent } from "./capture.js";

// Mock the data layer
vi.mock("../data/snapshot-repo.js", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
}));

import { handler } from "./list.js";
import { listProjects } from "../data/snapshot-repo.js";

describe("list handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createEvent(userId = "user-123"): APIGatewayProxyEvent {
    return {
      body: null,
      requestContext: {
        authorizer: { userId },
      },
      headers: {},
    };
  }

  const sampleProjects: ProjectRecord[] = [
    {
      userId: "user-123",
      projectId: "proj-aaa",
      projectName: "alpha-project",
      lastParkTimestamp: "2024-01-10T08:00:00.000Z",
      summary: "Working on feature A",
      snapshotCount: 3,
    },
    {
      userId: "user-123",
      projectId: "proj-bbb",
      projectName: "beta-project",
      lastParkTimestamp: "2024-01-15T14:30:00.000Z",
      summary: "Fixing bug in authentication module",
      snapshotCount: 1,
    },
    {
      userId: "user-123",
      projectId: "proj-ccc",
      projectName: "gamma-project",
      lastParkTimestamp: "2024-01-12T11:00:00.000Z",
      summary: "Refactoring the database layer to support new query patterns",
      snapshotCount: 5,
    },
  ];

  describe("successful listing", () => {
    it("returns 200 with projects sorted by lastParkTimestamp descending", async () => {
      vi.mocked(listProjects).mockResolvedValueOnce(sampleProjects);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.projects).toHaveLength(3);
      // Should be sorted newest-first
      expect(body.projects[0].projectName).toBe("beta-project");
      expect(body.projects[1].projectName).toBe("gamma-project");
      expect(body.projects[2].projectName).toBe("alpha-project");
    });

    it("includes projectName, lastParkTimestamp, and summary in each entry", async () => {
      vi.mocked(listProjects).mockResolvedValueOnce([sampleProjects[0]]);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.projects[0]).toEqual({
        projectName: "alpha-project",
        lastParkTimestamp: "2024-01-10T08:00:00.000Z",
        summary: "Working on feature A",
      });
    });

    it("truncates summary to 80 characters", async () => {
      const projectWithLongSummary: ProjectRecord = {
        userId: "user-123",
        projectId: "proj-long",
        projectName: "long-summary-project",
        lastParkTimestamp: "2024-01-20T09:00:00.000Z",
        summary: "This is a very long summary that definitely exceeds the eighty character limit and should be truncated with an ellipsis",
        snapshotCount: 1,
      };
      vi.mocked(listProjects).mockResolvedValueOnce([projectWithLongSummary]);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.projects[0].summary.length).toBeLessThanOrEqual(80);
      expect(body.projects[0].summary).toContain("…");
    });

    it("does not truncate summary that is 80 chars or fewer", async () => {
      const shortSummary = "Short summary";
      const project: ProjectRecord = {
        userId: "user-123",
        projectId: "proj-short",
        projectName: "short-project",
        lastParkTimestamp: "2024-01-20T09:00:00.000Z",
        summary: shortSummary,
        snapshotCount: 1,
      };
      vi.mocked(listProjects).mockResolvedValueOnce([project]);

      const event = createEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.projects[0].summary).toBe(shortSummary);
    });

    it("calls listProjects with the authenticated userId", async () => {
      vi.mocked(listProjects).mockResolvedValueOnce([]);

      const event = createEvent("user-abc");
      await handler(event);

      expect(listProjects).toHaveBeenCalledWith("user-abc");
    });
  });

  describe("empty state", () => {
    it("returns 200 with empty projects array and message when no projects exist", async () => {
      vi.mocked(listProjects).mockResolvedValueOnce([]);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.projects).toEqual([]);
      expect(body.message).toBe("No projects have been captured");
    });
  });

  describe("authentication", () => {
    it("returns 401 when userId is missing from authorizer context", async () => {
      const event: APIGatewayProxyEvent = {
        body: null,
        requestContext: { authorizer: {} },
        headers: {},
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toContain("Unauthorized");
    });

    it("returns 401 when authorizer is undefined", async () => {
      const event: APIGatewayProxyEvent = {
        body: null,
        requestContext: {},
        headers: {},
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toContain("Unauthorized");
    });
  });

  describe("error handling", () => {
    it("returns 500 when listProjects throws an unexpected error", async () => {
      vi.mocked(listProjects).mockRejectedValueOnce(
        new Error("DynamoDB connection failed")
      );

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("DynamoDB connection failed");
    });

    it("returns 500 with generic message for non-Error throws", async () => {
      vi.mocked(listProjects).mockRejectedValueOnce("something went wrong");

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Internal server error");
    });
  });
});
