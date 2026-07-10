import { describe, it, expect } from "vitest";
import type {
  Snapshot,
  PullRequest,
  ReviewComment,
  ProjectRecord,
  GitState,
  GitHubContext,
} from "./models.js";

describe("models", () => {
  it("Snapshot interface accepts a valid manual snapshot", () => {
    const snapshot: Snapshot = {
      projectId: "abc123",
      projectName: "my-project",
      timestamp: "2024-01-15T10:30:00.000Z",
      source: "manual",
      git: {
        branch: "feature/login",
        lastCommits: ["fix: typo", "feat: add auth"],
        uncommittedDiff: "diff --git a/file.ts",
        modifiedFiles: ["src/auth.ts"],
      },
    };
    expect(snapshot.source).toBe("manual");
    expect(snapshot.git.branch).toBe("feature/login");
    expect(snapshot.note).toBeUndefined();
    expect(snapshot.github).toBeUndefined();
  });

  it("Snapshot interface accepts optional fields", () => {
    const snapshot: Snapshot = {
      projectId: "abc123",
      projectName: "my-project",
      timestamp: "2024-01-15T10:30:00.000Z",
      source: "auto",
      git: {
        branch: "main",
        lastCommits: [],
        uncommittedDiff: "",
        modifiedFiles: [],
      },
      note: "Working on the login flow",
      terminalHistory: ["npm test", "git status"],
      github: {
        pullRequests: [
          { number: 42, title: "Add auth", url: "https://github.com/org/repo/pull/42", state: "open" },
        ],
        unresolvedComments: [
          { prNumber: 42, body: "Needs tests", path: "src/auth.ts", line: 10, status: "open" },
        ],
      },
    };
    expect(snapshot.source).toBe("auto");
    expect(snapshot.note).toBe("Working on the login flow");
    expect(snapshot.terminalHistory).toHaveLength(2);
    expect(snapshot.github!.pullRequests).toHaveLength(1);
    expect(snapshot.github!.unresolvedComments[0].status).toBe("open");
  });

  it("PullRequest interface accepts valid data", () => {
    const pr: PullRequest = {
      number: 1,
      title: "Initial PR",
      url: "https://github.com/org/repo/pull/1",
      state: "open",
    };
    expect(pr.number).toBe(1);
    expect(pr.state).toBe("open");
  });

  it("ReviewComment interface accepts all status values", () => {
    const statuses: ReviewComment["status"][] = ["open", "resolved", "dismissed"];
    statuses.forEach((status) => {
      const comment: ReviewComment = {
        prNumber: 1,
        body: "Fix this",
        path: "src/index.ts",
        line: 5,
        status,
      };
      expect(comment.status).toBe(status);
    });
  });

  it("ProjectRecord interface accepts valid data", () => {
    const record: ProjectRecord = {
      userId: "user-123",
      projectId: "proj-abc",
      projectName: "my-project",
      lastParkTimestamp: "2024-01-15T10:30:00.000Z",
      summary: "Working on authentication feature",
      snapshotCount: 3,
    };
    expect(record.userId).toBe("user-123");
    expect(record.snapshotCount).toBe(3);
  });

  it("GitState interface enforces required fields", () => {
    const git: GitState = {
      branch: "develop",
      lastCommits: ["commit1", "commit2", "commit3", "commit4", "commit5"],
      uncommittedDiff: "",
      modifiedFiles: ["a.ts", "b.ts"],
    };
    expect(git.lastCommits).toHaveLength(5);
    expect(git.modifiedFiles).toHaveLength(2);
  });

  it("GitHubContext interface holds PR and comment arrays", () => {
    const ctx: GitHubContext = {
      pullRequests: [],
      unresolvedComments: [],
    };
    expect(ctx.pullRequests).toHaveLength(0);
    expect(ctx.unresolvedComments).toHaveLength(0);
  });
});
