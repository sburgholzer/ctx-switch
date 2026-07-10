# Implementation Plan: Context Switcher

## Overview

This plan implements the Context Switcher feature as a TypeScript monorepo with a CLI (`ctx`), AWS Lambda handlers, and a React web dashboard. The implementation follows a bottom-up approach: shared types and utilities first, then core business logic, then Lambda handlers, then CLI, and finally the web dashboard. Property-based tests use fast-check and are placed close to the code they validate.

## Tasks

- [x] 1. Set up project structure and shared types
  - [x] 1.1 Initialize TypeScript monorepo with shared package
    - Create monorepo structure with packages: `shared`, `lambdas`, `cli`, `web`
    - Configure TypeScript project references and shared tsconfig
    - Set up package.json with workspaces, install base dependencies (typescript, vitest, fast-check)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 Define core data model interfaces and types
    - Create `packages/shared/src/models.ts` with Snapshot, PullRequest, ReviewComment, ProjectRecord interfaces matching the design schema
    - Create `packages/shared/src/constants.ts` with limits (NOTE_MAX_CHARS=5000, HISTORY_MAX_LINES=50, PR_MAX=20, COMMENTS_MAX=50, OVERFLOW_THRESHOLD_BYTES=400000, SUMMARY_MAX_CHARS=80, BRIEFING_MAX_WORDS=500, AUTOCAPTURE_MAX_PROJECTS=20)
    - Create `packages/shared/src/errors.ts` with typed error classes (NotGitRepoError, StorageError, NotFoundError, ValidationError, AuthError)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 4.1, 4.2, 7.1, 8.2_

  - [x] 1.3 Implement DynamoDB key schema utilities
    - Create `packages/shared/src/keys.ts` with functions to construct PK/SK patterns (USER#{userId}, PROJECT#{projectId}, SNAPSHOT#{projectId}#{timestamp})
    - Include GSI-1 key construction for auto-capture lookup (AUTOCAP#{userId}, PROJECT#{projectId})
    - _Requirements: 5.3, 5.4, 5.5, 7.1_

- [x] 2. Implement core business logic utilities
  - [x] 2.1 Implement project identifier derivation
    - Create `packages/shared/src/project-id.ts` with function to derive project ID from git remote URL or local directory path
    - Use SHA-256 hash of normalized remote URL (strip .git suffix, lowercase) or absolute directory path
    - Return hex-encoded hash truncated to 16 characters for readability
    - _Requirements: 1.5_

  - [x] 2.2 Write property test for project ID derivation
    - **Property 3: Project identifier derivation is deterministic**
    - **Validates: Requirements 1.5**

  - [x] 2.3 Implement payload validation and size utilities
    - Create `packages/shared/src/validation.ts` with functions to validate note length (≤5000 chars), truncate terminal history (≤50 lines), enforce GitHub limits (≤20 PRs, ≤50 comments)
    - Create `packages/shared/src/overflow.ts` with function to calculate serialized payload size and determine if S3 overflow is needed (>400KB threshold)
    - _Requirements: 1.3, 1.4, 1.7, 4.1, 4.2_

  - [x] 2.4 Write property tests for validation and overflow
    - **Property 2: Input field limits are enforced**
    - **Validates: Requirements 1.3, 1.4**
    - **Property 4: Overflow routing by payload size**
    - **Validates: Requirements 1.7**
    - **Property 8: GitHub data respects configured maximums**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 2.5 Implement summary truncation and display formatting
    - Create `packages/shared/src/formatting.ts` with functions to truncate summary to 80 chars, format timestamp for display, format project listing rows
    - _Requirements: 3.1, 3.3_

  - [x] 2.6 Write property test for summary truncation
    - **Property 7: Summary truncation to 80 characters**
    - **Validates: Requirements 3.1, 3.3**

  - [x] 2.7 Implement sorting utilities
    - Create `packages/shared/src/sorting.ts` with functions to sort projects and snapshots by timestamp descending (newest first)
    - _Requirements: 2.5, 3.3_

  - [x] 2.8 Write property test for listing order
    - **Property 6: Listings are ordered newest-first**
    - **Validates: Requirements 2.5, 3.3**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement data access layer
  - [x] 4.1 Implement DynamoDB client and repository
    - Create `packages/lambdas/src/data/dynamo-client.ts` with configured DynamoDB Document Client (automatic retries with exponential backoff, 3 attempts)
    - Create `packages/lambdas/src/data/snapshot-repo.ts` with methods: putSnapshot, getLatestSnapshot, getSnapshotHistory (limit 10), listProjects, deleteProjectSnapshots, putProjectRecord, deleteProjectRecord
    - All queries scoped to authenticated userId (PK = USER#{userId})
    - _Requirements: 1.5, 2.1, 3.1, 3.2, 3.3, 5.3, 5.4, 5.5_

  - [x] 4.2 Implement S3 overflow storage
    - Create `packages/lambdas/src/data/s3-client.ts` with configured S3 client
    - Create `packages/lambdas/src/data/archive-repo.ts` with methods: putPayload (stores full snapshot JSON at {userId}/{projectId}/{timestamp}.json), getPayload (retrieves by key), deletePayloads (batch delete by prefix)
    - _Requirements: 1.7, 2.1, 3.2_

  - [x] 4.3 Write property test for tenant data isolation
    - **Property 9: Tenant data isolation**
    - **Validates: Requirements 5.3, 5.4, 5.5**

- [x] 5. Implement Capture Lambda
  - [x] 5.1 Implement capture handler core logic
    - Create `packages/lambdas/src/handlers/capture.ts` with Lambda handler
    - Validate incoming payload (note length, history lines, GitHub limits)
    - Calculate payload size, route to S3 if overflow, otherwise store directly in DynamoDB
    - Store project record with updated lastParkTimestamp and summary
    - Return success response with project name and timestamp
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 5.2 Implement GitHub data fetching module
    - Create `packages/lambdas/src/integrations/github.ts` with functions to fetch open PRs (max 20) and unresolved review comments (max 50) for current repo
    - Enforce 10-second timeout per GitHub API request
    - On any failure (auth, rate limit, timeout, server error), log error and return empty result (graceful degradation)
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [x] 5.3 Write property test for snapshot capture completeness
    - **Property 1: Snapshot captures complete git state**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 5.4 Write property test for output messages
    - **Property 5: Output messages contain project identifiers**
    - **Validates: Requirements 1.6, 2.4**

- [x] 6. Implement Resume Lambda
  - [x] 6.1 Implement resume handler with Bedrock briefing generation
    - Create `packages/lambdas/src/handlers/resume.ts` with Lambda handler
    - Retrieve latest snapshot for project (fetch from S3 if overflow reference exists)
    - Invoke Bedrock with system prompt defining 4-section format and 500-word limit
    - Return formatted briefing on success
    - On Bedrock timeout (>15s) or error, return raw snapshot data with fallback indicator
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7_

  - [x] 6.2 Implement briefing parser and validator
    - Create `packages/lambdas/src/integrations/briefing.ts` with Bedrock client configuration, prompt template, and response parser
    - Validate briefing structure (4 sections in order), word count (≤500), verbatim notes in "Open Items", "None" for empty sections
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 6.3 Write property test for briefing structure
    - **Property 12: Briefing structure and content constraints**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.5**

- [x] 7. Implement List, History, and Delete Lambdas
  - [x] 7.1 Implement list handler
    - Create `packages/lambdas/src/handlers/list.ts` with Lambda handler
    - Query all projects for authenticated user, return sorted by lastParkTimestamp descending
    - Each entry includes project name, last park timestamp, summary truncated to 80 chars
    - Return empty-state message if no projects exist
    - _Requirements: 3.1, 3.5_

  - [x] 7.2 Implement history handler
    - Create `packages/lambdas/src/handlers/history.ts` with Lambda handler
    - Query up to 10 most recent snapshots for specified project, sorted newest-first
    - Each entry includes timestamp and summary truncated to 80 chars
    - Return not-found error if project doesn't exist
    - _Requirements: 3.3, 3.6_

  - [x] 7.3 Implement delete handler
    - Create `packages/lambdas/src/handlers/delete.ts` with Lambda handler
    - Delete all snapshots for the specified project from DynamoDB and S3
    - Delete the project record
    - Return success with project name and count of removed snapshots
    - Return not-found error if project doesn't exist
    - _Requirements: 3.2, 3.4_

- [x] 8. Implement Auto-Capture Lambda
  - [x] 8.1 Implement auto-capture handler
    - Create `packages/lambdas/src/handlers/auto-capture.ts` with Lambda handler triggered by EventBridge
    - Query GSI-1 for configured projects (max 20)
    - For each project, execute capture with source="auto"
    - On individual project failure, log and continue to next project (no retry)
    - Record summary with success count and failure count
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 8.2 Write property tests for auto-capture
    - **Property 10: Auto-capture configuration enforcement**
    - **Validates: Requirements 7.1, 7.3**
    - **Property 11: Auto-capture resilience**
    - **Validates: Requirements 7.4, 7.5**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement API Gateway and authentication
  - [x] 10.1 Implement API key authorizer Lambda
    - Create `packages/lambdas/src/handlers/authorizer.ts` with custom authorizer
    - Validate API key from `x-api-key` header against registered keys in DynamoDB
    - Return 401 for missing, invalid, or revoked keys with no snapshot data in body
    - Extract userId from validated key and pass in authorization context
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 10.2 Create CDK infrastructure stack
    - Create `packages/infra/lib/context-switcher-stack.ts` with CDK stack definition
    - Define DynamoDB table with PK/SK schema and GSI-1
    - Define S3 bucket with 90-day lifecycle policy
    - Define API Gateway REST API with API key authorizer
    - Define Lambda functions for all handlers with appropriate IAM roles
    - Define EventBridge rule for auto-capture scheduling
    - _Requirements: 5.1, 5.2, 7.2_

- [x] 11. Implement CLI
  - [x] 11.1 Set up CLI framework and configuration
    - Create `packages/cli/src/index.ts` as entry point with commander.js for subcommand routing
    - Create `packages/cli/src/config.ts` to read `~/.ctx/config.json` (apiKey, apiEndpoint, githubToken, autoCapture settings)
    - Create `packages/cli/src/api-client.ts` as HTTP client for API Gateway calls with API key header
    - _Requirements: 5.1_

  - [x] 11.2 Implement git state collection
    - Create `packages/cli/src/git.ts` with functions to detect git repo, extract branch name, get last 5 commits, get uncommitted diff, get modified files list, get remote origin URL
    - Throw NotGitRepoError if not in a git repository
    - _Requirements: 1.1, 1.2, 1.5, 1.8_

  - [x] 11.3 Implement `ctx park` command
    - Create `packages/cli/src/commands/park.ts`
    - Collect git state, optional note (--note flag), optional terminal history (--history flag)
    - Derive project ID, construct snapshot payload, send to POST /snapshots
    - Display confirmation message with project name and timestamp on success
    - Display appropriate error messages for git errors, validation errors, storage errors
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9_

  - [x] 11.4 Implement `ctx resume` command
    - Create `packages/cli/src/commands/resume.ts`
    - If project name provided, call GET /snapshots/{project}/latest and display briefing
    - If no project name, call GET /projects and display sorted project list
    - Handle not-found error with "No context has been captured for project '<name>'" message
    - Handle briefing fallback (display raw data with warning when AI generation failed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 11.5 Implement `ctx list`, `ctx delete`, and `ctx history` commands
    - Create `packages/cli/src/commands/list.ts` — display projects with name, timestamp, truncated summary; handle empty state
    - Create `packages/cli/src/commands/delete.ts` — prompt for confirmation, call DELETE /projects/{project}, display success/cancellation message
    - Create `packages/cli/src/commands/history.ts` — display up to 10 snapshots with timestamp and truncated summary; handle not-found
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement Web Dashboard
  - [x] 13.1 Set up React SPA with authentication
    - Create `packages/web/` with React + TypeScript + Vite setup
    - Implement login page and session management (30-minute inactivity timeout)
    - Redirect unauthenticated users to login page
    - Configure API client to use same API Gateway endpoints
    - _Requirements: 6.1, 6.2, 6.6_

  - [x] 13.2 Implement project list and briefing views
    - Create project list view showing all projects with last park timestamp and one-line summary
    - Create project detail view showing full resumption briefing for latest snapshot
    - Create snapshot history panel showing last 10 snapshots with timestamps and summaries
    - Handle empty state (no projects), error state (retrieval failure), and loading states
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.7, 6.8_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The CLI uses commander.js for subcommand parsing
- All Lambda handlers share the data access layer from packages/lambdas/src/data/
- Infrastructure is defined with AWS CDK in packages/infra/
- fast-check is used for all property-based tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.3", "2.5", "2.7"] },
    { "id": 3, "tasks": ["2.2", "2.4", "2.6", "2.8", "4.1", "4.2"] },
    { "id": 4, "tasks": ["4.3", "5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "5.4", "6.1", "6.2", "7.1", "7.2", "7.3", "8.1"] },
    { "id": 6, "tasks": ["6.3", "8.2", "10.1", "10.2"] },
    { "id": 7, "tasks": ["11.1"] },
    { "id": 8, "tasks": ["11.2"] },
    { "id": 9, "tasks": ["11.3", "11.4", "11.5"] },
    { "id": 10, "tasks": ["13.1"] },
    { "id": 11, "tasks": ["13.2"] }
  ]
}
```
