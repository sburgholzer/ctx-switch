import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { Snapshot, ProjectRecord } from "@ctx-switch/shared";

// Mock the document client before importing the module under test
const ddbMock = mockClient(DynamoDBDocumentClient);

// Dynamic import to ensure mock is set up first
const { putSnapshot, getLatestSnapshot, getSnapshotHistory, listProjects, deleteProjectSnapshots, putProjectRecord, deleteProjectRecord } = await import("./snapshot-repo.js");

describe("snapshot-repo", () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  const userId = "user-123";
  const projectId = "abc123def456";
  const mockSnapshot: Snapshot = {
    projectId,
    projectName: "my-project",
    timestamp: "2024-01-15T10:30:00.000Z",
    source: "manual",
    git: {
      branch: "main",
      lastCommits: ["fix: resolve bug"],
      uncommittedDiff: "diff --git a/file.ts",
      modifiedFiles: ["file.ts"],
    },
    note: "Working on bug fix",
  };

  const mockProjectRecord: ProjectRecord = {
    userId,
    projectId,
    projectName: "my-project",
    lastParkTimestamp: "2024-01-15T10:30:00.000Z",
    summary: "Working on bug fix",
    snapshotCount: 3,
  };

  describe("putSnapshot", () => {
    it("stores a snapshot with correct PK and SK", async () => {
      ddbMock.on(PutCommand).resolves({});

      await putSnapshot(userId, mockSnapshot);

      const calls = ddbMock.commandCalls(PutCommand);
      expect(calls).toHaveLength(1);
      const input = calls[0].args[0].input;
      expect(input.Item?.PK).toBe(`USER#${userId}`);
      expect(input.Item?.SK).toBe(`SNAPSHOT#${projectId}#${mockSnapshot.timestamp}`);
      expect(input.Item?.projectName).toBe("my-project");
      expect(input.Item?.source).toBe("manual");
    });
  });

  describe("getLatestSnapshot", () => {
    it("queries with correct key condition and returns snapshot", async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [{ PK: `USER#${userId}`, SK: `SNAPSHOT#${projectId}#2024-01-15T10:30:00.000Z`, ...mockSnapshot }],
      });

      const result = await getLatestSnapshot(userId, projectId);

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls).toHaveLength(1);
      const input = calls[0].args[0].input;
      expect(input.ExpressionAttributeValues?.[":pk"]).toBe(`USER#${userId}`);
      expect(input.ExpressionAttributeValues?.[":skPrefix"]).toBe(`SNAPSHOT#${projectId}#`);
      expect(input.ScanIndexForward).toBe(false);
      expect(input.Limit).toBe(1);
      expect(result).toBeDefined();
      expect(result!.projectId).toBe(projectId);
      expect(result!.timestamp).toBe("2024-01-15T10:30:00.000Z");
    });

    it("returns undefined when no snapshot exists", async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const result = await getLatestSnapshot(userId, projectId);
      expect(result).toBeUndefined();
    });
  });

  describe("getSnapshotHistory", () => {
    it("queries with limit 10, newest first", async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          { ...mockSnapshot, timestamp: "2024-01-15T10:30:00.000Z" },
          { ...mockSnapshot, timestamp: "2024-01-14T10:30:00.000Z" },
        ],
      });

      const result = await getSnapshotHistory(userId, projectId);

      const calls = ddbMock.commandCalls(QueryCommand);
      const input = calls[0].args[0].input;
      expect(input.ScanIndexForward).toBe(false);
      expect(input.Limit).toBe(10);
      expect(result).toHaveLength(2);
    });

    it("returns empty array when no snapshots exist", async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const result = await getSnapshotHistory(userId, projectId);
      expect(result).toEqual([]);
    });
  });

  describe("listProjects", () => {
    it("queries with PROJECT# prefix", async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [{ PK: `USER#${userId}`, SK: `PROJECT#${projectId}`, ...mockProjectRecord }],
      });

      const result = await listProjects(userId);

      const calls = ddbMock.commandCalls(QueryCommand);
      const input = calls[0].args[0].input;
      expect(input.ExpressionAttributeValues?.[":pk"]).toBe(`USER#${userId}`);
      expect(input.ExpressionAttributeValues?.[":skPrefix"]).toBe("PROJECT#");
      expect(result).toHaveLength(1);
      expect(result[0].projectName).toBe("my-project");
    });

    it("returns empty array when no projects exist", async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const result = await listProjects(userId);
      expect(result).toEqual([]);
    });
  });

  describe("deleteProjectSnapshots", () => {
    it("queries all snapshot keys and batch deletes them", async () => {
      const keys = Array.from({ length: 3 }, (_, i) => ({
        PK: `USER#${userId}`,
        SK: `SNAPSHOT#${projectId}#2024-01-${15 - i}T10:30:00.000Z`,
      }));

      ddbMock.on(QueryCommand).resolves({ Items: keys });
      ddbMock.on(BatchWriteCommand).resolves({});

      const count = await deleteProjectSnapshots(userId, projectId);

      expect(count).toBe(3);
      const batchCalls = ddbMock.commandCalls(BatchWriteCommand);
      expect(batchCalls).toHaveLength(1);
    });

    it("returns 0 when no snapshots exist", async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const count = await deleteProjectSnapshots(userId, projectId);
      expect(count).toBe(0);
    });
  });

  describe("putProjectRecord", () => {
    it("stores project record with correct PK and SK", async () => {
      ddbMock.on(PutCommand).resolves({});

      await putProjectRecord(userId, mockProjectRecord);

      const calls = ddbMock.commandCalls(PutCommand);
      expect(calls).toHaveLength(1);
      const input = calls[0].args[0].input;
      expect(input.Item?.PK).toBe(`USER#${userId}`);
      expect(input.Item?.SK).toBe(`PROJECT#${projectId}`);
      expect(input.Item?.projectName).toBe("my-project");
      expect(input.Item?.snapshotCount).toBe(3);
    });
  });

  describe("deleteProjectRecord", () => {
    it("deletes with correct PK and SK", async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await deleteProjectRecord(userId, projectId);

      const calls = ddbMock.commandCalls(DeleteCommand);
      expect(calls).toHaveLength(1);
      const input = calls[0].args[0].input;
      expect(input.Key?.PK).toBe(`USER#${userId}`);
      expect(input.Key?.SK).toBe(`PROJECT#${projectId}`);
    });
  });
});
