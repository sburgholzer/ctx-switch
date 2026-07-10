import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayAuthorizerEvent } from "./authorizer.js";

// Mock the DynamoDB client module
vi.mock("../data/dynamo-client.js", () => ({
  docClient: {
    send: vi.fn(),
  },
  TABLE_NAME: "ctx-switch-context-store",
}));

import { handler, extractApiKey, apiKeyPK } from "./authorizer.js";
import { docClient } from "../data/dynamo-client.js";

describe("authorizer handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const methodArn =
    "arn:aws:execute-api:us-east-1:123456789:abc123/prod/GET/snapshots";

  function createEvent(
    headers?: Record<string, string | undefined>
  ): APIGatewayAuthorizerEvent {
    return {
      type: "REQUEST",
      methodArn,
      headers: headers ?? {},
    };
  }

  describe("extractApiKey", () => {
    it("extracts key from lowercase x-api-key header", () => {
      const headers = { "x-api-key": "ctx-abc123" };
      expect(extractApiKey(headers)).toBe("ctx-abc123");
    });

    it("extracts key from mixed-case X-Api-Key header", () => {
      const headers = { "X-Api-Key": "ctx-def456" };
      expect(extractApiKey(headers)).toBe("ctx-def456");
    });

    it("extracts key from uppercase X-API-KEY header", () => {
      const headers = { "X-API-KEY": "ctx-ghi789" };
      expect(extractApiKey(headers)).toBe("ctx-ghi789");
    });

    it("returns undefined when headers object is undefined", () => {
      expect(extractApiKey(undefined)).toBeUndefined();
    });

    it("returns undefined when x-api-key header is not present", () => {
      const headers = { "content-type": "application/json" };
      expect(extractApiKey(headers)).toBeUndefined();
    });

    it("returns undefined when x-api-key header value is empty string", () => {
      const headers = { "x-api-key": "" };
      expect(extractApiKey(headers)).toBeUndefined();
    });

    it("returns undefined when x-api-key header value is undefined", () => {
      const headers = { "x-api-key": undefined };
      expect(extractApiKey(headers)).toBeUndefined();
    });
  });

  describe("apiKeyPK", () => {
    it("constructs PK with APIKEY# prefix", () => {
      expect(apiKeyPK("ctx-abc123")).toBe("APIKEY#ctx-abc123");
    });
  });

  describe("missing API key", () => {
    it("returns Deny policy when no headers are provided", async () => {
      const event = createEvent(undefined);
      const result = await handler(event);

      expect(result.principalId).toBe("anonymous");
      expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
      expect(result.policyDocument.Statement[0].Resource).toBe(methodArn);
      expect(result.context).toBeUndefined();
    });

    it("returns Deny policy when x-api-key header is missing", async () => {
      const event = createEvent({ "content-type": "application/json" });
      const result = await handler(event);

      expect(result.principalId).toBe("anonymous");
      expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
    });

    it("returns Deny policy when x-api-key header is empty", async () => {
      const event = createEvent({ "x-api-key": "" });
      const result = await handler(event);

      expect(result.principalId).toBe("anonymous");
      expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
    });
  });

  describe("invalid API key (not found in DynamoDB)", () => {
    it("returns Deny policy when key is not found", async () => {
      vi.mocked(docClient.send).mockResolvedValueOnce({ Item: undefined } as never);

      const event = createEvent({ "x-api-key": "ctx-nonexistent" });
      const result = await handler(event);

      expect(result.principalId).toBe("anonymous");
      expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
      expect(result.policyDocument.Statement[0].Resource).toBe(methodArn);
      expect(result.context).toBeUndefined();
    });

    it("queries DynamoDB with correct key structure", async () => {
      vi.mocked(docClient.send).mockResolvedValueOnce({ Item: undefined } as never);

      const event = createEvent({ "x-api-key": "ctx-testkey" });
      await handler(event);

      expect(docClient.send).toHaveBeenCalledTimes(1);
      const call = vi.mocked(docClient.send).mock.calls[0][0];
      expect(call.input).toEqual({
        TableName: "ctx-switch-context-store",
        Key: {
          PK: "APIKEY#ctx-testkey",
          SK: "APIKEY#ctx-testkey",
        },
      });
    });
  });

  describe("revoked API key", () => {
    it("returns Deny policy when key status is revoked", async () => {
      vi.mocked(docClient.send).mockResolvedValueOnce({
        Item: {
          PK: "APIKEY#ctx-revoked",
          SK: "APIKEY#ctx-revoked",
          userId: "user-456",
          status: "revoked",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      } as never);

      const event = createEvent({ "x-api-key": "ctx-revoked" });
      const result = await handler(event);

      expect(result.principalId).toBe("user-456");
      expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
      expect(result.policyDocument.Statement[0].Resource).toBe(methodArn);
      expect(result.context).toBeUndefined();
    });
  });

  describe("valid active API key", () => {
    it("returns Allow policy with userId in context", async () => {
      vi.mocked(docClient.send).mockResolvedValueOnce({
        Item: {
          PK: "APIKEY#ctx-valid123",
          SK: "APIKEY#ctx-valid123",
          userId: "user-789",
          status: "active",
          createdAt: "2024-01-15T10:00:00.000Z",
        },
      } as never);

      const event = createEvent({ "x-api-key": "ctx-valid123" });
      const result = await handler(event);

      expect(result.principalId).toBe("user-789");
      expect(result.policyDocument.Statement[0].Effect).toBe("Allow");
      expect(result.policyDocument.Statement[0].Action).toBe(
        "execute-api:Invoke"
      );
      expect(result.policyDocument.Statement[0].Resource).toBe(methodArn);
      expect(result.context).toEqual({ userId: "user-789" });
    });

    it("handles case-insensitive header lookup (X-Api-Key)", async () => {
      vi.mocked(docClient.send).mockResolvedValueOnce({
        Item: {
          PK: "APIKEY#ctx-mixedcase",
          SK: "APIKEY#ctx-mixedcase",
          userId: "user-mixed",
          status: "active",
          createdAt: "2024-02-01T00:00:00.000Z",
        },
      } as never);

      const event = createEvent({ "X-Api-Key": "ctx-mixedcase" });
      const result = await handler(event);

      expect(result.principalId).toBe("user-mixed");
      expect(result.policyDocument.Statement[0].Effect).toBe("Allow");
      expect(result.context).toEqual({ userId: "user-mixed" });
    });
  });

  describe("DynamoDB errors", () => {
    it("returns Deny policy when DynamoDB throws an error", async () => {
      vi.mocked(docClient.send).mockRejectedValueOnce(
        new Error("DynamoDB connection failed")
      );

      const event = createEvent({ "x-api-key": "ctx-valid123" });
      const result = await handler(event);

      expect(result.principalId).toBe("anonymous");
      expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
      expect(result.context).toBeUndefined();
    });

    it("returns Deny policy on network timeout", async () => {
      vi.mocked(docClient.send).mockRejectedValueOnce(
        new Error("Socket timeout")
      );

      const event = createEvent({ "x-api-key": "ctx-timeout" });
      const result = await handler(event);

      expect(result.principalId).toBe("anonymous");
      expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
    });
  });

  describe("policy document structure", () => {
    it("includes correct Version field", async () => {
      const event = createEvent({});
      const result = await handler(event);

      expect(result.policyDocument.Version).toBe("2012-10-17");
    });

    it("includes exactly one Statement", async () => {
      vi.mocked(docClient.send).mockResolvedValueOnce({
        Item: {
          PK: "APIKEY#ctx-key",
          SK: "APIKEY#ctx-key",
          userId: "user-1",
          status: "active",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      } as never);

      const event = createEvent({ "x-api-key": "ctx-key" });
      const result = await handler(event);

      expect(result.policyDocument.Statement).toHaveLength(1);
    });

    it("uses event.methodArn as the resource in the policy", async () => {
      const customArn =
        "arn:aws:execute-api:us-west-2:999999:xyz/stage/POST/projects";
      const event: APIGatewayAuthorizerEvent = {
        type: "REQUEST",
        methodArn: customArn,
        headers: {},
      };

      const result = await handler(event);

      expect(result.policyDocument.Statement[0].Resource).toBe(customArn);
    });
  });
});
