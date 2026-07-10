import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApiClient } from "./api-client.js";
import type { Config } from "./config.js";

describe("api-client", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const testConfig: Config = {
    apiKey: "ctx-testapikey123",
    apiEndpoint: "https://api.example.com/v1",
    autoCapture: {
      enabled: false,
      schedule: "0 17 * * MON-FRI",
      projects: [],
    },
  };

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("createApiClient", () => {
    it("creates a client with get, post, and delete methods", () => {
      const client = createApiClient(testConfig);
      expect(client.get).toBeDefined();
      expect(client.post).toBeDefined();
      expect(client.delete).toBeDefined();
    });
  });

  describe("get", () => {
    it("sends GET request with correct URL and x-api-key header", async () => {
      const client = createApiClient(testConfig);
      await client.get("/projects");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/v1/projects",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "x-api-key": "ctx-testapikey123",
          }),
        })
      );
    });

    it("returns the fetch Response object", async () => {
      const responseBody = { projects: [] };
      mockFetch.mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 200 }));

      const client = createApiClient(testConfig);
      const response = await client.get("/projects");

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual(responseBody);
    });
  });

  describe("post", () => {
    it("sends POST request with JSON body and x-api-key header", async () => {
      const client = createApiClient(testConfig);
      const body = { projectId: "test-project", git: { branch: "main" } };
      await client.post("/snapshots", body);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/v1/snapshots",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-api-key": "ctx-testapikey123",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(body),
        })
      );
    });

    it("serializes the body as JSON", async () => {
      const client = createApiClient(testConfig);
      const payload = { note: "test note", data: [1, 2, 3] };
      await client.post("/snapshots", payload);

      const call = mockFetch.mock.calls[0];
      expect(call[1].body).toBe(JSON.stringify(payload));
    });
  });

  describe("delete", () => {
    it("sends DELETE request with correct URL and x-api-key header", async () => {
      const client = createApiClient(testConfig);
      await client.delete("/projects/my-project");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/v1/projects/my-project",
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            "x-api-key": "ctx-testapikey123",
          }),
        })
      );
    });
  });

  describe("URL handling", () => {
    it("strips trailing slash from apiEndpoint before appending path", async () => {
      const configWithTrailingSlash: Config = {
        ...testConfig,
        apiEndpoint: "https://api.example.com/v1/",
      };

      const client = createApiClient(configWithTrailingSlash);
      await client.get("/projects");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/v1/projects",
        expect.anything()
      );
    });
  });
});
