import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ApiClient, ApiError } from "./client";

describe("ApiClient", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends x-api-key header with requests", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ projects: [] }),
    });

    const client = new ApiClient("my-api-key", "https://api.example.com/v1");
    await client.getProjects();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/v1/projects",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "my-api-key",
        }),
      })
    );
  });

  it("throws ApiError with 401 for unauthorized responses", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve(""),
    });

    const client = new ApiClient("bad-key", "https://api.example.com/v1");
    await expect(client.getProjects()).rejects.toThrow(ApiError);
    await expect(client.getProjects()).rejects.toMatchObject({ status: 401 });
  });

  it("encodes project ID in URL for snapshot endpoints", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ briefing: "test" }),
    });

    const client = new ApiClient("key", "https://api.example.com/v1");
    await client.getLatestSnapshot("project/with special");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/v1/snapshots/project%2Fwith%20special/latest",
      expect.any(Object)
    );
  });

  it("getSnapshotHistory calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ snapshots: [] }),
    });

    const client = new ApiClient("key", "https://api.example.com/v1");
    await client.getSnapshotHistory("my-project");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/v1/snapshots/my-project/history",
      expect.any(Object)
    );
  });
});
