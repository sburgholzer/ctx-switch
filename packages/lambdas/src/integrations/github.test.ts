/**
 * Unit tests for the GitHub data fetching module.
 *
 * Tests mock global fetch to simulate various GitHub API responses
 * including success, errors, rate limiting, timeouts, and server errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchGitHubData } from "./github.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockFetch(impl: typeof globalThis.fetch) {
  return vi.stubGlobal("fetch", vi.fn(impl));
}

function createPRResponse(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    title: `PR #${i + 1}`,
    html_url: `https://github.com/owner/repo/pull/${i + 1}`,
    state: "open",
  }));
}

function createCommentResponse(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    body: `Comment ${i + 1}`,
    path: `src/file${i}.ts`,
    line: i + 10,
    original_line: i + 10,
    pull_request_url: `https://api.github.com/repos/owner/repo/pulls/${(i % 5) + 1}`,
  }));
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("fetchGitHubData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("fetches PRs and comments successfully", async () => {
    const prs = createPRResponse(3);
    const comments = createCommentResponse(5);

    mockFetch(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/pulls?")) return jsonResponse(prs);
      if (urlStr.includes("/pulls/comments")) return jsonResponse(comments);
      return jsonResponse({}, 404);
    });

    const result = await fetchGitHubData("ghp_token", "owner", "repo");

    expect(result.pullRequests).toHaveLength(3);
    expect(result.pullRequests[0]).toEqual({
      number: 1,
      title: "PR #1",
      url: "https://github.com/owner/repo/pull/1",
      state: "open",
    });

    expect(result.unresolvedComments).toHaveLength(5);
    expect(result.unresolvedComments[0]).toEqual({
      prNumber: 1,
      body: "Comment 1",
      path: "src/file0.ts",
      line: 10,
      status: "open",
    });
  });

  it("limits pull requests to 20", async () => {
    const prs = createPRResponse(30);
    const comments = createCommentResponse(5);

    mockFetch(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/pulls?")) return jsonResponse(prs);
      if (urlStr.includes("/pulls/comments")) return jsonResponse(comments);
      return jsonResponse({}, 404);
    });

    const result = await fetchGitHubData("ghp_token", "owner", "repo");

    expect(result.pullRequests).toHaveLength(20);
  });

  it("limits review comments to 50", async () => {
    const prs = createPRResponse(5);
    const comments = createCommentResponse(60);

    mockFetch(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/pulls?")) return jsonResponse(prs);
      if (urlStr.includes("/pulls/comments")) return jsonResponse(comments);
      return jsonResponse({}, 404);
    });

    const result = await fetchGitHubData("ghp_token", "owner", "repo");

    expect(result.unresolvedComments).toHaveLength(50);
  });

  it("returns empty result on authentication failure (401)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFetch(async () => jsonResponse({ message: "Bad credentials" }, 401));

    const result = await fetchGitHubData("bad_token", "owner", "repo");

    expect(result).toEqual({ pullRequests: [], unresolvedComments: [] });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[GitHub Integration] Failed to fetch data")
    );
  });

  it("returns empty result on rate limit (403)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFetch(async () => jsonResponse({ message: "rate limit exceeded" }, 403));

    const result = await fetchGitHubData("ghp_token", "owner", "repo");

    expect(result).toEqual({ pullRequests: [], unresolvedComments: [] });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("403")
    );
  });

  it("returns empty result on server error (500)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFetch(async () => jsonResponse({ message: "Internal Server Error" }, 500));

    const result = await fetchGitHubData("ghp_token", "owner", "repo");

    expect(result).toEqual({ pullRequests: [], unresolvedComments: [] });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("500")
    );
  });

  it("returns empty result on network error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFetch(async () => {
      throw new Error("Network request failed");
    });

    const result = await fetchGitHubData("ghp_token", "owner", "repo");

    expect(result).toEqual({ pullRequests: [], unresolvedComments: [] });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Network request failed")
    );
  });

  it("returns empty result on timeout (abort)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFetch(async (_url: RequestInfo | URL, init?: RequestInit) => {
      // Simulate a request that never resolves until aborted
      return new Promise<Response>((_resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }
        // Advance the timer to trigger the abort
        vi.advanceTimersByTime(10_000);
      });
    });

    const result = await fetchGitHubData("ghp_token", "owner", "repo");

    expect(result).toEqual({ pullRequests: [], unresolvedComments: [] });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[GitHub Integration] Failed to fetch data")
    );
  });

  it("sends correct authorization header", async () => {
    const fetchSpy = vi.fn(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/pulls?")) return jsonResponse([]);
      if (urlStr.includes("/pulls/comments")) return jsonResponse([]);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchSpy);

    await fetchGitHubData("ghp_mytoken123", "myowner", "myrepo");

    expect(fetchSpy).toHaveBeenCalled();
    const firstCall = fetchSpy.mock.calls[0];
    const options = firstCall[1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ghp_mytoken123");
    expect(headers.Accept).toBe("application/vnd.github+json");
  });

  it("constructs correct API URLs", async () => {
    const fetchSpy = vi.fn(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/pulls?")) return jsonResponse([]);
      if (urlStr.includes("/pulls/comments")) return jsonResponse([]);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchSpy);

    await fetchGitHubData("ghp_token", "my-org", "my-repo");

    const urls = fetchSpy.mock.calls.map((call) => call[0].toString());
    expect(urls.some((u) => u.includes("/repos/my-org/my-repo/pulls?state=open&per_page=20"))).toBe(true);
    expect(urls.some((u) => u.includes("/repos/my-org/my-repo/pulls/comments?per_page=50"))).toBe(true);
  });

  it("handles comment with null line falling back to original_line", async () => {
    const comments = [
      {
        body: "Fix this",
        path: "src/main.ts",
        line: null,
        original_line: 42,
        pull_request_url: "https://api.github.com/repos/owner/repo/pulls/7",
      },
    ];

    mockFetch(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/pulls?")) return jsonResponse([]);
      if (urlStr.includes("/pulls/comments")) return jsonResponse(comments);
      return jsonResponse({}, 404);
    });

    const result = await fetchGitHubData("ghp_token", "owner", "repo");

    expect(result.unresolvedComments[0].line).toBe(42);
    expect(result.unresolvedComments[0].prNumber).toBe(7);
  });

  it("handles comment with both null line and null original_line", async () => {
    const comments = [
      {
        body: "General comment",
        path: "README.md",
        line: null,
        original_line: null,
        pull_request_url: "https://api.github.com/repos/owner/repo/pulls/3",
      },
    ];

    mockFetch(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/pulls?")) return jsonResponse([]);
      if (urlStr.includes("/pulls/comments")) return jsonResponse(comments);
      return jsonResponse({}, 404);
    });

    const result = await fetchGitHubData("ghp_token", "owner", "repo");

    expect(result.unresolvedComments[0].line).toBe(0);
  });

  it("returns partial data when only one request fails", async () => {
    // If Promise.all fails, both results are lost — this tests the graceful degradation
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFetch(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/pulls?")) return jsonResponse(createPRResponse(3));
      if (urlStr.includes("/pulls/comments")) return jsonResponse({}, 500);
      return jsonResponse({}, 404);
    });

    const result = await fetchGitHubData("ghp_token", "owner", "repo");

    // Because Promise.all rejects on any failure, both are lost
    expect(result).toEqual({ pullRequests: [], unresolvedComments: [] });
    expect(consoleSpy).toHaveBeenCalled();
  });
});
