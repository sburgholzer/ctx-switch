import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ApiClient,
  type BriefingResponse,
  type SnapshotHistoryResponse,
} from "../api";
import { useAuth } from "../auth";

type Snapshot = SnapshotHistoryResponse["snapshots"][number];

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { apiKey } = useAuth();
  const navigate = useNavigate();

  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey || !projectId) return;

    const client = new ApiClient(apiKey);
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [briefingResult, historyResult] = await Promise.all([
          client.getLatestSnapshot(projectId!),
          client.getSnapshotHistory(projectId!),
        ]);

        if (!cancelled) {
          setBriefing(briefingResult);
          setSnapshots(historyResult.snapshots);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to retrieve project data"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [apiKey, projectId]);

  if (loading) {
    return (
      <div
        className="project-detail"
        role="status"
        aria-label="Loading project"
      >
        <p>Loading project…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="project-detail" role="alert">
        <button className="back-btn" onClick={() => navigate("/")}>
          ← Back to Projects
        </button>
        <p className="error-message">{error}</p>
      </div>
    );
  }

  return (
    <div className="project-detail">
      <button className="back-btn" onClick={() => navigate("/")}>
        ← Back to Projects
      </button>

      <section className="briefing-section">
        <h2>Resumption Briefing</h2>
        {briefing?.fallback && (
          <p className="fallback-notice">
            AI briefing generation failed. Showing raw snapshot data.
          </p>
        )}
        {briefing?.fallback && briefing.rawSnapshot ? (
          <pre className="raw-snapshot">
            {JSON.stringify(briefing.rawSnapshot, null, 2)}
          </pre>
        ) : (
          <div className="briefing-content">{briefing?.briefing}</div>
        )}
      </section>

      <section className="history-section">
        <h2>Snapshot History</h2>
        {snapshots.length === 0 ? (
          <p>No snapshots available</p>
        ) : (
          <ul className="snapshot-list" role="list">
            {snapshots.map((snapshot, index) => (
              <li key={index} className="snapshot-item">
                <span className="snapshot-timestamp">
                  {new Date(snapshot.timestamp).toLocaleString()}
                </span>
                <span className="snapshot-summary">{snapshot.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
