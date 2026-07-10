import { Outlet } from "react-router-dom";
import { useAuth } from "../auth";

export function Layout() {
  const { logout } = useAuth();

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>Context Switcher</h1>
        <nav>
          <button onClick={logout} className="logout-btn">
            Sign Out
          </button>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
