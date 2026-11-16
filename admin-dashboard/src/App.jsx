
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import SetPassword from "./pages/SetPassword";

import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public Login Page */}
        <Route
          path="/login"
          element={<Login />}
        />

        {/* Public Invitation Password Page */}
        <Route
          path="/set-password"
          element={<SetPassword />}
        />

        {/* Protected Admin Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Default Route */}
        <Route
          path="/"
          element={<Navigate to="/login" replace />}
        />

        {/* Unknown Routes */}
        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />

      </Routes>
    </BrowserRouter>
  );
}
