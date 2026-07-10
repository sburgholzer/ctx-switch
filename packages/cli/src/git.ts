/**
 * Git state collection utilities for the CLI.
 *
 * These functions shell out to git commands using child_process.execSync
 * to extract repository state for context snapshots.
 */
import { execSync } from "child_process";
import { NotGitRepoError } from "@ctx-switch/shared";
import type { GitState } from "@ctx-switch/shared";

/**
 * Check if the current directory is inside a git repository.
 */
export function isGitRepo(cwd?: string): boolean {
  try {
    const result = execSync("git rev-parse --is-inside-work-tree", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Get the current branch name.
 */
export function getBranchName(cwd?: string): string {
  const result = execSync("git branch --show-current", {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return result.trim();
}

/**
 * Get the last N commit messages (default 5) as one-line summaries.
 */
export function getLastCommits(count = 5, cwd?: string): string[] {
  try {
    const result = execSync(`git log --oneline -n ${count}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = result.trim().split("\n").filter(Boolean);
    return lines;
  } catch {
    // No commits yet or other error
    return [];
  }
}

/**
 * Get the uncommitted diff (staged + unstaged).
 */
export function getUncommittedDiff(cwd?: string): string {
  const unstaged = execSync("git diff", {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const staged = execSync("git diff --cached", {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const combined = [unstaged.trim(), staged.trim()].filter(Boolean).join("\n");
  return combined;
}

/**
 * Get the list of modified files from `git status --porcelain`.
 */
export function getModifiedFiles(cwd?: string): string[] {
  const result = execSync("git status --porcelain", {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  // Split on newline and filter empty lines (don't trim — leading spaces are part of the format)
  const lines = result.split("\n").filter((line) => line.length > 0);
  // Each line is "XY filename" where XY is 2 status chars + 1 space separator
  return lines.map((line) => line.slice(3));
}

/**
 * Get the remote origin URL, or undefined if no remote is configured.
 */
export function getRemoteOriginUrl(cwd?: string): string | undefined {
  try {
    const result = execSync("git remote get-url origin", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const url = result.trim();
    return url || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Collect all git state for a context snapshot.
 * Throws NotGitRepoError if the current directory is not inside a git repository.
 */
export function collectGitState(cwd?: string): GitState {
  if (!isGitRepo(cwd)) {
    throw new NotGitRepoError();
  }

  return {
    branch: getBranchName(cwd),
    lastCommits: getLastCommits(5, cwd),
    uncommittedDiff: getUncommittedDiff(cwd),
    modifiedFiles: getModifiedFiles(cwd),
  };
}
