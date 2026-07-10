import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiClient, type ProjectListResponse } from "../api";
import { useAuth } from "../auth";

type Project = ProjectListResponse["projects"][number];

export function DashboardPage() {
  const { apiKey } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;

    const client = new ApiClient(apiKey);
    let cancelled = false;

    async function fetchProjects() {
      try {
        setLoading(true);
        setError(null);
        const response = await client.getProjects();
        if (!cancelled) {
          setProjects(response.projects);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to retrieve projects"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchProjects();
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  if (loading) {
    return (
      <div className="dashboard" role="status" aria-label="Loading projects">
        <p>Loading projects…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard" role="alert">
        <h2>Projects</h2>
        <p className="error-message">{error}</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="dashboard">
        <h2>Projects</h2>
        <p>No projects have been captured</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h2>Projects</h2>
      <ul className="project-list" role="list">
        {projects.map((project) => (
          <li key={project.projectId} className="project-item">
            <button
              className="project-link"
              onClick={() => navigate(`/projects/${project.projectId}`)}
              aria-label={`View project ${project.projectName}`}
            >
              <span className="project-name">{project.projectName}</span>
              <span className="project-timestamp">
                {new Date(project.lastParkTimestamp).toLocaleString()}
              </span>
              <span className="project-summary">{project.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
