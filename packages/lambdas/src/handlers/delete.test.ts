import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEvent } from "./capture.js";

// Mock the data layer
vi.mock("../data/snapshot-repo.js", () => ({
  deleteProjectSnapshots: vi.fn().mockResolvedValue(0),
  deleteProjectRecord: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../data/archive-repo.js", () => ({
  deletePayloads: vi.fn().mockResolvedValue(0),
}));

import { handler } from "./delete.js";
import { deleteProjectSnapshots, deleteProjectRecord } from "../data/snapshot-repo.js";
import { deletePayloads } from "../data/archive-repo.js";

describe("delete handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createEvent(
    userId = "user-123",
    projectId = "proj-abc"
  ): APIGatewayProxyEvent {
    return {
      body: null,
      pathParameters: { project: projectId },
      requestContext: {
        authorizer: { userId },
      },
      headers: {},
    };
  }

  describe("successful deletion", () => {
    it("returns 200 with projectId and snapshotsRemoved count", async () => {
      vi.mocked(deleteProjectSnapshots).mockResolvedValueOnce(5);
      vi.mocked(deletePayloads).mockResolvedValueOnce(2);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.projectId).toBe("proj-abc");
      expect(body.snapshotsRemoved).toBe(5);
    });

    it("calls deleteProjectSnapshots with correct userId and projectId", async () => {
      vi.mocked(deleteProjectSnapshots).mockResolvedValueOnce(3);
      vi.mocked(deletePayloads).mockResolvedValueOnce(0);

      const event = createEvent("user-xyz", "proj-def");
      await handler(event);

      expect(deleteProjectSnapshots).toHaveBeenCalledWith("user-xyz", "proj-def");
    });

    it("calls deletePayloads with correct userId and projectId", async () => {
      vi.mocked(deleteProjectSnapshots).mockResolvedValueOnce(3);
      vi.mocked(deletePayloads).mockResolvedValueOnce(1);

      const event = createEvent("user-xyz", "proj-def");
      await handler(event);

      expect(deletePayloads).toHaveBeenCalledWith("user-xyz", "proj-def");
    });

    it("calls deleteProjectRecord after deleting snapshots", async () => {
      vi.mocked(deleteProjectSnapshots).mockResolvedValueOnce(2);
      vi.mocked(deletePayloads).mockResolvedValueOnce(0);

      const event = createEvent("user-123", "proj-abc");
      await handler(event);

      expect(deleteProjectRecord).toHaveBeenCalledWith("user-123", "proj-abc");
    });

    it("returns snapshotsRemoved from DynamoDB count even when S3 has overflow objects", async () => {
      vi.mocked(deleteProjectSnapshots).mockResolvedValueOnce(3);
      vi.mocked(deletePayloads).mockResolvedValueOnce(5);

      const event = createEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.snapshotsRemoved).toBe(3);
    });

    it("succeeds when only S3 has payloads (DynamoDB returns 0 but S3 > 0)", async () => {
      vi.mocked(deleteProjectSnapshots).mockResolvedValueOnce(0);
      vi.mocked(deletePayloads).mockResolvedValueOnce(3);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.snapshotsRemoved).toBe(0);
    });
  });

  describe("project not found", () => {
    it("returns 404 when no snapshots exist in DynamoDB or S3", async () => {
      vi.mocked(deleteProjectSnapshots).mockResolvedValueOnce(0);
      vi.mocked(deletePayloads).mockResolvedValueOnce(0);

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Project not found");
    });

    it("does not call deleteProjectRecord when project not found", async () => {
      vi.mocked(deleteProjectSnapshots).mockResolvedValueOnce(0);
      vi.mocked(deletePayloads).mockResolvedValueOnce(0);

      const event = createEvent();
      await handler(event);

      expect(deleteProjectRecord).not.toHaveBeenCalled();
    });
  });

  describe("authentication", () => {
    it("returns 401 when userId is missing from authorizer context", async () => {
      const event: APIGatewayProxyEvent = {
        body: null,
        pathParameters: { project: "proj-abc" },
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
        pathParameters: { project: "proj-abc" },
        requestContext: {},
        headers: {},
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toContain("Unauthorized");
    });
  });

  describe("missing path parameter", () => {
    it("returns 400 when pathParameters is null", async () => {
      const event: APIGatewayProxyEvent = {
        body: null,
        pathParameters: null,
        requestContext: { authorizer: { userId: "user-123" } },
        headers: {},
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Project identifier is required");
    });

    it("returns 400 when project is undefined in pathParameters", async () => {
      const event: APIGatewayProxyEvent = {
        body: null,
        pathParameters: {},
        requestContext: { authorizer: { userId: "user-123" } },
        headers: {},
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Project identifier is required");
    });
  });

  describe("error handling", () => {
    it("returns 500 when deleteProjectSnapshots throws an unexpected error", async () => {
      vi.mocked(deleteProjectSnapshots).mockRejectedValueOnce(
        new Error("DynamoDB connection failed")
      );

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("DynamoDB connection failed");
    });

    it("returns 500 when deletePayloads throws an unexpected error", async () => {
      vi.mocked(deleteProjectSnapshots).mockResolvedValueOnce(3);
      vi.mocked(deletePayloads).mockRejectedValueOnce(
        new Error("S3 access denied")
      );

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("S3 access denied");
    });

    it("returns 500 when deleteProjectRecord throws an unexpected error", async () => {
      vi.mocked(deleteProjectSnapshots).mockResolvedValueOnce(2);
      vi.mocked(deletePayloads).mockResolvedValueOnce(0);
      vi.mocked(deleteProjectRecord).mockRejectedValueOnce(
        new Error("Conditional check failed")
      );

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Conditional check failed");
    });

    it("returns 500 with generic message for non-Error throws", async () => {
      vi.mocked(deleteProjectSnapshots).mockRejectedValueOnce("something broke");

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("Internal server error");
    });
  });
});
