# Contributing

## Development Setup

```bash
# Clone and install
git clone https://github.com/sburgholzer/ctx-switch.git
cd ctx-switch
npm install

# Build all packages
npm run build

# Run tests
npm test
```

## Monorepo Structure

This project uses npm workspaces with TypeScript project references. Each package in `packages/` is independently buildable but shares common configuration.

```
packages/
├── shared/    → @ctx-switch/shared   (types, utilities, constants)
├── lambdas/   → @ctx-switch/lambdas  (AWS Lambda handlers)
├── cli/       → @ctx-switch/cli      (ctx command-line tool)
├── web/       → @ctx-switch/web      (React dashboard)
└── infra/     → @ctx-switch/infra    (CDK infrastructure)
```

### Dependency Rules

- `shared` has no internal dependencies (pure types and utilities)
- `lambdas` depends on `shared`
- `cli` depends on `shared`
- `web` depends on `shared`
- `infra` depends on `lambdas` (for asset bundling references)

## Development Workflow

### Making Changes

1. Make your changes in the relevant package(s)
2. Run `npm run build` to verify TypeScript compilation
3. Run `npm test` to verify all tests pass
4. Commit with a descriptive message

### Adding New Functionality

- New shared types/utilities → `packages/shared/src/`
- New Lambda handlers → `packages/lambdas/src/handlers/`
- New CLI commands → `packages/cli/src/commands/`
- New web pages → `packages/web/src/pages/`
- Infrastructure changes → `packages/infra/lib/`

### Test Files

Test files live alongside the code they test:

```
src/
├── validation.ts
├── validation.test.ts              # Unit tests
└── validation.property.test.ts     # Property-based tests
```

## Testing

### Running Tests

```bash
npm test                    # All tests (fast, ~3s)
npm run test:watch          # Watch mode for development
npx vitest run packages/shared  # Single package only
```

### Writing Tests

- **Unit tests** — Use vitest with mocked dependencies. Name: `*.test.ts`
- **Property-based tests** — Use fast-check with minimum 100 iterations. Name: `*.property.test.ts`

### Property-Based Testing Guidelines

Property tests validate universal correctness invariants:

```typescript
import fc from "fast-check";

it("project ID derivation is deterministic", () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1 }), (input) => {
      const first = deriveProjectId(input);
      const second = deriveProjectId(input);
      expect(first).toBe(second);
    }),
    { numRuns: 100 }
  );
});
```

When generating timestamps, use integer milliseconds to avoid invalid date issues:

```typescript
// Good — always produces valid dates
const timestampArb = fc
  .integer({ min: 1577836800000, max: 1924991999000 })
  .map((ms) => new Date(ms).toISOString());

// Bad — fc.date() can produce invalid values
const timestampArb = fc.date().map((d) => d.toISOString());
```

## Code Style

- TypeScript strict mode enabled
- ES modules (`"type": "module"`)
- Explicit return types on exported functions
- JSDoc comments on all public functions
- Error classes with discriminant `code` property
- Constants in UPPER_SNAKE_CASE

## Commit Messages

Follow conventional commits:

```
feat: add snapshot history pagination
fix: handle empty git log in new repos
docs: update deployment guide
test: add property test for briefing word count
refactor: extract DynamoDB key utilities to shared
```

## Common Tasks

### Add a new Lambda handler

1. Create `packages/lambdas/src/handlers/my-handler.ts`
2. Create `packages/lambdas/src/handlers/my-handler.test.ts`
3. Add Lambda function to CDK stack in `packages/infra/lib/context-switcher-stack.ts`
4. Add API Gateway route if needed
5. Run tests: `npm test`

### Add a new CLI command

1. Create `packages/cli/src/commands/my-command.ts`
2. Create `packages/cli/src/commands/my-command.test.ts`
3. Register in `packages/cli/src/index.ts`
4. Run tests: `npm test`

### Add a new shared utility

1. Create `packages/shared/src/my-utility.ts`
2. Create `packages/shared/src/my-utility.test.ts`
3. Export from `packages/shared/src/index.ts`
4. Run tests: `npm test`
