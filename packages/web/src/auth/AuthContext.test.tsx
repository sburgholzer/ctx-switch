import { render, screen, act, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import { ProtectedRoute } from "./ProtectedRoute";

function TestConsumer() {
  const { isAuthenticated, apiKey, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth-status">{isAuthenticated ? "authenticated" : "unauthenticated"}</span>
      <span data-testid="api-key">{apiKey || "none"}</span>
      <button onClick={() => login("test-key-123")}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

function ProtectedContent() {
  return <div data-testid="protected">Protected Content</div>;
}

function LoginRedirect() {
  return <div data-testid="login-page">Login Page</div>;
}

describe("AuthContext", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts unauthenticated when no stored key", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId("auth-status").textContent).toBe("unauthenticated");
    expect(screen.getByTestId("api-key").textContent).toBe("none");
  });

  it("login sets authenticated state and stores key", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    act(() => {
      fireEvent.click(screen.getByText("Login"));
    });

    expect(screen.getByTestId("auth-status").textContent).toBe("authenticated");
    expect(screen.getByTestId("api-key").textContent).toBe("test-key-123");
    expect(sessionStorage.getItem("ctx-switch-api-key")).toBe("test-key-123");
  });

  it("logout clears authenticated state and storage", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    act(() => {
      fireEvent.click(screen.getByText("Login"));
    });
    act(() => {
      fireEvent.click(screen.getByText("Logout"));
    });

    expect(screen.getByTestId("auth-status").textContent).toBe("unauthenticated");
    expect(sessionStorage.getItem("ctx-switch-api-key")).toBeNull();
  });

  it("restores session from sessionStorage", () => {
    sessionStorage.setItem("ctx-switch-api-key", "stored-key");
    sessionStorage.setItem("ctx-switch-last-activity", Date.now().toString());

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId("auth-status").textContent).toBe("authenticated");
    expect(screen.getByTestId("api-key").textContent).toBe("stored-key");
  });

  it("clears expired session on load (30-minute timeout)", () => {
    const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
    sessionStorage.setItem("ctx-switch-api-key", "expired-key");
    sessionStorage.setItem("ctx-switch-last-activity", thirtyOneMinutesAgo.toString());

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId("auth-status").textContent).toBe("unauthenticated");
    expect(sessionStorage.getItem("ctx-switch-api-key")).toBeNull();
  });

  it("logs out after 30 minutes of inactivity", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    act(() => {
      fireEvent.click(screen.getByText("Login"));
    });
    expect(screen.getByTestId("auth-status").textContent).toBe("authenticated");

    // Advance time by 30 minutes
    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    expect(screen.getByTestId("auth-status").textContent).toBe("unauthenticated");
  });

  it("resets inactivity timer on user interaction", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    act(() => {
      fireEvent.click(screen.getByText("Login"));
    });

    // Advance 20 minutes
    act(() => {
      vi.advanceTimersByTime(20 * 60 * 1000);
    });

    // Simulate user activity
    act(() => {
      fireEvent.mouseDown(window);
    });

    // Advance another 20 minutes (total 40 from login, but only 20 from last activity)
    act(() => {
      vi.advanceTimersByTime(20 * 60 * 1000);
    });

    // Still authenticated because timer was reset
    expect(screen.getByTestId("auth-status").textContent).toBe("authenticated");

    // Advance 10 more minutes (30 from last activity)
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(screen.getByTestId("auth-status").textContent).toBe("unauthenticated");
  });
});

describe("ProtectedRoute", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("redirects to login when not authenticated", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginRedirect />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <ProtectedContent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId("login-page")).toBeInTheDocument();
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
  });

  it("renders children when authenticated", () => {
    sessionStorage.setItem("ctx-switch-api-key", "valid-key");
    sessionStorage.setItem("ctx-switch-last-activity", Date.now().toString());

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginRedirect />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <ProtectedContent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId("protected")).toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });
});
