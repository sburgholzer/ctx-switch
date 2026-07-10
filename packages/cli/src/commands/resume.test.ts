import { describe, it, expect, vi } from "vitest";
import { resumeCommand } from "./resume.js";
import type { ApiClient } from "../api-client.js";
import type { ResumeCommandDeps } from "./resume.js";

function createMockDeps(): { deps: ResumeCommandDeps; output: string[] } {
  const output: string[] = [];
  const mockApiClient: ApiClient = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  };
  return {
    deps: {
      apiClient: mockApiClient,
      output: (msg: string) => output.push(msg),
    },
    output,
  };
}

describe("resumeCommand", () => {
  describe("with project name (resume briefing)", () => {
    it("displays the briefing when API returns success with fallback=false", async () => {
      const { deps, output } = createMockDeps();
      const briefing = "## Last Session Summary\nWorking on auth module.";

      (deps.apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(
          JSON.stringify({
            projectId: "abc123",
            projectName: "my-app",
            briefing,
            fallback: false,
          }),
          { status: 200 }
        )
      );

      await resumeCommand("my-app", deps);

      expect(deps.apiClient.get).toHaveBeenCalledWith(
        "/snapshots/my-app/latest"
      );
      expect(output).toHaveLength(1);
      expect(output[0]).toBe(briefing);
    });

    it("displays raw data with warning when fallback=true", async () => {
      const { deps, output } = createMockDeps();
      const snapshotData = {
        projectId: "abc123",
        git: { branch: "main", lastCommits: ["fix: bug"] },
      };

      (deps.apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(
          JSON.stringify({
            projectId: "abc123",
            projectName: "my-app",
            snapshot: snapshotData,
            fallback: true,
            fallbackReason: "Bedrock timeout",
          }),
          { status: 200 }
        )
      );

      await resumeCommand("my-app", deps);

      expect(output[0]).toBe(
        "AI briefing generation failed. Showing raw context data:"
      );
      expect(output[1]).toBe("");
      expect(output[2]).toBe(JSON.stringify(snapshotData, null, 2));
    });

    it("displays not-found message on 404", async () => {
      const { deps, output } = createMockDeps();

      (deps.apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "No context has been captured for project 'unknown-project'",
          }),
          { status: 404 }
        )
      );

      await resumeCommand("unknown-project", deps);

      expect(output).toHaveLength(1);
      expect(output[0]).toBe(
        "No context has been captured for project 'unknown-project'"
      );
    });

    it("displays auth error on 401", async () => {
      const { deps, output } = createMockDeps();

      (deps.apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        })
      );

      await resumeCommand("my-app", deps);

      expect(output).toHaveLength(1);
      expect(output[0]).toBe(
        "Authentication failed. Check your API key in ~/.ctx/config.json"
      );
    });

    it("displays generic error for other failure statuses", async () => {
      const { deps, output } = createMockDeps();

      (deps.apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ error: "Server error" }), {
          status: 500,
          statusText: "Internal Server Error",
        })
      );

      await resumeCommand("my-app", deps);

      expect(output).toHaveLength(1);
      expect(output[0]).toBe(
        "Error retrieving context: Internal Server Error"
      );
    });

    it("URL-encodes the project name in the API path", async () => {
      const { deps, output } = createMockDeps();

      (deps.apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(
          JSON.stringify({
            projectId: "abc123",
            projectName: "my app/v2",
            briefing: "summary",
            fallback: false,
          }),
          { status: 200 }
        )
      );

      await resumeCommand("my app/v2", deps);

      expect(deps.apiClient.get).toHaveBeenCalledWith(
        "/snapshots/my%20app%2Fv2/latest"
      );
      expect(output[0]).toBe("summary");
    });
  });

  describe("without project name (list projects)", () => {
    it("displays formatted project rows when projects exist", async () => {
      const { deps, output } = createMockDeps();
      const projects = [
        {
          projectName: "my-app",
          lastParkTimestamp: "2024-03-15T14:30:00.000Z",
          summary: "Working on user authentication flow",
        },
        {
          projectName: "api-service",
          lastParkTimestamp: "2024-03-14T09:00:00.000Z",
          summary: "Refactoring database layer",
        },
      ];

      (deps.apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ projects }), { status: 200 })
      );

      await resumeCommand(undefined, deps);

      expect(deps.apiClient.get).toHaveBeenCalledWith("/projects");
      expect(output).toHaveLength(2);
      expect(output[0]).toContain("my-app");
      expect(output[0]).toContain("Working on user authentication flow");
      expect(output[1]).toContain("api-service");
      expect(output[1]).toContain("Refactoring database layer");
    });

    it("displays empty state message when no projects exist", async () => {
      const { deps, output } = createMockDeps();

      (deps.apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ projects: [] }), { status: 200 })
      );

      await resumeCommand(undefined, deps);

      expect(output).toHaveLength(1);
      expect(output[0]).toBe("No projects have been captured");
    });

    it("displays auth error on 401 when listing projects", async () => {
      const { deps, output } = createMockDeps();

      (deps.apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        })
      );

      await resumeCommand(undefined, deps);

      expect(output).toHaveLength(1);
      expect(output[0]).toBe(
        "Authentication failed. Check your API key in ~/.ctx/config.json"
      );
    });

    it("displays error message on server failure when listing projects", async () => {
      const { deps, output } = createMockDeps();

      (deps.apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ error: "Server error" }), {
          status: 500,
          statusText: "Internal Server Error",
        })
      );

      await resumeCommand(undefined, deps);

      expect(output).toHaveLength(1);
      expect(output[0]).toBe(
        "Error retrieving projects: Internal Server Error"
      );
    });
  });
});
