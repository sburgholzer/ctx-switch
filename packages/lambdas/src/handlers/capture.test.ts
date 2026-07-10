import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Snapshot } from "@ctx-switch/shared";
import type { APIGatewayProxyEvent } from "./capture.js";

// Mock the data layer modules
vi.mock("../data/snapshot-repo.js", () => ({
  putSnapshot: vi.fn().mockResolvedValue(undefined),
  putProjectRecord: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../data/archive-repo.js", () => ({
  putPayload: vi.fn().mockResolvedValue("user-123/proj-abc/2024-01-15T10:30:00.000Z.json"),
}));

import { handler } from "./capture.js";
import { putSnapshot, putProjectRecord } from "../data/snapshot-repo.js";
import { putPayload } from "../data/archive-repo.js";

describe("capture handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseSnapshot: Snapshot = {
    projectId: "abc123def456",
    projectName: "my-project",
    timestamp: "2024-01-15T10:30:00.000Z",
    source: "manual",
    git: {
      branch: "feature/auth",
      lastCommits: ["fix: resolve login bug", "feat: add auth module"],
      uncommittedDiff: "diff --git a/src/auth.ts b/src/auth.ts\n+export function login() {}",
      modifiedFiles: ["src/auth.ts", "src/utils.ts"],
    },
    note: "Working on authentication flow",
  };

  function createEvent(body: unknown, userId = "user-123"): APIGatewayProxyEvent {
    return {
      body: typeof body === "string" ? body : JSON.stringify(body),
      requestContext: {
        authorizer: { userId },
      },
      headers: {},
    };
  }

  describe("successful capture", () => {
    it("returns 200 with projectName and timestamp on success", async () => {
      const event = createEvent(baseSnapshot);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.projectName).toBe("my-project");
      expect(body.timestamp).toBe("2024-01-15T10:30:00.000Z");
    });

    it("stores snapshot in DynamoDB via putSnapshot", async () => {
      const event = createEvent(baseSnapshot);
      await handler(event);

      expect(putSnapshot).toHaveBeenCalledWith("user-123", expect.objectContaining({
        projectId: "abc123def456",
        projectName: "my-project",
        timestamp: "2024-01-15T10:30:00.000Z",
        source: "manual",
      }));
    });

    it("updates project record via putProjectRecord", async () => {
      const event = createEvent(baseSnapshot);
      await handler(event);

      expect(putProjectRecord).toHaveBeenCalledWith("user-123", expect.objectContaining({
        userId: "user-123",
        projectId: "abc123def456",
        projectName: "my-project",
        lastParkTimestamp: "2024-01-15T10:30:00.000Z",
      }));
    });

    it("uses note as summary in project record", async () => {
      const event = createEvent(baseSnapshot);
      await handler(event);

      expect(putProjectRecord).toHaveBeenCalledWith("user-123", expect.objectContaining({
        summary: "Working on authentication flow",
      }));
    });

    it("uses first commit message as summary when no note provided", async () => {
      const snapshotWithoutNote: Snapshot = { ...baseSnapshot, note: undefined };
      const event = createEvent(snapshotWithoutNote);
      await handler(event);

      expect(putProjectRecord).toHaveBeenCalledWith("user-123", expect.objectContaining({
        summary: "fix: resolve login bug",
      }));
    });

    it("uses branch-based summary when no note and no commits", async () => {
      const snapshotNoNoteNoCommits: Snapshot = {
        ...baseSnapshot,
        note: undefined,
        git: { ...baseSnapshot.git, lastCommits: [] },
      };
      const event = createEvent(snapshotNoNoteNoCommits);
      await handler(event);

      expect(putProjectRecord).toHaveBeenCalledWith("user-123", expect.objectContaining({
        summary: "Working on feature/auth",
      }));
    });
  });

  describe("validation", () => {
    it("returns 400 when note exceeds 5000 characters", async () => {
      const longNote = "x".repeat(5001);
      const snapshot: Snapshot = { ...baseSnapshot, note: longNote };
      const event = createEvent(snapshot);

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain("Note exceeds maximum length");
    });

    it("accepts note of exactly 5000 characters", async () => {
      const note = "x".repeat(5000);
      const snapshot: Snapshot = { ...baseSnapshot, note };
      const event = createEvent(snapshot);

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it("truncates terminal history to last 50 lines", async () => {
      const history = Array.from({ length: 100 }, (_, i) => `command-${i}`);
      const snapshot: Snapshot = { ...baseSnapshot, terminalHistory: history };
      const event = createEvent(snapshot);

      await handler(event);

      const storedSnapshot = vi.mocked(putSnapshot).mock.calls[0][1];
      expect(storedSnapshot.terminalHistory).toHaveLength(50);
      // Should keep the last 50 lines
      expect(storedSnapshot.terminalHistory![0]).toBe("command-50");
      expect(storedSnapshot.terminalHistory![49]).toBe("command-99");
    });

    it("truncates pull requests to first 20", async () => {
      const prs = Array.from({ length: 30 }, (_, i) => ({
        number: i + 1,
        title: `PR #${i + 1}`,
        url: `https://github.com/org/repo/pull/${i + 1}`,
        state: "open",
      }));
      const snapshot: Snapshot = {
        ...baseSnapshot,
        github: { pullRequests: prs, unresolvedComments: [] },
      };
      const event = createEvent(snapshot);

      await handler(event);

      const storedSnapshot = vi.mocked(putSnapshot).mock.calls[0][1];
      expect(storedSnapshot.github!.pullRequests).toHaveLength(20);
    });

    it("truncates review comments to first 50", async () => {
      const comments = Array.from({ length: 60 }, (_, i) => ({
        prNumber: 1,
        body: `Comment ${i}`,
        path: "src/file.ts",
        line: i + 1,
        status: "open" as const,
      }));
      const snapshot: Snapshot = {
        ...baseSnapshot,
        github: { pullRequests: [], unresolvedComments: comments },
      };
      const event = createEvent(snapshot);

      await handler(event);

      const storedSnapshot = vi.mocked(putSnapshot).mock.calls[0][1];
      expect(storedSnapshot.github!.unresolvedComments).toHaveLength(50);
    });
  });

  describe("overflow routing", () => {
    it("routes to S3 when payload exceeds 400KB", async () => {
      // Create a snapshot with a large diff to exceed 400KB
      const largeDiff = "x".repeat(500_000);
      const snapshot: Snapshot = {
        ...baseSnapshot,
        git: { ...baseSnapshot.git, uncommittedDiff: largeDiff },
      };
      const event = createEvent(snapshot);

      await handler(event);

      // Should store in S3
      expect(putPayload).toHaveBeenCalledWith(
        "user-123",
        "abc123def456",
        "2024-01-15T10:30:00.000Z",
        expect.objectContaining({ projectId: "abc123def456" })
      );

      // Should store lightweight reference in DynamoDB
      const storedSnapshot = vi.mocked(putSnapshot).mock.calls[0][1] as Snapshot & { payloadRef?: string };
      expect(storedSnapshot.payloadRef).toBe("user-123/proj-abc/2024-01-15T10:30:00.000Z.json");
      expect(storedSnapshot.git.uncommittedDiff).toBe("");
      expect(storedSnapshot.git.lastCommits).toEqual([]);
    });

    it("stores directly in DynamoDB when payload is under 400KB", async () => {
      const event = createEvent(baseSnapshot);

      await handler(event);

      expect(putPayload).not.toHaveBeenCalled();
      expect(putSnapshot).toHaveBeenCalledWith("user-123", expect.objectContaining({
        git: expect.objectContaining({
          uncommittedDiff: expect.any(String),
        }),
      }));
    });
  });

  describe("error handling", () => {
    it("returns 401 when userId is missing from authorizer context", async () => {
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify(baseSnapshot),
        requestContext: { authorizer: {} },
        headers: {},
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toContain("Unauthorized");
    });

    it("returns 400 when request body is null", async () => {
      const event = {
        ...createEvent(baseSnapshot),
        body: null,
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain("Request body is required");
    });

    it("returns 400 when request body is invalid JSON", async () => {
      const event = createEvent("not-valid-json");

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain("Invalid JSON");
    });

    it("returns 500 when putSnapshot throws an unexpected error", async () => {
      vi.mocked(putSnapshot).mockRejectedValueOnce(new Error("DynamoDB connection failed"));

      const event = createEvent(baseSnapshot);
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("DynamoDB connection failed");
    });

    it("returns 500 when putProjectRecord throws an unexpected error", async () => {
      vi.mocked(putProjectRecord).mockRejectedValueOnce(new Error("DynamoDB write failed"));

      const event = createEvent(baseSnapshot);
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("DynamoDB write failed");
    });

    it("returns 500 when putPayload throws during overflow", async () => {
      vi.mocked(putPayload).mockRejectedValueOnce(new Error("S3 upload failed"));

      const largeDiff = "x".repeat(500_000);
      const snapshot: Snapshot = {
        ...baseSnapshot,
        git: { ...baseSnapshot.git, uncommittedDiff: largeDiff },
      };
      const event = createEvent(snapshot);

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("S3 upload failed");
    });
  });
});
