import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotGitRepoError } from "@ctx-switch/shared";
import type { GitState } from "@ctx-switch/shared";

// Mock dependencies
vi.mock("../git.js", () => ({
  collectGitState: vi.fn(),
  getRemoteOriginUrl: vi.fn(),
}));

vi.mock("../config.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../api-client.js", () => ({
  createApiClient: vi.fn(),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { collectGitState, getRemoteOriginUrl } from "../git.js";
import { loadConfig } from "../config.js";
import { createApiClient } from "../api-client.js";
import { readFileSync, existsSync } from "node:fs";
import { parkCommand, deriveProjectName, readTerminalHistory } from "./park.js";

const mockCollectGitState = vi.mocked(collectGitState);
const mockGetRemoteOriginUrl = vi.mocked(getRemoteOriginUrl);
const mockLoadConfig = vi.mocked(loadConfig);
const mockCreateApiClient = vi.mocked(createApiClient);
const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);

const mockPost = vi.fn();
const mockApiClient = {
  get: vi.fn(),
  post: mockPost,
  delete: vi.fn(),
};

const fakeConfig = {
  apiKey: "ctx-test-key",
  apiEndpoint: "https://api.example.com/v1",
  githubToken: undefined,
  defaultNote: "",
  autoCapture: { enabled: false, schedule: "", projects: [] },
};

const fakeGitState: GitState = {
  branch: "feature/auth",
  lastCommits: ["abc1234 fix: login bug", "def5678 feat: add auth"],
  uncommittedDiff: "diff --git a/src/app.ts\n+new line",
  modifiedFiles: ["src/app.ts"],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockLoadConfig.mockReturnValue(fakeConfig);
  mockCreateApiClient.mockReturnValue(mockApiClient);
  mockCollectGitState.mockReturnValue(fakeGitState);
  mockGetRemoteOriginUrl.mockReturnValue("git@github.com:user/my-project.git");
});

describe("deriveProjectName", () => {
  it("extracts repo name from SSH remote URL", () => {
    expect(
      deriveProjectName("git@github.com:user/my-project.git", "/tmp")
    ).toBe("my-project");
  });

  it("extracts repo name from HTTPS remote URL", () => {
    expect(
      deriveProjectName("https://github.com/user/my-repo.git", "/tmp")
    ).toBe("my-repo");
  });

  it("handles URL without .git suffix", () => {
    expect(
      deriveProjectName("https://github.com/user/my-repo", "/tmp")
    ).toBe("my-repo");
  });

  it("falls back to directory basename when no remote", () => {
    expect(deriveProjectName(undefined, "/home/user/projects/cool-app")).toBe(
      "cool-app"
    );
  });
});

describe("readTerminalHistory", () => {
  it("reads from HISTFILE env var if set", () => {
    const original = process.env.HISTFILE;
    process.env.HISTFILE = "/tmp/.test_history";
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("line1\nline2\nline3\n");

    const history = readTerminalHistory();
    expect(history).toEqual(["line1", "line2", "line3"]);

    process.env.HISTFILE = original;
  });

  it("returns last 50 lines when history is long", () => {
    const original = process.env.HISTFILE;
    process.env.HISTFILE = "/tmp/.test_history";
    mockExistsSync.mockReturnValue(true);
    const lines = Array.from({ length: 100 }, (_, i) => `cmd${i}`);
    mockReadFileSync.mockReturnValue(lines.join("\n"));

    const history = readTerminalHistory();
    expect(history).toHaveLength(50);
    expect(history[0]).toBe("cmd50");
    expect(history[49]).toBe("cmd99");

    process.env.HISTFILE = original;
  });

  it("returns empty array when no history file found", () => {
    const original = process.env.HISTFILE;
    delete process.env.HISTFILE;
    mockExistsSync.mockReturnValue(false);

    const history = readTerminalHistory();
    expect(history).toEqual([]);

    process.env.HISTFILE = original;
  });
});

describe("parkCommand", () => {
  it("displays confirmation message on successful park", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    await parkCommand({});

    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/^Context captured for my-project at \d{4}-\d{2}-\d{2}T/)
    );
  });

  it("sends correct snapshot payload to API", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    await parkCommand({});

    expect(mockPost).toHaveBeenCalledWith(
      "/snapshots",
      expect.objectContaining({
        projectName: "my-project",
        source: "manual",
        git: fakeGitState,
      })
    );

    const payload = mockPost.mock.calls[0][1];
    expect(payload.projectId).toBeDefined();
    expect(payload.timestamp).toBeDefined();
  });

  it("includes note in payload when --note is provided", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    await parkCommand({ note: "Working on login feature" });

    const payload = mockPost.mock.calls[0][1];
    expect(payload.note).toBe("Working on login feature");
  });

  it("rejects note exceeding 5000 characters", async () => {
    const longNote = "x".repeat(5001);

    await parkCommand({ note: longNote });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("exceeds maximum length")
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("includes terminal history when --history flag is set", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });
    const original = process.env.HISTFILE;
    process.env.HISTFILE = "/tmp/.test_history";
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("ls\ncd /tmp\ngit status\n");

    await parkCommand({ history: true });

    const payload = mockPost.mock.calls[0][1];
    expect(payload.terminalHistory).toEqual(["ls", "cd /tmp", "git status"]);

    process.env.HISTFILE = original;
  });

  it("displays error when not in git repository", async () => {
    mockCollectGitState.mockImplementation(() => {
      throw new NotGitRepoError();
    });

    await parkCommand({});

    expect(console.error).toHaveBeenCalledWith(
      "Error: Current directory is not a git repository. Context capture cannot proceed."
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("displays error when config loading fails", async () => {
    mockLoadConfig.mockImplementation(() => {
      throw new Error("Configuration file not found");
    });

    await parkCommand({});

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Configuration file not found")
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("displays validation error on 400 response", async () => {
    mockPost.mockResolvedValue({
      status: 400,
      json: async () => ({ message: "Note exceeds maximum length" }),
    });

    await parkCommand({});

    expect(console.error).toHaveBeenCalledWith(
      "Error: Note exceeds maximum length"
    );
  });

  it("displays authentication error on 401 response", async () => {
    mockPost.mockResolvedValue({
      status: 401,
      json: async () => ({}),
    });

    await parkCommand({});

    expect(console.error).toHaveBeenCalledWith(
      "Authentication failed. Check your API key."
    );
  });

  it("displays storage error on 500 response", async () => {
    mockPost.mockResolvedValue({
      status: 500,
      json: async () => ({ message: "DynamoDB write failed" }),
    });

    await parkCommand({});

    expect(console.error).toHaveBeenCalledWith(
      "Failed to save context: DynamoDB write failed"
    );
  });

  it("displays network error when API call throws", async () => {
    mockPost.mockRejectedValue(new Error("ECONNREFUSED"));

    await parkCommand({});

    expect(console.error).toHaveBeenCalledWith(
      "Failed to save context: ECONNREFUSED"
    );
  });

  it("uses cwd as fallback when no remote origin", async () => {
    mockGetRemoteOriginUrl.mockReturnValue(undefined);
    mockPost.mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    await parkCommand({});

    const payload = mockPost.mock.calls[0][1];
    // Project name should be derived from cwd basename
    expect(payload.projectName).toBeDefined();
    expect(payload.projectId).toBeDefined();
  });

  it("handles 201 status as success", async () => {
    mockPost.mockResolvedValue({
      status: 201,
      json: async () => ({}),
    });

    await parkCommand({});

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Context captured for")
    );
  });
});
