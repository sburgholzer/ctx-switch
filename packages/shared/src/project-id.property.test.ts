import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { deriveProjectId } from "./project-id.js";

/**
 * Feature: context-switcher, Property 3: Project identifier derivation is deterministic
 * Validates: Requirements 1.5
 */
describe("Property 3: Project identifier derivation is deterministic", () => {
  // Arbitrary: HTTPS git remote URLs
  const httpsRemoteArb = fc
    .record({
      host: fc.stringMatching(/^[a-z0-9]{1,20}$/),
      user: fc.stringMatching(/^[a-z0-9_-]{1,20}$/),
      repo: fc.stringMatching(/^[a-z0-9_-]{1,30}$/),
      hasDotGit: fc.boolean(),
    })
    .map(({ host, user, repo, hasDotGit }) => `https://${host}.com/${user}/${repo}${hasDotGit ? ".git" : ""}`);

  // Arbitrary: SSH git remote URLs
  const sshRemoteArb = fc
    .record({
      host: fc.stringMatching(/^[a-z0-9]{1,20}$/),
      user: fc.stringMatching(/^[a-z0-9_-]{1,20}$/),
      repo: fc.stringMatching(/^[a-z0-9_-]{1,30}$/),
      hasDotGit: fc.boolean(),
    })
    .map(({ host, user, repo, hasDotGit }) => `git@${host}.com:${user}/${repo}${hasDotGit ? ".git" : ""}`);

  // Arbitrary: Local directory paths (Unix-style)
  const localPathArb = fc
    .array(fc.stringMatching(/^[a-z0-9_.-]{1,20}$/), { minLength: 1, maxLength: 6 })
    .map((parts) => `/${parts.join("/")}`);

  // Combined arbitrary for diverse inputs
  const gitInputArb = fc.oneof(httpsRemoteArb, sshRemoteArb, localPathArb);

  it("produces the same output when called multiple times with the same input (deterministic)", () => {
    fc.assert(
      fc.property(gitInputArb, (input) => {
        const first = deriveProjectId(input);
        const second = deriveProjectId(input);
        const third = deriveProjectId(input);
        expect(first).toBe(second);
        expect(second).toBe(third);
      }),
      { numRuns: 100 }
    );
  });

  it("always produces a non-empty string", () => {
    fc.assert(
      fc.property(gitInputArb, (input) => {
        const result = deriveProjectId(input);
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it("always produces exactly 16 hex characters", () => {
    fc.assert(
      fc.property(gitInputArb, (input) => {
        const result = deriveProjectId(input);
        expect(result).toHaveLength(16);
        expect(result).toMatch(/^[0-9a-f]{16}$/);
      }),
      { numRuns: 100 }
    );
  });

  it("same input always produces same output across arbitrary strings (idempotency)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 200 }), (input) => {
        const first = deriveProjectId(input);
        const second = deriveProjectId(input);
        expect(first).toBe(second);
      }),
      { numRuns: 100 }
    );
  });
});
