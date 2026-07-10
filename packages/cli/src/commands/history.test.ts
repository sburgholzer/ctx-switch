import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { historyCommand } from "./history.js";
import type { ApiClient } from "../api-client.js";

describe("historyCommand", () => {
  let mockApiClient: ApiClient;
  let consoleLogs: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    consoleLogs = [];
    consoleErrors = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      consoleLogs.push(msg);
    });
    vi.spyOn(console, "error").mockImplementation((msg: string) => {
      consoleErrors.push(msg);
    });

    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("displays snapshots with timestamp and truncated summary", async () => {
    const snapshots = [
      {
        timestamp: "2024-03-15T14:30:00.000Z",
        summary: "Working on user authentication flow",
      },
      {
        timestamp: "2024-03-14T09:00:00.000Z",
        summary: "Refactoring database layer",
      },
    ];

    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ snapshots }), { status: 200 })
    );

    await historyCommand("my-app", mockApiClient);

    expect(consoleLogs).toHaveLength(2);
    expect(consoleLogs[0]).toContain("Working on user authentication flow");
    expect(consoleLogs[1]).toContain("Refactoring database layer");
  });

  it("displays not-found message for 404 response", async () => {
    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ message: "Not found" }), { status: 404 })
    );

    await historyCommand("ghost-project", mockApiClient);

    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toBe(
      "No context has been captured for project 'ghost-project'"
    );
  });

  it("displays not-found message when snapshots array is empty", async () => {
    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ snapshots: [] }), { status: 200 })
    );

    await historyCommand("empty-project", mockApiClient);

    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toBe(
      "No context has been captured for project 'empty-project'"
    );
  });

  it("displays error message on API failure", async () => {
    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ message: "Internal server error" }), { status: 500 })
    );

    await historyCommand("my-app", mockApiClient);

    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toBe("Internal server error");
  });

  it("handles network errors gracefully", async () => {
    (mockApiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error")
    );

    await historyCommand("my-app", mockApiClient);

    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toBe("Error: Network error");
  });

  it("truncates long summaries to 80 characters", async () => {
    const longSummary = "B".repeat(100);
    const snapshots = [
      {
        timestamp: "2024-01-01T00:00:00.000Z",
        summary: longSummary,
      },
    ];

    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ snapshots }), { status: 200 })
    );

    await historyCommand("my-app", mockApiClient);

    expect(consoleLogs).toHaveLength(1);
    // Should not contain the full 100-char summary
    expect(consoleLogs[0]).not.toContain(longSummary);
  });

  it("calls GET /snapshots/{project}/history with correct path", async () => {
    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ snapshots: [] }), { status: 200 })
    );

    await historyCommand("my-app", mockApiClient);

    expect(mockApiClient.get).toHaveBeenCalledWith("/snapshots/my-app/history");
  });

  it("displays generic error when response has no message field", async () => {
    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("{}", { status: 500 })
    );

    await historyCommand("my-app", mockApiClient);

    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toBe("Failed to fetch history");
  });
});
