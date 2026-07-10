# Context Switcher (`ctx`)

AI-powered context capture and resumption tool for developers. Park your working state when switching projects and get an AI-generated briefing when you return — reducing context-switching overhead from 10-15 minutes to under 2 minutes.

## How It Works

```
$ ctx park --note "Debugging auth token expiry"
Context captured for my-api at 2024-03-15T14:30:00.000Z

$ ctx resume my-api
## Last Session Summary
You were debugging JWT token expiry in the auth module on the feature/auth branch.

## Key Changes
- Modified token validation logic in src/auth/jwt.ts
- Added refresh token rotation

## Open Items
- Debugging auth token expiry

## Suggested Next Steps
1. Add integration test for token refresh flow
2. Verify expiry edge case with 0-second TTL
```

## Features

- **One-command capture** — `ctx park` snapshots your git state, branch, recent commits, diff, and optional notes
- **AI-powered briefings** — Amazon Bedrock generates structured resumption briefings from your snapshot data
- **GitHub integration** — Optionally captures open PRs and unresolved review comments
- **Project management** — List, browse history, and delete captured contexts
- **Scheduled auto-capture** — EventBridge-driven daily snapshots so you never forget to park
- **Web dashboard** — Browser-based view of your projects and briefings
- **Secure by default** — API key authentication with tenant isolation

## Architecture

```
┌─────────┐     ┌─────────────┐     ┌──────────────────┐
│  CLI    │────▶│ API Gateway │────▶│  Lambda Handlers │
│  (ctx)  │     │ + Authorizer│     │  (capture, resume│
└─────────┘     └─────────────┘     │   list, delete,  │
                       ▲             │   history, auto) │
┌─────────┐            │             └────────┬─────────┘
│   Web   │────────────┘                      │
│Dashboard│                          ┌────────┴─────────┐
└─────────┘                          │                  │
                              ┌──────┴──┐   ┌──────────┴──┐
                              │ DynamoDB │   │     S3      │
                              │(context) │   │ (overflow)  │
                              └──────────┘   └─────────────┘
                                      │
                              ┌───────┴────────┐
                              │ Amazon Bedrock │
                              │  (briefings)   │
                              └────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 22+
- npm 10+
- AWS account (for deployment)
- Git

### Install & Build

```bash
git clone https://github.com/sburgholzer/ctx-switch.git
cd ctx-switch
npm install
npm run build
```

### Run Tests

```bash
npm test              # Run all 462 tests
npm run test:watch    # Watch mode
```

### Configure the CLI

Create `~/.ctx/config.json`:

```json
{
  "apiKey": "your-api-key-here",
  "apiEndpoint": "https://your-api-id.execute-api.us-east-1.amazonaws.com/v1",
  "githubToken": "ghp_optional_github_token",
  "autoCapture": {
    "enabled": false,
    "schedule": "0 17 * * MON-FRI",
    "projects": []
  }
}
```

### Deploy Infrastructure

```bash
cd packages/infra
npx cdk deploy
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `ctx park [--note "text"] [--history]` | Capture current working context |
| `ctx resume [project-name]` | Get AI briefing (or list projects if no name) |
| `ctx list` | List all captured projects |
| `ctx history <project-name>` | Show last 10 snapshots for a project |
| `ctx delete <project-name>` | Delete a project and all its snapshots |

## Project Structure

```
ctx-switch/
├── packages/
│   ├── shared/       # Core types, validation, utilities
│   ├── lambdas/      # AWS Lambda handlers + data layer
│   ├── cli/          # ctx command-line tool
│   ├── web/          # React dashboard (SPA)
│   └── infra/        # AWS CDK infrastructure
├── package.json      # Root workspace config
├── tsconfig.json     # TypeScript project references
└── vitest.config.ts  # Test runner config
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed design documentation.

## Development

This is a TypeScript monorepo using npm workspaces. All packages share a common TypeScript configuration and test runner.

```bash
npm run build         # Build all packages
npm test              # Run all tests
npm run test:watch    # Watch mode for development
```

### Package Dependencies

```
shared ◀── lambdas
shared ◀── cli
shared ◀── web
lambdas ◀── infra
```

## Documentation

- [Architecture & Design](docs/ARCHITECTURE.md) — System design, data models, API endpoints
- [Contributing](CONTRIBUTING.md) — Development workflow, testing, and code style
- [Deployment](docs/DEPLOYMENT.md) — AWS deployment guide

## License

MIT
