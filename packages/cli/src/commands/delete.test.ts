import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deleteCommand } from "./delete.js";
import type { ApiClient } from "../api-client.js";

describe("deleteCommand", () => {
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

  it("displays success message when deletion is confirmed and succeeds", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(true);
    (mockApiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({ projectName: "my-app", snapshotsRemoved: 5 }),
        { status: 200 }
      )
    );

    await deleteCommand("my-app", mockApiClient, mockConfirm);

    expect(mockConfirm).toHaveBeenCalledWith("my-app");
    expect(consoleLogs).toHaveLength(1);
    expect(consoleLogs[0]).toBe("Deleted project 'my-app' (5 snapshots removed)");
  });

  it("displays cancellation message when user declines", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(false);

    await deleteCommand("my-app", mockApiClient, mockConfirm);

    expect(consoleLogs).toHaveLength(1);
    expect(consoleLogs[0]).toBe("Operation cancelled. No data was removed.");
    expect(mockApiClient.delete).not.toHaveBeenCalled();
  });

  it("displays not-found error for non-existent project", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(true);
    (mockApiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ message: "Not found" }), { status: 404 })
    );

    await deleteCommand("ghost-project", mockApiClient, mockConfirm);

    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toBe("Project 'ghost-project' not found");
  });

  it("displays error message on API failure", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(true);
    (mockApiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ message: "Server error" }), { status: 500 })
    );

    await deleteCommand("my-app", mockApiClient, mockConfirm);

    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toBe("Server error");
  });

  it("handles network errors gracefully", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(true);
    (mockApiClient.delete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Connection refused")
    );

    await deleteCommand("my-app", mockApiClient, mockConfirm);

    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toBe("Error: Connection refused");
  });

  it("calls DELETE /projects/{project} with correct project name", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(true);
    (mockApiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({ projectName: "my-app", snapshotsRemoved: 3 }),
        { status: 200 }
      )
    );

    await deleteCommand("my-app", mockApiClient, mockConfirm);

    expect(mockApiClient.delete).toHaveBeenCalledWith("/projects/my-app");
  });

  it("displays generic error when response has no message field", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(true);
    (mockApiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("{}", { status: 500 })
    );

    await deleteCommand("my-app", mockApiClient, mockConfirm);

    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toBe("Failed to delete project");
  });
});
