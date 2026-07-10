/**
 * Core data model interfaces for Context Switcher.
 *
 * These interfaces define the shape of data flowing through the system:
 * snapshots captured by the CLI, pull request metadata from GitHub,
 * review comments, and DynamoDB project records.
 */

/** A pull request associated with the current repository. */
export interface PullRequest {
  number: number;
  title: string;
  url: string;
  state: string;
}

/** A review comment on a pull request. */
export interface ReviewComment {
  prNumber: number;
  body: string;
  path: string;
  line: number;
  status: "open" | "resolved" | "dismissed";
}

/** GitHub-related context captured alongside a snapshot. */
export interface GitHubContext {
  pullRequests: PullRequest[];
  unresolvedComments: ReviewComment[];
}

/** Git state captured at park time. */
export interface GitState {
  branch: string;
  lastCommits: string[];
  uncommittedDiff: string;
  modifiedFiles: string[];
}

/**
 * A point-in-time capture of a developer's working context.
 * Created by `ctx park` (source: "manual") or scheduled auto-capture (source: "auto").
 */
export interface Snapshot {
  projectId: string;
  projectName: string;
  timestamp: string; // ISO 8601
  source: "manual" | "auto";
  git: GitState;
  note?: string;
  terminalHistory?: string[];
  github?: GitHubContext;
}

/**
 * A project record stored in DynamoDB.
 * Represents the metadata row for a user's project (PK=USER#{userId}, SK=PROJECT#{projectId}).
 */
export interface ProjectRecord {
  userId: string;
  projectId: string;
  projectName: string;
  lastParkTimestamp: string; // ISO 8601
  summary: string;
  snapshotCount: number;
}
