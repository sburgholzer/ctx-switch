import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { sdkStreamMixin } from "@smithy/util-stream";
import { Readable } from "stream";
import type { Snapshot } from "@ctx-switch/shared";

const s3Mock = mockClient(S3Client);

const { putPayload, getPayload, deletePayloads } = await import("./archive-repo.js");

describe("archive-repo", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  const userId = "user-123";
  const projectId = "abc123def456";
  const timestamp = "2024-01-15T10:30:00.000Z";

  const mockSnapshot: Snapshot = {
    projectId,
    projectName: "my-project",
    timestamp,
    source: "manual",
    git: {
      branch: "main",
      lastCommits: ["fix: resolve bug"],
      uncommittedDiff: "diff --git a/file.ts",
      modifiedFiles: ["file.ts"],
    },
    note: "Working on bug fix",
  };

  describe("putPayload", () => {
    it("stores snapshot JSON at the correct key", async () => {
      s3Mock.on(PutObjectCommand).resolves({});

      const key = await putPayload(userId, projectId, timestamp, mockSnapshot);

      expect(key).toBe(`${userId}/${projectId}/${timestamp}.json`);
      const calls = s3Mock.commandCalls(PutObjectCommand);
      expect(calls).toHaveLength(1);
      const input = calls[0].args[0].input;
      expect(input.Bucket).toBe("ctx-switch-snapshot-archive");
      expect(input.Key).toBe(`${userId}/${projectId}/${timestamp}.json`);
      expect(input.ContentType).toBe("application/json");
      expect(JSON.parse(input.Body as string)).toEqual(mockSnapshot);
    });

    it("returns the S3 key in the format {userId}/{projectId}/{timestamp}.json", async () => {
      s3Mock.on(PutObjectCommand).resolves({});

      const key = await putPayload("user-abc", "proj-xyz", "2024-06-01T12:00:00.000Z", mockSnapshot);

      expect(key).toBe("user-abc/proj-xyz/2024-06-01T12:00:00.000Z.json");
    });
  });

  describe("getPayload", () => {
    it("retrieves and parses snapshot JSON from S3", async () => {
      const stream = new Readable();
      stream.push(JSON.stringify(mockSnapshot));
      stream.push(null);
      const sdkStream = sdkStreamMixin(stream);

      s3Mock.on(GetObjectCommand).resolves({
        Body: sdkStream as any,
      });

      const key = `${userId}/${projectId}/${timestamp}.json`;
      const result = await getPayload(key);

      expect(result).toEqual(mockSnapshot);
      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls).toHaveLength(1);
      const input = calls[0].args[0].input;
      expect(input.Bucket).toBe("ctx-switch-snapshot-archive");
      expect(input.Key).toBe(key);
    });
  });

  describe("deletePayloads", () => {
    it("lists and deletes all objects with the project prefix", async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: `${userId}/${projectId}/2024-01-01T00:00:00.000Z.json` },
          { Key: `${userId}/${projectId}/2024-01-02T00:00:00.000Z.json` },
          { Key: `${userId}/${projectId}/2024-01-03T00:00:00.000Z.json` },
        ],
        IsTruncated: false,
      });
      s3Mock.on(DeleteObjectsCommand).resolves({});

      const count = await deletePayloads(userId, projectId);

      expect(count).toBe(3);

      const listCalls = s3Mock.commandCalls(ListObjectsV2Command);
      expect(listCalls).toHaveLength(1);
      expect(listCalls[0].args[0].input.Prefix).toBe(`${userId}/${projectId}/`);

      const deleteCalls = s3Mock.commandCalls(DeleteObjectsCommand);
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0].args[0].input.Delete?.Objects).toHaveLength(3);
    });

    it("handles paginated results", async () => {
      s3Mock
        .on(ListObjectsV2Command)
        .resolvesOnce({
          Contents: [
            { Key: `${userId}/${projectId}/2024-01-01T00:00:00.000Z.json` },
          ],
          IsTruncated: true,
          NextContinuationToken: "token-1",
        })
        .resolvesOnce({
          Contents: [
            { Key: `${userId}/${projectId}/2024-01-02T00:00:00.000Z.json` },
          ],
          IsTruncated: false,
        });
      s3Mock.on(DeleteObjectsCommand).resolves({});

      const count = await deletePayloads(userId, projectId);

      expect(count).toBe(2);
      const listCalls = s3Mock.commandCalls(ListObjectsV2Command);
      expect(listCalls).toHaveLength(2);
      expect(listCalls[1].args[0].input.ContinuationToken).toBe("token-1");
      const deleteCalls = s3Mock.commandCalls(DeleteObjectsCommand);
      expect(deleteCalls).toHaveLength(2);
    });

    it("returns 0 when no objects exist for the prefix", async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [],
        IsTruncated: false,
      });

      const count = await deletePayloads(userId, projectId);

      expect(count).toBe(0);
      const deleteCalls = s3Mock.commandCalls(DeleteObjectsCommand);
      expect(deleteCalls).toHaveLength(0);
    });
  });
});
