import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchRegistrationOpen,
  loginAdmin,
  registerAdmin,
} from "./api";

type Props = {
  onLoggedIn: (token: string) => void;
};

export default function AdminLogin({ onLoggedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchRegistrationOpen();
        if (!cancelled) {
          setRegistrationOpen(r.open);
          if (r.open) setMode("register");
        }
      } catch {
        if (!cancelled) {
          setRegistrationOpen(false);
          setMode("login");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        if (registrationOpen !== true) {
          setError("Регистрация недоступна.");
          return;
        }
        const r = await registerAdmin(username.trim(), password.trim());
        onLoggedIn(r.access_token);
      } else {
        const r = await loginAdmin(username.trim(), password.trim());
        onLoggedIn(r.access_token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page admin-auth-page">
      <div className="shell admin-auth-shell">
        <header className="hero">
          <h1>Админ-панель</h1>
          <p>Вход по логину и паролю. Доступ к изменению настроек — только с JWT.</p>
        </header>

        <form className="card admin-auth-card" onSubmit={onSubmit}>
          {registrationOpen === null && (
            <p className="hint">Проверка доступности регистрации…</p>
          )}

          <div className="field-grid">
            <div className="field-full">
              <label>
                <span>Логин</span>
                <input
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={1}
                />
              </label>
            </div>
            <div className="field-full">
              <label>
                <span>Пароль</span>
                <input
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </label>
            </div>
          </div>

          <p className="hint admin-auth-hint">
            Минимальная длина пароля — 8 символов.
          </p>

          {registrationOpen === true && (
            <div className="admin-auth-mode">
              <button
                type="button"
                className={mode === "login" ? "primary" : "ghost"}
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
              >
                Войти
              </button>
              <button
                type="button"
                className={mode === "register" ? "primary" : "ghost"}
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
              >
                Зарегистрироваться
              </button>
            </div>
          )}

          <div className="btn-row">
            <Link to="/" className="ghost admin-back">
              На сайт
            </Link>
            <button className="primary" type="submit" disabled={loading}>
              {loading
                ? "…"
                : mode === "register"
                  ? "Создать администратора"
                  : "Войти"}
            </button>
          </div>

          {error && <div className="status err">{error}</div>}
        </form>
      </div>
    </div>
  );
}
