# Architecture

## Overview

Context Switcher follows a thin-client, serverless architecture. The CLI and web dashboard are lightweight frontends that delegate all business logic to Lambda functions accessed through API Gateway.

## System Components

### Client Layer

- **CLI (`ctx`)** — Node.js/TypeScript binary using commander.js. Handles git state collection locally, then sends payloads to the API.
- **Web Dashboard** — React SPA with Vite. Authenticates via API key stored in session, calls the same API endpoints.

### API Layer

- **API Gateway** — REST API with custom Lambda authorizer validating `x-api-key` header
- **Authorizer Lambda** — Looks up API keys in DynamoDB, returns IAM policy with userId in context

### Compute Layer

| Lambda | Trigger | Purpose |
|--------|---------|---------|
| Capture | POST /snapshots | Validate and store context snapshots |
| Resume | GET /snapshots/{project}/latest | Generate AI briefing from latest snapshot |
| List | GET /projects | Return all projects for user |
| Delete | DELETE /projects/{project} | Remove project and all snapshots |
| History | GET /snapshots/{project}/history | Return last 10 snapshots |
| Auto-Capture | EventBridge schedule | Scheduled context capture for configured projects |

### Data Layer

- **DynamoDB** — Single-table design for all entities (snapshots, projects, API keys)
- **S3** — Overflow storage for snapshots exceeding 400KB (DynamoDB item limit)

### Integration Layer

- **Amazon Bedrock** — Generates 4-section resumption briefings (Claude model)
- **GitHub API** — Optional PR and review comment fetching
- **EventBridge** — Cron-based scheduling for auto-capture

## Data Model

### DynamoDB Single-Table Design

| PK | SK | Entity |
|----|----|--------|
| `USER#{userId}` | `PROJECT#{projectId}` | Project record |
| `USER#{userId}` | `SNAPSHOT#{projectId}#{timestamp}` | Snapshot |
| `APIKEY#{keyValue}` | `APIKEY#{keyValue}` | API key |

**GSI-1** (Auto-capture lookup):
| GSI1PK | GSI1SK |
|--------|--------|
| `AUTOCAP#{userId}` | `PROJECT#{projectId}` |

### Access Patterns

1. List user's projects → PK = `USER#{userId}`, SK begins_with `PROJECT#`
2. Get latest snapshot → PK = `USER#{userId}`, SK begins_with `SNAPSHOT#{projectId}#`, reverse, limit 1
3. Get snapshot history → Same as above, limit 10
4. Delete project → Batch delete all `SNAPSHOT#{projectId}#` + delete `PROJECT#{projectId}`
5. Validate API key → Get item PK/SK = `APIKEY#{key}`
6. Auto-capture projects → GSI-1 PK = `AUTOCAP#{userId}`

### S3 Key Format

```
{userId}/{projectId}/{timestamp}.json
```

90-day lifecycle policy for automatic cleanup.

## Snapshot Schema

```typescript
interface Snapshot {
  projectId: string;          // SHA-256 hash (16 hex chars) of git remote or path
  projectName: string;        // Human-readable project name
  timestamp: string;          // ISO 8601
  source: "manual" | "auto";
  git: {
    branch: string;
    lastCommits: string[];    // max 5
    uncommittedDiff: string;
    modifiedFiles: string[];
  };
  note?: string;              // max 5000 chars
  terminalHistory?: string[]; // max 50 lines
  github?: {
    pullRequests: PullRequest[];      // max 20
    unresolvedComments: ReviewComment[]; // max 50
  };
}
```

## Briefing Format

AI-generated briefings follow a fixed 4-section structure (max 500 words):

```
## Last Session Summary
[paragraph describing what was being worked on]

## Key Changes
[bullet list of recent changes]

## Open Items
[bullet list — developer notes appear verbatim here]

## Suggested Next Steps
[numbered list of recommended actions]
```

Sections with no data display "None". If Bedrock fails or times out (>15s), raw snapshot data is returned as fallback.

## Error Handling Strategy

| Category | Behavior |
|----------|----------|
| Git errors | Abort with clear message |
| Auth errors | Return 401, no data leaked |
| Storage errors | Abort, inform user |
| GitHub failures | Log and continue (graceful degradation) |
| Bedrock failures | Fall back to raw data display |
| Auto-capture failures | Log, skip project, continue to next |

## Security

- **Tenant isolation** — All DynamoDB queries scoped by PK = `USER#{userId}`. Cross-user access returns same response as non-existent project.
- **API key validation** — Custom authorizer checks key status before every request. Revoked keys are immediately denied.
- **No data in error responses** — 401 responses never include snapshot data.
- **Session timeout** — Web dashboard clears session after 30 minutes of inactivity.

## Testing Strategy

- **Property-based tests** (fast-check, 100+ iterations) — Validate correctness properties like deterministic ID derivation, field limit enforcement, overflow routing, tenant isolation, sort ordering
- **Unit tests** — Cover all Lambda handlers, CLI commands, and utility functions with mocked dependencies
- **462 total tests** across 42 test files
