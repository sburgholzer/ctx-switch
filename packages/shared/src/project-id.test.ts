import { describe, it, expect } from "vitest";
import { deriveProjectId } from "./project-id.js";

describe("deriveProjectId", () => {
  it("returns a 16-character hex string", () => {
    const result = deriveProjectId("https://github.com/user/repo.git");
    expect(result).toHaveLength(16);
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  it("strips trailing .git suffix before hashing", () => {
    const withGit = deriveProjectId("https://github.com/user/repo.git");
    const withoutGit = deriveProjectId("https://github.com/user/repo");
    expect(withGit).toBe(withoutGit);
  });

  it("normalizes to lowercase before hashing", () => {
    const upper = deriveProjectId("https://GitHub.com/User/Repo");
    const lower = deriveProjectId("https://github.com/user/repo");
    expect(upper).toBe(lower);
  });

  it("produces deterministic output for the same input", () => {
    const input = "git@github.com:user/repo.git";
    const first = deriveProjectId(input);
    const second = deriveProjectId(input);
    expect(first).toBe(second);
  });

  it("produces different IDs for different inputs", () => {
    const id1 = deriveProjectId("https://github.com/user/repo-a");
    const id2 = deriveProjectId("https://github.com/user/repo-b");
    expect(id1).not.toBe(id2);
  });

  it("handles SSH-style git remote URLs", () => {
    const result = deriveProjectId("git@github.com:user/repo.git");
    expect(result).toHaveLength(16);
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles local directory paths", () => {
    const result = deriveProjectId("/Users/dev/my-project");
    expect(result).toHaveLength(16);
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles paths with trailing .git suffix (bare repos)", () => {
    const withGit = deriveProjectId("/Users/dev/my-project.git");
    const withoutGit = deriveProjectId("/Users/dev/my-project");
    expect(withGit).toBe(withoutGit);
  });

  it("produces a non-empty string for any non-empty input", () => {
    const result = deriveProjectId("a");
    expect(result.length).toBeGreaterThan(0);
  });
});
