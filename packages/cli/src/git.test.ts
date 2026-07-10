import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotGitRepoError } from "@ctx-switch/shared";

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "child_process";
import {
  isGitRepo,
  getBranchName,
  getLastCommits,
  getUncommittedDiff,
  getModifiedFiles,
  getRemoteOriginUrl,
  collectGitState,
} from "./git.js";

const mockExecSync = vi.mocked(execSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isGitRepo", () => {
  it("returns true when git rev-parse succeeds with 'true'", () => {
    mockExecSync.mockReturnValue("true\n");
    expect(isGitRepo()).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith(
      "git rev-parse --is-inside-work-tree",
      expect.objectContaining({ encoding: "utf-8" }),
    );
  });

  it("returns false when git rev-parse throws", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("fatal: not a git repository");
    });
    expect(isGitRepo()).toBe(false);
  });

  it("passes cwd option through to execSync", () => {
    mockExecSync.mockReturnValue("true\n");
    isGitRepo("/some/path");
    expect(mockExecSync).toHaveBeenCalledWith(
      "git rev-parse --is-inside-work-tree",
      expect.objectContaining({ cwd: "/some/path" }),
    );
  });
});

describe("getBranchName", () => {
  it("returns the trimmed branch name", () => {
    mockExecSync.mockReturnValue("feature/my-branch\n");
    expect(getBranchName()).toBe("feature/my-branch");
  });

  it("passes cwd option through", () => {
    mockExecSync.mockReturnValue("main\n");
    getBranchName("/repo");
    expect(mockExecSync).toHaveBeenCalledWith(
      "git branch --show-current",
      expect.objectContaining({ cwd: "/repo" }),
    );
  });
});

describe("getLastCommits", () => {
  it("returns parsed commit lines", () => {
    mockExecSync.mockReturnValue(
      "abc1234 fix: resolve login bug\ndef5678 feat: add auth\nghi9012 chore: update deps\n",
    );
    const commits = getLastCommits(3);
    expect(commits).toEqual([
      "abc1234 fix: resolve login bug",
      "def5678 feat: add auth",
      "ghi9012 chore: update deps",
    ]);
  });

  it("defaults to 5 commits", () => {
    mockExecSync.mockReturnValue("abc1234 commit 1\n");
    getLastCommits();
    expect(mockExecSync).toHaveBeenCalledWith(
      "git log --oneline -n 5",
      expect.objectContaining({ encoding: "utf-8" }),
    );
  });

  it("returns empty array when git log throws (no commits)", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("fatal: bad default revision 'HEAD'");
    });
    expect(getLastCommits()).toEqual([]);
  });

  it("returns empty array for empty output", () => {
    mockExecSync.mockReturnValue("");
    expect(getLastCommits()).toEqual([]);
  });
});

describe("getUncommittedDiff", () => {
  it("combines unstaged and staged diffs", () => {
    mockExecSync
      .mockReturnValueOnce("diff --git a/file.ts\n+added line\n")
      .mockReturnValueOnce("diff --git b/other.ts\n+staged line\n");
    const diff = getUncommittedDiff();
    expect(diff).toContain("+added line");
    expect(diff).toContain("+staged line");
  });

  it("returns empty string when no diffs", () => {
    mockExecSync.mockReturnValueOnce("").mockReturnValueOnce("");
    expect(getUncommittedDiff()).toBe("");
  });

  it("returns only unstaged if no staged changes", () => {
    mockExecSync
      .mockReturnValueOnce("diff --git a/file.ts\n+line\n")
      .mockReturnValueOnce("");
    const diff = getUncommittedDiff();
    expect(diff).toBe("diff --git a/file.ts\n+line");
  });

  it("returns only staged if no unstaged changes", () => {
    mockExecSync
      .mockReturnValueOnce("")
      .mockReturnValueOnce("diff --git a/staged.ts\n+staged\n");
    const diff = getUncommittedDiff();
    expect(diff).toBe("diff --git a/staged.ts\n+staged");
  });
});

describe("getModifiedFiles", () => {
  it("extracts file paths from porcelain output", () => {
    mockExecSync.mockReturnValue(" M src/index.ts\nA  src/new.ts\n?? untracked.txt\n");
    const files = getModifiedFiles();
    expect(files).toEqual(["src/index.ts", "src/new.ts", "untracked.txt"]);
  });

  it("returns empty array when no modified files", () => {
    mockExecSync.mockReturnValue("");
    expect(getModifiedFiles()).toEqual([]);
  });

  it("passes cwd option through", () => {
    mockExecSync.mockReturnValue("");
    getModifiedFiles("/my/repo");
    expect(mockExecSync).toHaveBeenCalledWith(
      "git status --porcelain",
      expect.objectContaining({ cwd: "/my/repo" }),
    );
  });
});

describe("getRemoteOriginUrl", () => {
  it("returns the remote URL when available", () => {
    mockExecSync.mockReturnValue("git@github.com:user/repo.git\n");
    expect(getRemoteOriginUrl()).toBe("git@github.com:user/repo.git");
  });

  it("returns undefined when git remote get-url throws", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("fatal: No such remote 'origin'");
    });
    expect(getRemoteOriginUrl()).toBeUndefined();
  });

  it("returns undefined for empty output", () => {
    mockExecSync.mockReturnValue("");
    expect(getRemoteOriginUrl()).toBeUndefined();
  });
});

describe("collectGitState", () => {
  it("throws NotGitRepoError when not in a git repo", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("fatal: not a git repository");
    });
    expect(() => collectGitState()).toThrow(NotGitRepoError);
  });

  it("returns full git state when in a valid repo", () => {
    // isGitRepo call
    mockExecSync.mockReturnValueOnce("true\n");
    // getBranchName call
    mockExecSync.mockReturnValueOnce("feature/auth\n");
    // getLastCommits call
    mockExecSync.mockReturnValueOnce(
      "abc1234 first commit\ndef5678 second commit\n",
    );
    // getUncommittedDiff - unstaged
    mockExecSync.mockReturnValueOnce("diff unstaged\n");
    // getUncommittedDiff - staged
    mockExecSync.mockReturnValueOnce("diff staged\n");
    // getModifiedFiles
    mockExecSync.mockReturnValueOnce(" M src/app.ts\n");

    const state = collectGitState();

    expect(state.branch).toBe("feature/auth");
    expect(state.lastCommits).toEqual([
      "abc1234 first commit",
      "def5678 second commit",
    ]);
    expect(state.uncommittedDiff).toContain("diff unstaged");
    expect(state.uncommittedDiff).toContain("diff staged");
    expect(state.modifiedFiles).toEqual(["src/app.ts"]);
  });

  it("passes cwd to all sub-calls", () => {
    mockExecSync.mockReturnValueOnce("true\n"); // isGitRepo
    mockExecSync.mockReturnValueOnce("main\n"); // getBranchName
    mockExecSync.mockReturnValueOnce(""); // getLastCommits
    mockExecSync.mockReturnValueOnce(""); // getUncommittedDiff unstaged
    mockExecSync.mockReturnValueOnce(""); // getUncommittedDiff staged
    mockExecSync.mockReturnValueOnce(""); // getModifiedFiles

    collectGitState("/custom/path");

    for (const call of mockExecSync.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ cwd: "/custom/path" }));
    }
  });
});
