import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listCommand } from "./list.js";
import type { ApiClient } from "../api-client.js";

describe("listCommand", () => {
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

  it("displays projects with name, timestamp, and truncated summary", async () => {
    const projects = [
      {
        projectName: "my-app",
        lastParkTimestamp: "2024-03-15T14:30:00.000Z",
        summary: "Working on user authentication flow",
      },
      {
        projectName: "api-service",
        lastParkTimestamp: "2024-03-14T09:00:00.000Z",
        summary: "Refactoring database layer",
      },
    ];

    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ projects }), { status: 200 })
    );

    await listCommand(mockApiClient);

    expect(consoleLogs).toHaveLength(2);
    expect(consoleLogs[0]).toContain("my-app");
    expect(consoleLogs[0]).toContain("Working on user authentication flow");
    expect(consoleLogs[1]).toContain("api-service");
    expect(consoleLogs[1]).toContain("Refactoring database layer");
  });

  it("displays empty state message when no projects exist", async () => {
    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ projects: [] }), { status: 200 })
    );

    await listCommand(mockApiClient);

    expect(consoleLogs).toHaveLength(1);
    expect(consoleLogs[0]).toBe("No projects have been captured");
  });

  it("displays error message on API failure", async () => {
    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ message: "Internal server error" }), { status: 500 })
    );

    await listCommand(mockApiClient);

    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toBe("Internal server error");
  });

  it("displays generic error message when response has no message field", async () => {
    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("{}", { status: 500 })
    );

    await listCommand(mockApiClient);

    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toBe("Failed to fetch projects");
  });

  it("handles network errors gracefully", async () => {
    (mockApiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error")
    );

    await listCommand(mockApiClient);

    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toBe("Error: Network error");
  });

  it("truncates long summaries to 80 characters", async () => {
    const longSummary = "A".repeat(100);
    const projects = [
      {
        projectName: "project",
        lastParkTimestamp: "2024-01-01T00:00:00.000Z",
        summary: longSummary,
      },
    ];

    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ projects }), { status: 200 })
    );

    await listCommand(mockApiClient);

    expect(consoleLogs).toHaveLength(1);
    // The row should not contain the full 100-char summary
    expect(consoleLogs[0]).not.toContain(longSummary);
  });

  it("calls GET /projects endpoint", async () => {
    (mockApiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ projects: [] }), { status: 200 })
    );

    await listCommand(mockApiClient);

    expect(mockApiClient.get).toHaveBeenCalledWith("/projects");
  });
});
