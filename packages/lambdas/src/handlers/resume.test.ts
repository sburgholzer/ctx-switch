import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Snapshot } from "@ctx-switch/shared";
import type { APIGatewayProxyEvent } from "./resume.js";

// Mock the data layer modules
vi.mock("../data/snapshot-repo.js", () => ({
  getLatestSnapshot: vi.fn(),
}));

vi.mock("../data/archive-repo.js", () => ({
  getPayload: vi.fn(),
}));

// Mock the Bedrock runtime client
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  InvokeModelCommand: vi.fn().mockImplementation((input) => input),
}));

import { handler, invokeBedrock } from "./resume.js";
import { getLatestSnapshot } from "../data/snapshot-repo.js";
import { getPayload } from "../data/archive-repo.js";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

describe("resume handler", () => {
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

  const mockBriefing = `## Last Session Summary
You were working on the authentication flow in the feature/auth branch.

## Key Changes
- Fixed a login bug in src/auth.ts
- Added auth module

## Open Items
- Working on authentication flow

## Suggested Next Steps
1. Complete the login implementation
2. Add unit tests for the auth module`;

  function createEvent(
    projectId = "abc123def456",
    userId = "user-123"
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

  describe("successful resume with briefing", () => {
    beforeEach(() => {
      vi.mocked(getLatestSnapshot).mockResolvedValue(baseSnapshot);

      // Mock Bedrock client send to return a valid response
      const mockSend = vi.fn().mockResolvedValue({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: mockBriefing }],
          })
        ),
      });
      vi.mocked(BedrockRuntimeClient).mockImplementation(
        () => ({ send: mockSend }) as unknown as InstanceType<typeof BedrockRuntimeClient>
      );
    });

    it("returns 200 with briefing when Bedrock succeeds", async () => {
      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.briefing).toBe(mockBriefing);
      expect(body.fallback).toBe(false);
      expect(body.projectId).toBe("abc123def456");
      expect(body.projectName).toBe("my-project");
    });

    it("calls getLatestSnapshot with userId and projectId", async () => {
      const event = createEvent();
      await handler(event);

      expect(getLatestSnapshot).toHaveBeenCalledWith("user-123", "abc123def456");
    });
  });

  describe("overflow handling", () => {
    it("fetches full payload from S3 when snapshot has payloadRef", async () => {
      const snapshotWithRef = {
        ...baseSnapshot,
        git: { branch: "feature/auth", lastCommits: [], uncommittedDiff: "", modifiedFiles: [] },
        payloadRef: "user-123/abc123def456/2024-01-15T10:30:00.000Z.json",
      };
      vi.mocked(getLatestSnapshot).mockResolvedValue(snapshotWithRef as unknown as Snapshot);
      vi.mocked(getPayload).mockResolvedValue(baseSnapshot);

      const mockSend = vi.fn().mockResolvedValue({
        body: new TextEncoder().encode(
          JSON.stringify({ content: [{ text: mockBriefing }] })
        ),
      });
      vi.mocked(BedrockRuntimeClient).mockImplementation(
        () => ({ send: mockSend }) as unknown as InstanceType<typeof BedrockRuntimeClient>
      );

      const event = createEvent();
      await handler(event);

      expect(getPayload).toHaveBeenCalledWith(
        "user-123/abc123def456/2024-01-15T10:30:00.000Z.json"
      );
    });

    it("does not fetch from S3 when no payloadRef exists", async () => {
      vi.mocked(getLatestSnapshot).mockResolvedValue(baseSnapshot);

      const mockSend = vi.fn().mockResolvedValue({
        body: new TextEncoder().encode(
          JSON.stringify({ content: [{ text: mockBriefing }] })
        ),
      });
      vi.mocked(BedrockRuntimeClient).mockImplementation(
        () => ({ send: mockSend }) as unknown as InstanceType<typeof BedrockRuntimeClient>
      );

      const event = createEvent();
      await handler(event);

      expect(getPayload).not.toHaveBeenCalled();
    });
  });

  describe("Bedrock fallback", () => {
    it("returns 200 with raw snapshot and fallback=true on Bedrock error", async () => {
      vi.mocked(getLatestSnapshot).mockResolvedValue(baseSnapshot);

      const mockSend = vi.fn().mockRejectedValue(new Error("Model not available"));
      vi.mocked(BedrockRuntimeClient).mockImplementation(
        () => ({ send: mockSend }) as unknown as InstanceType<typeof BedrockRuntimeClient>
      );

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.fallback).toBe(true);
      expect(body.snapshot).toEqual(baseSnapshot);
      expect(body.fallbackReason).toBe("Model not available");
    });

    it("returns 200 with raw snapshot on Bedrock timeout (abort)", async () => {
      vi.mocked(getLatestSnapshot).mockResolvedValue(baseSnapshot);

      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      const mockSend = vi.fn().mockRejectedValue(abortError);
      vi.mocked(BedrockRuntimeClient).mockImplementation(
        () => ({ send: mockSend }) as unknown as InstanceType<typeof BedrockRuntimeClient>
      );

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.fallback).toBe(true);
      expect(body.snapshot).toEqual(baseSnapshot);
    });
  });

  describe("not found", () => {
    it("returns 404 when no snapshot exists for the project", async () => {
      vi.mocked(getLatestSnapshot).mockResolvedValue(undefined);

      const event = createEvent("nonexistent-project");
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe(
        "No context has been captured for project 'nonexistent-project'"
      );
    });
  });

  describe("error handling", () => {
    it("returns 401 when userId is missing from authorizer context", async () => {
      const event: APIGatewayProxyEvent = {
        body: null,
        pathParameters: { project: "abc123def456" },
        requestContext: { authorizer: {} },
        headers: {},
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toContain("Unauthorized");
    });

    it("returns 400 when project path parameter is missing", async () => {
      const event: APIGatewayProxyEvent = {
        body: null,
        pathParameters: null,
        requestContext: { authorizer: { userId: "user-123" } },
        headers: {},
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain("Project identifier is required");
    });

    it("returns 500 when getLatestSnapshot throws an unexpected error", async () => {
      vi.mocked(getLatestSnapshot).mockRejectedValue(
        new Error("DynamoDB connection failed")
      );

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("DynamoDB connection failed");
    });

    it("returns 500 when getPayload throws an unexpected error", async () => {
      const snapshotWithRef = {
        ...baseSnapshot,
        git: { branch: "feature/auth", lastCommits: [], uncommittedDiff: "", modifiedFiles: [] },
        payloadRef: "user-123/abc123def456/2024-01-15T10:30:00.000Z.json",
      };
      vi.mocked(getLatestSnapshot).mockResolvedValue(snapshotWithRef as unknown as Snapshot);
      vi.mocked(getPayload).mockRejectedValue(new Error("S3 read failed"));

      const event = createEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe("S3 read failed");
    });
  });

  describe("invokeBedrock", () => {
    it("sends correctly formatted request to Bedrock", async () => {
      const mockSend = vi.fn().mockResolvedValue({
        body: new TextEncoder().encode(
          JSON.stringify({ content: [{ text: "briefing text" }] })
        ),
      });
      const mockClient = { send: mockSend } as unknown as BedrockRuntimeClient;

      const result = await invokeBedrock(baseSnapshot, mockClient);

      expect(result).toBe("briefing text");
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("includes snapshot data in the user message", async () => {
      const mockSend = vi.fn().mockResolvedValue({
        body: new TextEncoder().encode(
          JSON.stringify({ content: [{ text: "briefing" }] })
        ),
      });
      const mockClient = { send: mockSend } as unknown as BedrockRuntimeClient;

      await invokeBedrock(baseSnapshot, mockClient);

      // The InvokeModelCommand is called with the body containing snapshot info
      const call = mockSend.mock.calls[0][0];
      const requestBody = JSON.parse(new TextDecoder().decode(call.body));
      const userMessage = requestBody.messages[0].content;

      expect(userMessage).toContain("my-project");
      expect(userMessage).toContain("feature/auth");
      expect(userMessage).toContain("fix: resolve login bug");
      expect(userMessage).toContain("Working on authentication flow");
    });

    it("includes system prompt with 4-section format", async () => {
      const mockSend = vi.fn().mockResolvedValue({
        body: new TextEncoder().encode(
          JSON.stringify({ content: [{ text: "briefing" }] })
        ),
      });
      const mockClient = { send: mockSend } as unknown as BedrockRuntimeClient;

      await invokeBedrock(baseSnapshot, mockClient);

      const call = mockSend.mock.calls[0][0];
      const requestBody = JSON.parse(new TextDecoder().decode(call.body));

      expect(requestBody.system).toContain("Last Session Summary");
      expect(requestBody.system).toContain("Key Changes");
      expect(requestBody.system).toContain("Open Items");
      expect(requestBody.system).toContain("Suggested Next Steps");
      expect(requestBody.system).toContain("500");
    });

    it("throws on Bedrock failure", async () => {
      const mockSend = vi.fn().mockRejectedValue(new Error("Bedrock unavailable"));
      const mockClient = { send: mockSend } as unknown as BedrockRuntimeClient;

      await expect(invokeBedrock(baseSnapshot, mockClient)).rejects.toThrow(
        "Bedrock unavailable"
      );
    });

    it("returns empty string when response has no content", async () => {
      const mockSend = vi.fn().mockResolvedValue({
        body: new TextEncoder().encode(
          JSON.stringify({ content: [] })
        ),
      });
      const mockClient = { send: mockSend } as unknown as BedrockRuntimeClient;

      const result = await invokeBedrock(baseSnapshot, mockClient);
      expect(result).toBe("");
    });
  });
});
