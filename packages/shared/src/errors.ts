/**
 * Typed error classes for Context Switcher.
 *
 * Each class maps to an error category from the design document,
 * enabling precise catch handling and user-facing messaging across
 * the CLI, Lambda handlers, and web dashboard.
 */

/** Thrown when a command is executed outside a git repository (Requirement 1.8). */
export class NotGitRepoError extends Error {
  readonly code = "NOT_GIT_REPO" as const;

  constructor(message = "Current directory is not a git repository") {
    super(message);
    this.name = "NotGitRepoError";
  }
}

/** Thrown when DynamoDB or S3 is unreachable or returns an unexpected error (Requirement 1.9). */
export class StorageError extends Error {
  readonly code = "STORAGE_ERROR" as const;

  constructor(message = "Storage operation failed") {
    super(message);
    this.name = "StorageError";
  }
}

/** Thrown when a requested project or snapshot does not exist (Requirements 2.4, 3.4, 3.6). */
export class NotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;

  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Thrown when input fails validation (e.g. note too long) (Requirement 1.3). */
export class ValidationError extends Error {
  readonly code = "VALIDATION_ERROR" as const;

  constructor(message = "Validation failed") {
    super(message);
    this.name = "ValidationError";
  }
}

/** Thrown when authentication fails (missing, invalid, or revoked API key) (Requirements 5.1, 5.2). */
export class AuthError extends Error {
  readonly code = "AUTH_ERROR" as const;

  constructor(message = "Authentication failed") {
    super(message);
    this.name = "AuthError";
  }
}
