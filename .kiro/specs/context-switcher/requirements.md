# Requirements Document

## Introduction

Context Switcher is an AI-powered tool that captures a developer's working context when they pause work on a project and generates a resumption briefing when they return. The tool addresses the problem of context-switching overhead — the 10-15 minutes typically lost re-orienting when jumping between multiple projects. It provides a CLI and optional web dashboard backed by a serverless AWS architecture using Lambda, DynamoDB, and Amazon Bedrock for AI-generated briefings.

## Glossary

- **Context_Switcher**: The overall system comprising the CLI, API, and backend services
- **CLI**: The command-line interface through which developers interact with the Context Switcher (`ctx` command)
- **API_Gateway**: The AWS API Gateway that routes requests from the CLI and Web Dashboard to Lambda functions
- **Capture_Service**: The Lambda function responsible for collecting and storing project context snapshots
- **Resume_Service**: The Lambda function responsible for generating resumption briefings from stored snapshots
- **Snapshot**: A point-in-time capture of a developer's working context including git state, open files, notes, and terminal history
- **Briefing**: An AI-generated summary of prior work designed to help a developer resume a project quickly
- **Project**: A named working context associated with a local repository or workspace
- **Context_Store**: The DynamoDB table that persists project snapshots and metadata
- **Briefing_Generator**: The Amazon Bedrock integration that synthesizes snapshots into human-readable briefings
- **Web_Dashboard**: An optional web-based interface for viewing project contexts and briefings
- **GitHub_Integration**: An optional module that fetches commit history, PR status, and review comments from the GitHub API
- **Snapshot_Archive**: S3 storage for larger snapshot payloads that exceed DynamoDB item size limits

## Requirements

### Requirement 1: Park a Project

**User Story:** As a developer, I want to capture my current working context with a single command, so that I can switch to another project without losing track of what I was doing.

#### Acceptance Criteria

1. WHEN the developer executes the `ctx park` command inside a git repository, THE Capture_Service SHALL collect the current git branch name, the last 5 commit messages, and the current uncommitted diff
2. WHEN the developer executes the `ctx park` command, THE Capture_Service SHALL collect the list of files modified in the current working tree
3. WHEN the developer executes the `ctx park` command with a `--note` flag, THE Capture_Service SHALL store the provided free-text note (up to 5000 characters) alongside the snapshot
4. WHEN the developer executes the `ctx park` command with a `--history` flag, THE Capture_Service SHALL capture the last 50 lines of terminal history
5. WHEN context capture completes successfully, THE Capture_Service SHALL store the snapshot in the Context_Store with a timestamp and a project identifier derived from the git remote origin URL or the local directory name if no remote is configured
6. WHEN context capture completes successfully, THE CLI SHALL display a confirmation message including the project name and snapshot timestamp
7. IF the snapshot payload exceeds 400KB, THEN THE Capture_Service SHALL store the payload in the Snapshot_Archive and save a reference in the Context_Store
8. IF the developer executes the `ctx park` command outside a git repository, THEN THE CLI SHALL display an error message stating that the current directory is not a git repository and the capture cannot proceed
9. IF the Context_Store or Snapshot_Archive is unreachable during a park operation, THEN THE CLI SHALL display an error message indicating the storage failure and the snapshot was not saved

### Requirement 2: Resume a Project

**User Story:** As a developer, I want to receive a concise briefing when I return to a project, so that I can resume productive work within 1-2 minutes instead of 10-15 minutes.

#### Acceptance Criteria

1. WHEN the developer executes the `ctx resume <project-name>` command, THE Resume_Service SHALL retrieve the most recent snapshot for the specified project from the Context_Store, including any payloads stored in the Snapshot_Archive
2. WHEN the Resume_Service retrieves a snapshot, THE Briefing_Generator SHALL synthesize the snapshot data into a human-readable briefing containing: what was being worked on, the last changes made, any open issues or blockers noted, and suggested next steps
3. WHEN the briefing is generated, THE CLI SHALL display the briefing in a formatted output to the terminal
4. IF no snapshot exists for the specified project, THEN THE Resume_Service SHALL return an error message stating "No context has been captured for project '<project-name>'"
5. WHEN the developer executes the `ctx resume` command without a project name, THE CLI SHALL display a list of all available projects sorted by last park timestamp descending, with each entry showing the project name and its last park timestamp
6. THE Briefing_Generator SHALL return the briefing within 15 seconds of the resume request; IF generation exceeds 15 seconds, THEN THE CLI SHALL display the raw snapshot data as a fallback
7. IF the Briefing_Generator encounters an error during generation, THEN THE CLI SHALL display the raw snapshot data and a message indicating that AI briefing generation failed

### Requirement 3: Project Listing and Management

**User Story:** As a developer, I want to view and manage my captured project contexts, so that I can keep track of all my active work streams and clean up stale entries.

#### Acceptance Criteria

1. WHEN the developer executes the `ctx list` command, THE CLI SHALL display all projects with their name, last park timestamp, and a summary of the last snapshot truncated to 80 characters
2. WHEN the developer executes the `ctx delete <project-name>` command, THE CLI SHALL prompt the developer for confirmation before proceeding, and WHEN confirmed, THE Context_Store SHALL remove all snapshots and associated Snapshot_Archive data for the specified project and THE CLI SHALL display a success message including the project name and the number of snapshots removed
3. WHEN the developer executes the `ctx history <project-name>` command, THE CLI SHALL display up to 10 of the most recent snapshots for the specified project, each showing its timestamp and a summary truncated to 80 characters, ordered from newest to oldest
4. IF the developer attempts to delete a project that does not exist, THEN THE CLI SHALL display an error message stating the project was not found
5. IF the developer executes `ctx list` and no projects exist, THEN THE CLI SHALL display a message indicating no projects have been captured
6. IF the developer executes `ctx history` with a project name that does not exist, THEN THE CLI SHALL display an error message stating the project was not found
7. IF the developer declines the delete confirmation prompt, THEN THE CLI SHALL cancel the operation and display a message indicating no data was removed

### Requirement 4: GitHub Integration

**User Story:** As a developer, I want my context captures to include GitHub PR and review status, so that my resumption briefing reminds me of pending code review feedback.

#### Acceptance Criteria

1. WHERE GitHub_Integration is configured, WHEN the developer executes the `ctx park` command, THE Capture_Service SHALL fetch a maximum of 20 open pull requests authored by the developer for the current repository
2. WHERE GitHub_Integration is configured, THE Capture_Service SHALL include up to 50 unresolved review comments across all open pull requests in the snapshot, where "unresolved" means a review comment that has not been marked as resolved in GitHub
3. WHERE GitHub_Integration is configured, THE Briefing_Generator SHALL include unresolved PR review comments and each comment's resolution status (open, resolved, or dismissed) in the resumption briefing
4. IF the GitHub API returns an error (including authentication failure, rate limiting, network timeout, or server error), THEN THE Capture_Service SHALL log the error and continue capturing other context data without failing the entire operation
5. WHERE GitHub_Integration is configured, THE Capture_Service SHALL enforce a maximum response timeout of 10 seconds per GitHub API request, treating any timeout as a retrieval failure

### Requirement 5: API Gateway and Authentication

**User Story:** As a developer, I want my context data to be securely accessible only by me, so that my working state and notes remain private.

#### Acceptance Criteria

1. THE API_Gateway SHALL require a registered, non-revoked API key in the request header for all requests to the capture, resume, list, delete, and history endpoints
2. IF a request is received with a missing API key or an API key that is not registered or has been revoked, THEN THE API_Gateway SHALL return a 401 Unauthorized response with no snapshot data in the response body
3. THE Context_Store SHALL associate all snapshots with the authenticated developer's identity derived from the validated API key
4. IF a developer requests context for a project that belongs to a different developer, THEN THE Resume_Service SHALL return the same response as if the project does not exist
5. WHEN the developer executes a delete or list command, THE Context_Store SHALL restrict the operation to only snapshots belonging to the authenticated developer

### Requirement 6: Web Dashboard

**User Story:** As a developer, I want a web-based view of my project contexts and briefings, so that I can review my work status from a browser without using the terminal.

#### Acceptance Criteria

1. WHEN a developer accesses the Web_Dashboard without a valid session, THE Web_Dashboard SHALL redirect the developer to a login page
2. WHEN the developer authenticates successfully, THE Web_Dashboard SHALL display only projects belonging to the authenticated developer
3. WHILE the developer is authenticated, THE Web_Dashboard SHALL display a list of all projects with their last park timestamp and one-line summary
4. WHEN the developer selects a project, THE Web_Dashboard SHALL display the full resumption briefing for the most recent snapshot
5. WHEN the developer selects a project, THE Web_Dashboard SHALL display the last 10 snapshots for that project with their timestamps and summary lines
6. IF the developer's session has been inactive for more than 30 minutes, THEN THE Web_Dashboard SHALL redirect the developer back to the login page and require re-authentication
7. IF the Web_Dashboard fails to retrieve project data or generate a briefing, THEN THE Web_Dashboard SHALL display an error message indicating the retrieval failure and retain the developer's current view
8. IF the authenticated developer has no projects in the Context_Store, THEN THE Web_Dashboard SHALL display a message indicating no projects have been captured

### Requirement 7: Scheduled Auto-Capture

**User Story:** As a developer, I want my context to be automatically captured at the end of my workday, so that I have a snapshot even if I forget to park manually.

#### Acceptance Criteria

1. WHERE scheduled auto-capture is configured, THE Capture_Service SHALL execute a context capture for all configured projects (up to a maximum of 20 projects) at the developer-specified schedule time, collecting the current git branch name, the last 5 commit messages, and any developer-provided notes stored with the project
2. WHERE scheduled auto-capture is configured, THE Capture_Service SHALL use EventBridge to trigger the scheduled capture based on a developer-configured cron expression
3. WHEN an auto-capture completes successfully, THE Capture_Service SHALL store the snapshot in the Context_Store with a source field value of "auto" to distinguish it from manual captures
4. IF an auto-capture fails for a project, THEN THE Capture_Service SHALL log the failure including the project name and error reason, skip that project without retrying, and continue capturing remaining configured projects
5. WHEN all auto-captures in a scheduled run complete, THE Capture_Service SHALL record a summary indicating the number of projects successfully captured and the number of projects that failed

### Requirement 8: Briefing Quality and Format

**User Story:** As a developer, I want my resumption briefings to be concise, actionable, and consistently formatted, so that I can scan them quickly and get back to work.

#### Acceptance Criteria

1. THE Briefing_Generator SHALL produce briefings containing the following sections in this order: "Last Session Summary", "Key Changes", "Open Items", and "Suggested Next Steps"
2. THE Briefing_Generator SHALL limit the briefing length to a maximum of 500 words
3. WHEN generating a briefing, THE Briefing_Generator SHALL derive the "Last Session Summary" and "Key Changes" sections from the most recent snapshot data, and SHALL include any developer-provided notes verbatim in the "Open Items" section
4. THE Briefing_Generator SHALL use only terminology that appears in the developer's project files, commit messages, or notes captured in the snapshot
5. IF a briefing section has no relevant data in the snapshot, THEN THE Briefing_Generator SHALL display the section heading followed by a "None" indicator
