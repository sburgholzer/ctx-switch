import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUTOCAPTURE_MAX_PROJECTS } from "@ctx-switch/shared";
import type { AutoCaptureEvent } from "./auto-capture.js";

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

import { handler, getAutoCaptureProjects } from "./auto-capture.js";
import { putSnapshot, putProjectRecord } from "../data/snapshot-repo.js";
import { docClient } from "../data/dynamo-client.js";

describe("auto-capture handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  function createEvent(userId = "user-123"): AutoCaptureEvent {
    return {
      detail: { userId },
    };
  }

  function mockGSI1Response(items: Record<string, unknown>[]) {
    vi.mocked(docClient.send).mockResolvedValueOnce({
      Items: items,
      $metadata: {},
    } as never);
  }

  const sampleProjects = [
    {
      GSI1PK: "AUTOCAP#user-123",
      GSI1SK: "PROJECT#proj-aaa",
      projectId: "proj-aaa",
      projectName: "alpha-project",
      gitBranch: "main",
      lastCommits: ["feat: add login", "fix: typo"],
      note: "Working on auth",
    },
    {
      GSI1PK: "AUTOCAP#user-123",
      GSI1SK: "PROJECT#proj-bbb",
      projectId: "proj-bbb",
      projectName: "beta-project",
      gitBranch: "feature/api",
      lastCommits: ["refactor: cleanup"],
    },
  ];

  describe("successful auto-capture", () => {
    it("returns summary with all projects successful", async () => {
      mockGSI1Response(sampleProjects);

      const event = createEvent();
      const result = await handler(event);

      expect(result).toEqual({
        userId: "user-123",
        successCount: 2,
        failureCount: 0,
        total: 2,
      });
    });

    it("calls putSnapshot for each configured project with source=auto", async () => {
      mockGSI1Response(sampleProjects);

      await handler(createEvent());

      expect(putSnapshot).toHaveBeenCalledTimes(2);

      // Verify first call has source="auto"
      const firstCall = vi.mocked(putSnapshot).mock.calls[0];
      expect(firstCall[0]).toBe("user-123");
      expect(firstCall[1].source).toBe("auto");
      expect(firstCall[1].projectId).toBe("proj-aaa");
      expect(firstCall[1].projectName).toBe("alpha-project");
      expect(firstCall[1].git.branch).toBe("main");
      expect(firstCall[1].git.lastCommits).toEqual(["feat: add login", "fix: typo"]);
      expect(firstCall[1].note).toBe("Working on auth");

      // Verify second call
      const secondCall = vi.mocked(putSnapshot).mock.calls[1];
      expect(secondCall[1].source).toBe("auto");
      expect(secondCall[1].projectId).toBe("proj-bbb");
      expect(secondCall[1].git.branch).toBe("feature/api");
    });

    it("calls putProjectRecord for each successful capture", async () => {
      mockGSI1Response(sampleProjects);

      await handler(createEvent());

      expect(putProjectRecord).toHaveBeenCalledTimes(2);

      const firstRecord = vi.mocked(putProjectRecord).mock.calls[0];
      expect(firstRecord[0]).toBe("user-123");
      expect(firstRecord[1].projectId).toBe("proj-aaa");
      expect(firstRecord[1].projectName).toBe("alpha-project");
      expect(firstRecord[1].summary).toBe("Working on auth");
    });

    it("uses git branch in summary when no note is present", async () => {
      mockGSI1Response([sampleProjects[1]]);

      await handler(createEvent());

      const record = vi.mocked(putProjectRecord).mock.calls[0][1];
      expect(record.summary).toContain("Auto-captured on feature/api");
    });

    it("uses 'unknown' for git branch when not stored in config", async () => {
      mockGSI1Response([
        {
          GSI1PK: "AUTOCAP#user-123",
          GSI1SK: "PROJECT#proj-ccc",
          projectId: "proj-ccc",
          projectName: "gamma-project",
        },
      ]);

      await handler(createEvent());

      const snapshot = vi.mocked(putSnapshot).mock.calls[0][1];
      expect(snapshot.git.branch).toBe("unknown");
      expect(snapshot.git.lastCommits).toEqual([]);
    });
  });

  describe("empty state", () => {
    it("returns summary with zeros when no projects are configured", async () => {
      mockGSI1Response([]);

      const result = await handler(createEvent());

      expect(result).toEqual({
        userId: "user-123",
        successCount: 0,
        failureCount: 0,
        total: 0,
      });
    });

    it("does not call putSnapshot when no projects exist", async () => {
      mockGSI1Response([]);

      await handler(createEvent());

      expect(putSnapshot).not.toHaveBeenCalled();
      expect(putProjectRecord).not.toHaveBeenCalled();
    });
  });

  describe("failure handling", () => {
    it("logs error and continues on individual project failure", async () => {
      mockGSI1Response(sampleProjects);

      // First project succeeds, second fails
      vi.mocked(putSnapshot)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("DynamoDB write failed"));

      const result = await handler(createEvent());

      expect(result).toEqual({
        userId: "user-123",
        successCount: 1,
        failureCount: 1,
        total: 2,
      });

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Auto-capture failed for project")
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("beta-project")
      );
    });

    it("handles all projects failing gracefully", async () => {
      mockGSI1Response(sampleProjects);

      vi.mocked(putSnapshot).mockRejectedValue(new Error("Service unavailable"));

      const result = await handler(createEvent());

      expect(result).toEqual({
        userId: "user-123",
        successCount: 0,
        failureCount: 2,
        total: 2,
      });

      expect(console.error).toHaveBeenCalledTimes(2);
    });

    it("handles non-Error throws in capture", async () => {
      mockGSI1Response([sampleProjects[0]]);

      vi.mocked(putSnapshot).mockRejectedValueOnce("string error");

      const result = await handler(createEvent());

      expect(result.failureCount).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Unknown error")
      );
    });

    it("does not retry failed projects", async () => {
      mockGSI1Response([sampleProjects[0]]);

      vi.mocked(putSnapshot).mockRejectedValueOnce(new Error("Timeout"));

      await handler(createEvent());

      // putSnapshot only called once — no retry
      expect(putSnapshot).toHaveBeenCalledTimes(1);
    });
  });

  describe("summary counts", () => {
    it("successCount + failureCount equals total", async () => {
      const threeProjects = [
        ...sampleProjects,
        {
          GSI1PK: "AUTOCAP#user-123",
          GSI1SK: "PROJECT#proj-ccc",
          projectId: "proj-ccc",
          projectName: "gamma-project",
          gitBranch: "develop",
        },
      ];
      mockGSI1Response(threeProjects);

      // First succeeds, second fails, third succeeds
      vi.mocked(putSnapshot)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(undefined);

      const result = await handler(createEvent());

      expect(result.successCount + result.failureCount).toBe(result.total);
      expect(result.total).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
    });
  });

  describe("getAutoCaptureProjects", () => {
    it("queries GSI-1 with correct key condition", async () => {
      mockGSI1Response([]);

      await getAutoCaptureProjects("user-456");

      expect(docClient.send).toHaveBeenCalledTimes(1);
      const command = vi.mocked(docClient.send).mock.calls[0][0] as { input: Record<string, unknown> };
      expect(command.input).toMatchObject({
        TableName: "test-table",
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": "AUTOCAP#user-456",
          ":skPrefix": "PROJECT#",
        },
        Limit: AUTOCAPTURE_MAX_PROJECTS,
      });
    });

    it("returns empty array when no items are found", async () => {
      vi.mocked(docClient.send).mockResolvedValueOnce({
        Items: undefined,
        $metadata: {},
      } as never);

      const result = await getAutoCaptureProjects("user-789");

      expect(result).toEqual([]);
    });

    it("maps items to AutoCaptureProjectItem shape", async () => {
      mockGSI1Response(sampleProjects);

      const result = await getAutoCaptureProjects("user-123");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        GSI1PK: "AUTOCAP#user-123",
        GSI1SK: "PROJECT#proj-aaa",
        projectId: "proj-aaa",
        projectName: "alpha-project",
        gitBranch: "main",
        lastCommits: ["feat: add login", "fix: typo"],
        note: "Working on auth",
      });
    });
  });
});
