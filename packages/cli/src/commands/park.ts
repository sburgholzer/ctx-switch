import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import {
  NotGitRepoError,
  ValidationError,
  deriveProjectId,
  NOTE_MAX_CHARS,
  HISTORY_MAX_LINES,
} from "@ctx-switch/shared";
import type { Snapshot } from "@ctx-switch/shared";
import { collectGitState, getRemoteOriginUrl } from "../git.js";
import { loadConfig } from "../config.js";
import { createApiClient } from "../api-client.js";

export interface ParkOptions {
  note?: string;
  history?: boolean;
}

/**
 * Derive a human-readable project name from a remote URL or directory path.
 * For remote URLs, extracts the repo name (e.g., "my-repo" from "git@github.com:user/my-repo.git").
 * For local paths, uses the directory basename.
 */
export function deriveProjectName(remoteUrl: string | undefined, cwd: string): string {
  if (remoteUrl) {
    // Strip trailing .git
    let cleaned = remoteUrl.replace(/\.git$/, "");
    // Handle SSH format: git@github.com:user/repo
    const sshMatch = cleaned.match(/[:\/]([^\/]+)$/);
    if (sshMatch) {
      return sshMatch[1];
    }
    // Fallback: last path segment
    return basename(cleaned);
  }
  return basename(cwd);
}

/**
 * Read terminal history from the HISTFILE environment variable or common shell history files.
 * Returns the last 50 lines (HISTORY_MAX_LINES).
 */
export function readTerminalHistory(): string[] {
  const histFile = process.env.HISTFILE;
  const candidates = histFile
    ? [histFile]
    : [
        `${process.env.HOME}/.zsh_history`,
        `${process.env.HOME}/.bash_history`,
      ];

  for (const file of candidates) {
    if (file && existsSync(file)) {
      try {
        const content = readFileSync(file, "utf-8");
        const lines = content.split("\n").filter(Boolean);
        return lines.slice(-HISTORY_MAX_LINES);
      } catch {
        // Can't read history file, continue to next candidate
      }
    }
  }
  return [];
}

/**
 * Execute the `ctx park` command.
 * Captures the current working context and sends it to the API.
 */
export async function parkCommand(options: ParkOptions): Promise<void> {
  // 1. Load config
  let config;
  try {
    config = loadConfig();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return;
  }

  // 2. Create API client
  const apiClient = createApiClient(config);

  // 3. Collect git state
  let gitState;
  try {
    gitState = collectGitState();
  } catch (err: unknown) {
    if (err instanceof NotGitRepoError) {
      console.error(
        "Error: Current directory is not a git repository. Context capture cannot proceed."
      );
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error collecting git state: ${message}`);
    return;
  }

  // 4. Get remote origin URL (or use cwd as fallback)
  const cwd = process.cwd();
  const remoteUrl = getRemoteOriginUrl();
  const projectInput = remoteUrl ?? cwd;

  // 5. Derive project ID
  const projectId = deriveProjectId(projectInput);

  // 6. Derive project name
  const projectName = deriveProjectName(remoteUrl, cwd);

  // 7. Construct snapshot payload
  const timestamp = new Date().toISOString();
  const snapshot: Snapshot = {
    projectId,
    projectName,
    timestamp,
    source: "manual",
    git: gitState,
  };

  // 8. Include note if provided
  if (options.note !== undefined) {
    if (options.note.length > NOTE_MAX_CHARS) {
      console.error(
        `Error: Note exceeds maximum length of ${NOTE_MAX_CHARS} characters.`
      );
      return;
    }
    snapshot.note = options.note;
  }

  // 9. Include terminal history if --history flag set
  if (options.history) {
    snapshot.terminalHistory = readTerminalHistory();
  }

  // 10. POST to /snapshots via API client
  let response;
  try {
    response = await apiClient.post("/snapshots", snapshot);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to save context: ${message}`);
    return;
  }

  // 11-14. Handle response status codes
  if (response.status === 200 || response.status === 201) {
    console.log(`Context captured for ${projectName} at ${timestamp}`);
  } else if (response.status === 400) {
    let errorMessage = "Validation error";
    try {
      const body = await response.json();
      errorMessage = (body as { message?: string }).message ?? errorMessage;
    } catch {
      // Use default message
    }
    console.error(`Error: ${errorMessage}`);
  } else if (response.status === 401) {
    console.error("Authentication failed. Check your API key.");
  } else {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      errorMessage = (body as { message?: string }).message ?? errorMessage;
    } catch {
      // Use status code as message
    }
    console.error(`Failed to save context: ${errorMessage}`);
  }
}
