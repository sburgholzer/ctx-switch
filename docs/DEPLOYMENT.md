# Deployment Guide

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 22+
- AWS CDK CLI (`npm install -g aws-cdk`)

## Infrastructure Overview

The CDK stack (`ContextSwitcherStack`) deploys:

| Resource | Name | Purpose |
|----------|------|---------|
| DynamoDB Table | `ctx-switch-context-store` | All application data |
| S3 Bucket | `ctx-switch-snapshot-archive-{accountId}` | Large snapshot overflow |
| API Gateway | Context Switcher API | REST API (stage: v1) |
| Lambda (x7) | `ctx-switch-*` | All business logic |
| EventBridge Rule | `ctx-switch-auto-capture-schedule` | Scheduled auto-capture |

## Deploy

### First-Time Setup

```bash
# Install dependencies
npm install

# Build all packages (lambdas need to be compiled before deploy)
npm run build

# Bootstrap CDK (one-time per account/region)
cd packages/infra
npx cdk bootstrap

# Deploy the stack
npx cdk deploy
```

### Subsequent Deploys

```bash
npm run build
cd packages/infra
npx cdk deploy
```

### Environment Variables

The CDK stack automatically configures Lambda environment variables:

| Variable | Source | Description |
|----------|--------|-------------|
| `TABLE_NAME` | Stack output | DynamoDB table name |
| `BUCKET_NAME` | Stack output | S3 bucket name |
| `GSI1_INDEX_NAME` | Hardcoded | `GSI1` |
| `BEDROCK_MODEL_ID` | Default | `anthropic.claude-sonnet-4-6` |

## Post-Deploy Configuration

### 1. Create an API Key

After deploying, manually create an API key record in DynamoDB:

```json
{
  "PK": "APIKEY#ctx-your-unique-key",
  "SK": "APIKEY#ctx-your-unique-key",
  "userId": "your-user-id",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 2. Configure the CLI

Create `~/.ctx/config.json` with the API endpoint from stack outputs:

```json
{
  "apiKey": "ctx-your-unique-key",
  "apiEndpoint": "https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/v1"
}
```

### 3. Enable Bedrock Model Access

In the AWS Console, navigate to Amazon Bedrock → Model Access and enable access to the Claude model used by the stack (default: `anthropic.claude-sonnet-4-6`).

### 4. (Optional) Configure GitHub Integration

Add a GitHub personal access token to your config:

```json
{
  "apiKey": "ctx-your-key",
  "apiEndpoint": "https://...",
  "githubToken": "ghp_your_github_token"
}
```

The token needs `repo` scope to read PR and review comment data.

### 5. (Optional) Enable Auto-Capture

The EventBridge rule is deployed disabled by default. To enable:

1. Go to AWS Console → EventBridge → Rules
2. Find `ctx-switch-auto-capture-schedule`
3. Enable the rule
4. Configure target input with your userId

Or update the CDK stack to set `enabled: true` and redeploy.

## Stack Outputs

After deployment, the stack exports:

| Output | Description |
|--------|-------------|
| `ContextSwitcherApiEndpoint` | Full API Gateway URL |
| `ContextSwitcherTableName` | DynamoDB table name |
| `ContextSwitcherBucketName` | S3 bucket name |

## Destroy

```bash
cd packages/infra
npx cdk destroy
```

Note: DynamoDB table and S3 bucket have `RemovalPolicy.RETAIN` — they won't be deleted with the stack. Remove them manually if needed.

## Monitoring

- Lambda logs → CloudWatch Logs (`/aws/lambda/ctx-switch-*`)
- API Gateway logs → CloudWatch Logs (if access logging enabled)
- DynamoDB metrics → CloudWatch Metrics (read/write capacity, throttled requests)

## Cost Estimate

For a single developer with moderate usage (10 parks/day, 5 resumes/day):

| Service | Estimated Monthly Cost |
|---------|----------------------|
| DynamoDB (on-demand) | ~$0.25 |
| S3 (overflow, rare) | ~$0.01 |
| Lambda (invocations) | ~$0.10 |
| API Gateway | ~$0.35 |
| Bedrock (Claude Haiku) | ~$1-3 |
| **Total** | **~$2-4/month** |
