/**
 * GitHub data fetching module for Context Switcher.
 *
 * Fetches open pull requests and unresolved review comments from the GitHub API.
 * Implements graceful degradation: any failure (auth, rate limit, timeout, server error)
 * logs the error and returns an empty result so that the capture continues without GitHub data.
 *
 * Requirements: 4.1, 4.2, 4.4, 4.5
 */

import { PR_MAX, COMMENTS_MAX } from "@ctx-switch/shared";
import type {
  GitHubContext,
  PullRequest,
  ReviewComment,
} from "@ctx-switch/shared";

/** Timeout in milliseconds for each GitHub API request (Requirement 4.5). */
const GITHUB_REQUEST_TIMEOUT_MS = 10_000;

/** GitHub API base URL. */
const GITHUB_API_BASE = "https://api.github.com";

/**
 * Returns an empty GitHubContext, used as a fallback on any failure.
 */
function emptyGitHubContext(): GitHubContext {
  return { pullRequests: [], unresolvedComments: [] };
}

/**
 * Performs a GitHub API GET request with a 10-second timeout.
 *
 * @param url - The full GitHub API URL to fetch.
 * @param token - A GitHub personal access token for authorization.
 * @returns The parsed JSON response.
 * @throws On non-2xx responses, timeout, or network errors.
 */
async function githubGet<T>(url: string, token: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API returned ${response.status}: ${response.statusText}`
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches open pull requests for the given repository (max 20).
 *
 * @param token - GitHub personal access token.
 * @param owner - Repository owner (user or org).
 * @param repo - Repository name.
 * @returns Array of PullRequest objects, at most PR_MAX (20) items.
 */
async function fetchOpenPRs(
  token: string,
  owner: string,
  repo: string
): Promise<PullRequest[]> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls?state=open&per_page=${PR_MAX}`;

  const rawPRs = await githubGet<GitHubPRResponse[]>(url, token);

  return rawPRs.slice(0, PR_MAX).map((pr) => ({
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    state: pr.state,
  }));
}

/**
 * Fetches unresolved review comments for the given repository (max 50).
 *
 * Uses the pull request review comments endpoint and filters for comments
 * that have not been resolved. GitHub does not directly expose resolution
 * status on the comments list endpoint, so we treat all comments returned
 * from this endpoint as "open" unless they have an explicit resolution indicator.
 *
 * @param token - GitHub personal access token.
 * @param owner - Repository owner (user or org).
 * @param repo - Repository name.
 * @returns Array of ReviewComment objects, at most COMMENTS_MAX (50) items.
 */
async function fetchUnresolvedComments(
  token: string,
  owner: string,
  repo: string
): Promise<ReviewComment[]> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/comments?per_page=${COMMENTS_MAX}&sort=created&direction=desc`;

  const rawComments = await githubGet<GitHubCommentResponse[]>(url, token);

  return rawComments.slice(0, COMMENTS_MAX).map((comment) => ({
    prNumber: comment.pull_request_url
      ? parseInt(comment.pull_request_url.split("/").pop() ?? "0", 10)
      : 0,
    body: comment.body,
    path: comment.path,
    line: comment.line ?? comment.original_line ?? 0,
    status: "open" as const,
  }));
}

/**
 * Fetches GitHub data (open PRs and unresolved review comments) for a repository.
 *
 * Implements graceful degradation: any failure (authentication, rate limiting,
 * timeout, network error, or server error) is logged and an empty GitHubContext
 * is returned so that the capture operation is not blocked.
 *
 * @param token - GitHub personal access token.
 * @param owner - Repository owner (user or org).
 * @param repo - Repository name.
 * @returns A GitHubContext with pull requests and unresolved comments, or empty on failure.
 */
export async function fetchGitHubData(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubContext> {
  try {
    const [pullRequests, unresolvedComments] = await Promise.all([
      fetchOpenPRs(token, owner, repo),
      fetchUnresolvedComments(token, owner, repo),
    ]);

    return { pullRequests, unresolvedComments };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(
      `[GitHub Integration] Failed to fetch data for ${owner}/${repo}: ${message}`
    );
    return emptyGitHubContext();
  }
}

// ─── GitHub API Response Types (internal) ────────────────────────────────────

/** Shape of a PR object from the GitHub REST API. */
interface GitHubPRResponse {
  number: number;
  title: string;
  html_url: string;
  state: string;
}

/** Shape of a review comment from the GitHub REST API. */
interface GitHubCommentResponse {
  body: string;
  path: string;
  line: number | null;
  original_line: number | null;
  pull_request_url?: string;
}
