import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, beforeEach } from "vitest";
import { AuthProvider } from "../auth";
import { LoginPage } from "./LoginPage";

function DashboardStub() {
  return <div data-testid="dashboard">Dashboard</div>;
}

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<DashboardStub />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders login form with API key input", () => {
    renderLoginPage();
    expect(screen.getByLabelText("API Key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
  });

  it("shows error for empty submission", () => {
    renderLoginPage();
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(screen.getByText("Please enter an API key")).toBeInTheDocument();
  });

  it("navigates to dashboard on successful login", () => {
    renderLoginPage();
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "ctx-myapikey123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(screen.getByTestId("dashboard")).toBeInTheDocument();
  });

  it("stores API key in session storage on login", () => {
    renderLoginPage();
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "ctx-myapikey123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(sessionStorage.getItem("ctx-switch-api-key")).toBe("ctx-myapikey123");
  });
});
