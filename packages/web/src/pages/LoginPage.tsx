import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function LoginPage() {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError("Please enter an API key");
      return;
    }
    login(trimmed);
    navigate("/", { replace: true });
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Context Switcher</h1>
        <p>Enter your API key to access the dashboard.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="api-key-input">API Key</label>
            <input
              id="api-key-input"
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError("");
              }}
              placeholder="ctx-xxxxxxxxxxxxxxxx"
              autoComplete="off"
              aria-describedby={error ? "api-key-error" : undefined}
            />
            {error && (
              <p id="api-key-error" className="error-message" role="alert">
                {error}
              </p>
            )}
          </div>
          <button type="submit">Sign In</button>
        </form>
      </div>
    </div>
  );
}
