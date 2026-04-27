import { useCallback, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getAdminToken, setAdminToken } from "./api";
import AdminLogin from "./AdminLogin";
import AdminPanel from "./AdminPanel";
import Landing from "./Landing";

function AdminGate() {
  const [token, setToken] = useState<string | null>(() => getAdminToken());

  const handleLoggedIn = useCallback((t: string) => {
    setAdminToken(t);
    setToken(t);
  }, []);

  const handleLogout = useCallback(() => {
    setAdminToken(null);
    setToken(null);
  }, []);

  if (!token) {
    return <AdminLogin onLoggedIn={handleLoggedIn} />;
  }

  return <AdminPanel token={token} onLogout={handleLogout} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/admin" element={<AdminGate />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
