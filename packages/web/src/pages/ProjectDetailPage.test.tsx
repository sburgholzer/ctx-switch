import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthProvider } from "../auth";
import { ProjectDetailPage } from "./ProjectDetailPage";

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

function renderProjectDetail(projectId = "proj-123") {
  sessionStorage.setItem("ctx-switch-api-key", "test-api-key");
  sessionStorage.setItem("ctx-switch-last-activity", Date.now().toString());

  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/"
            element={<div data-testid="dashboard">Dashboard</div>}
          />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("ProjectDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("shows loading state while fetching project data", () => {
    mockGetLatestSnapshot.mockReturnValue(new Promise(() => {}));
    mockGetSnapshotHistory.mockReturnValue(new Promise(() => {}));

    renderProjectDetail();
    expect(screen.getByText("Loading project…")).toBeInTheDocument();
  });

  it("displays briefing text on successful load", async () => {
    mockGetLatestSnapshot.mockResolvedValue({
      briefing: "Worked on auth module refactoring",
      fallback: false,
    });
    mockGetSnapshotHistory.mockResolvedValue({
      snapshots: [
        { timestamp: "2024-01-15T10:30:00Z", summary: "Auth work" },
      ],
    });

    renderProjectDetail();

    await waitFor(() => {
      expect(
        screen.getByText("Worked on auth module refactoring")
      ).toBeInTheDocument();
    });
  });

  it("displays snapshot history with timestamps and summaries", async () => {
    mockGetLatestSnapshot.mockResolvedValue({
      briefing: "Some briefing",
      fallback: false,
    });
    mockGetSnapshotHistory.mockResolvedValue({
      snapshots: [
        { timestamp: "2024-01-15T10:30:00Z", summary: "Added auth" },
        { timestamp: "2024-01-14T08:00:00Z", summary: "Fixed tests" },
        { timestamp: "2024-01-13T16:45:00Z", summary: "Initial setup" },
      ],
    });

    renderProjectDetail();

    await waitFor(() => {
      expect(screen.getByText("Added auth")).toBeInTheDocument();
    });
    expect(screen.getByText("Fixed tests")).toBeInTheDocument();
    expect(screen.getByText("Initial setup")).toBeInTheDocument();
  });

  it("shows error state when API call fails", async () => {
    mockGetLatestSnapshot.mockRejectedValue(new Error("Server error"));
    mockGetSnapshotHistory.mockRejectedValue(new Error("Server error"));

    renderProjectDetail();

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows fallback notice and raw data when briefing generation fails", async () => {
    mockGetLatestSnapshot.mockResolvedValue({
      briefing: "",
      fallback: true,
      rawSnapshot: { branch: "main", commits: ["fix bug"] },
    });
    mockGetSnapshotHistory.mockResolvedValue({ snapshots: [] });

    renderProjectDetail();

    await waitFor(() => {
      expect(
        screen.getByText(
          "AI briefing generation failed. Showing raw snapshot data."
        )
      ).toBeInTheDocument();
    });

    // Raw data should be displayed
    expect(screen.getByText(/fix bug/)).toBeInTheDocument();
  });

  it("shows back button that navigates to dashboard", async () => {
    mockGetLatestSnapshot.mockResolvedValue({
      briefing: "Briefing text",
      fallback: false,
    });
    mockGetSnapshotHistory.mockResolvedValue({ snapshots: [] });

    renderProjectDetail();

    await waitFor(() => {
      expect(screen.getByText("← Back to Projects")).toBeInTheDocument();
    });

    screen.getByText("← Back to Projects").click();

    await waitFor(() => {
      expect(screen.getByTestId("dashboard")).toBeInTheDocument();
    });
  });

  it("shows empty history message when no snapshots exist", async () => {
    mockGetLatestSnapshot.mockResolvedValue({
      briefing: "Some briefing",
      fallback: false,
    });
    mockGetSnapshotHistory.mockResolvedValue({ snapshots: [] });

    renderProjectDetail();

    await waitFor(() => {
      expect(screen.getByText("No snapshots available")).toBeInTheDocument();
    });
  });
});
