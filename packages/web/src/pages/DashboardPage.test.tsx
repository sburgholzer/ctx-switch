import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthProvider } from "../auth";
import { DashboardPage } from "./DashboardPage";

const mockGetProjects = vi.fn();
const mockGetLatestSnapshot = vi.fn();
const mockGetSnapshotHistory = vi.fn();

vi.mock("../api", () => ({
  ApiClient: vi.fn().mockImplementation(() => ({
    getProjects: mockGetProjects,
    getLatestSnapshot: mockGetLatestSnapshot,
    getSnapshotHistory: mockGetSnapshotHistory,
  })),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  },
}));

function renderDashboard() {
  sessionStorage.setItem("ctx-switch-api-key", "test-api-key");
  sessionStorage.setItem("ctx-switch-last-activity", Date.now().toString());

  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route
            path="/projects/:projectId"
            element={<div data-testid="project-detail">Detail</div>}
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("shows loading state while fetching projects", () => {
    mockGetProjects.mockReturnValue(new Promise(() => {})); // never resolves

    renderDashboard();
    expect(screen.getByText("Loading projects…")).toBeInTheDocument();
  });

  it("shows empty state when no projects exist", async () => {
    mockGetProjects.mockResolvedValue({ projects: [] });

    renderDashboard();

    await waitFor(() => {
      expect(
        screen.getByText("No projects have been captured")
      ).toBeInTheDocument();
    });
  });

  it("displays project list with names, timestamps, and summaries", async () => {
    mockGetProjects.mockResolvedValue({
      projects: [
        {
          projectName: "my-project",
          projectId: "proj-123",
          lastParkTimestamp: "2024-01-15T10:30:00Z",
          summary: "Working on auth module",
        },
        {
          projectName: "other-project",
          projectId: "proj-456",
          lastParkTimestamp: "2024-01-14T08:00:00Z",
          summary: "Fixing tests",
        },
      ],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("my-project")).toBeInTheDocument();
    });

    expect(screen.getByText("other-project")).toBeInTheDocument();
    expect(screen.getByText("Working on auth module")).toBeInTheDocument();
    expect(screen.getByText("Fixing tests")).toBeInTheDocument();
  });

  it("shows error state when API call fails", async () => {
    mockGetProjects.mockRejectedValue(new Error("Network error"));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("navigates to project detail when a project is clicked", async () => {
    mockGetProjects.mockResolvedValue({
      projects: [
        {
          projectName: "my-project",
          projectId: "proj-123",
          lastParkTimestamp: "2024-01-15T10:30:00Z",
          summary: "Working on auth module",
        },
      ],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("my-project")).toBeInTheDocument();
    });

    const projectBtn = screen.getByRole("button", {
      name: "View project my-project",
    });
    projectBtn.click();

    await waitFor(() => {
      expect(screen.getByTestId("project-detail")).toBeInTheDocument();
    });
  });
});
