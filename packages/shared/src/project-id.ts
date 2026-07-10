import { createHash } from "crypto";

/**
 * Derives a stable project identifier from a git remote URL or local directory path.
 *
 * Normalization steps:
 * 1. Strip trailing `.git` suffix
 * 2. Convert to lowercase
 *
 * The normalized input is hashed with SHA-256 and the first 16 hex characters are returned.
 *
 * @param input - A git remote URL (e.g., "https://github.com/user/repo.git", "git@github.com:user/repo.git")
 *               or a local directory path (e.g., "/Users/dev/my-project")
 * @returns A 16-character hex string uniquely identifying the project
 */
export function deriveProjectId(input: string): string {
  // Normalize: strip trailing .git suffix and convert to lowercase
  let normalized = input.replace(/\.git$/, "").toLowerCase();

  // Hash with SHA-256 and return first 16 hex characters
  const hash = createHash("sha256").update(normalized).digest("hex");
  return hash.slice(0, 16);
}
