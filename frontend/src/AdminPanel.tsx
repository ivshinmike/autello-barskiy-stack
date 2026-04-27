import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createAdminData,
  createAdminUser,
  deleteAdminUser,
  fetchAdminDataList,
  fetchAdminMe,
  fetchAdminUsers,
  patchAdminData,
  patchAdminUser,
  setAdminToken,
  UnauthorizedError,
  type AdminDataWritePayload,
  type AdminUserRow,
} from "./api";
import LandingStatsModal from "./LandingStatsModal";
import LeadsPanel from "./LeadsPanel";
import type { AdminDataRow } from "./types";

type Props = {
  token: string;
  onLogout: () => void;
};

type Tab = "site" | "leads" | "admins";

type ServiceItem = AdminDataRow["services"][number];

function normalizeServiceItems(raw: unknown): ServiceItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    const base: Record<string, unknown> =
      item && typeof item === "object" && !Array.isArray(item)
        ? { ...(item as Record<string, unknown>) }
        : {};
    const idRaw = base.id;
    const idStr =
      typeof idRaw === "string"
        ? idRaw.trim()
        : idRaw != null && String(idRaw).trim() !== ""
          ? String(idRaw).trim()
          : `svc_${i + 1}`;
    base.id = idStr;
    base.title = typeof base.title === "string" ? base.title : "";
    base.description =
      typeof base.description === "string" ? base.description : "";
    return base as ServiceItem;
  });
}

function rowToForm(r: AdminDataRow | null) {
  return {
    servicesList: r ? normalizeServiceItems(r.services) : [],
    budgetMin: r?.budget_range_min ?? "",
    budgetMax: r?.budget_range_max ?? "",
    extraUiText:
      r?.extra_ui != null ? JSON.stringify(r.extra_ui, null, 2) : "",
  };
}

function newEmptyService(index: number): ServiceItem {
  return {
    id: `svc_${Date.now().toString(36)}_${index}`,
    title: "",
    description: "",
  };
}

export default function AdminPanel({ token, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("site");
  const [me, setMe] = useState<{ id: number; username: string } | null>(null);
  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [rows, setRows] = useState<AdminDataRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [servicesList, setServicesList] = useState<ServiceItem[]>([]);
  const [selectedServiceIndex, setSelectedServiceIndex] = useState<
    number | null
  >(null);
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [extraUiText, setExtraUiText] = useState("");
  const [loading, setLoading] = useState(true);
  const [settingsReloading, setSettingsReloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [newAdminLogin, setNewAdminLogin] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [myNewPassword, setMyNewPassword] = useState("");
  const [usersBusy, setUsersBusy] = useState(false);
  const [usersMsg, setUsersMsg] = useState<string | null>(null);
  const [usersErr, setUsersErr] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [u, list, userList] = await Promise.all([
        fetchAdminMe(token),
        fetchAdminDataList(),
        fetchAdminUsers(token),
      ]);
      setMe(u);
      setAdmins(userList);
      setRows(list);
      const sorted = [...list].sort((a, b) => a.id - b.id);
      const first = sorted[0] ?? null;
      setSelectedId(first?.id ?? null);
      const f = rowToForm(first);
      setServicesList(f.servicesList);
      setSelectedServiceIndex(f.servicesList.length > 0 ? 0 : null);
      setBudgetMin(f.budgetMin);
      setBudgetMax(f.budgetMax);
      setExtraUiText(f.extraUiText);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setAdminToken(null);
        onLogout();
        return;
      }
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAdmins = useCallback(async () => {
    setUsersErr(null);
    try {
      setAdmins(await fetchAdminUsers(token));
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setAdminToken(null);
        onLogout();
        return;
      }
      setUsersErr(e instanceof Error ? e.message : "Не удалось обновить список");
    }
  }, [token, onLogout]);

  const applyRow = (r: AdminDataRow | null) => {
    const f = rowToForm(r);
    setServicesList(f.servicesList);
    setSelectedServiceIndex(
      f.servicesList.length ? 0 : null
    );
    setBudgetMin(f.budgetMin);
    setBudgetMax(f.budgetMax);
    setExtraUiText(f.extraUiText);
  };

  const onSelectId = (id: string) => {
    const n = id === "" ? null : Number(id);
    setSelectedId(n);
    const r = n != null ? rows.find((x) => x.id === n) ?? null : null;
    applyRow(r);
    setMsg(null);
    setErr(null);
  };

  const parsePayload = (): AdminDataWritePayload | null => {
    for (let i = 0; i < servicesList.length; i++) {
      const s = servicesList[i];
      const title = typeof s?.title === "string" ? s.title.trim() : "";
      if (!title) {
        setErr(`Услуга в строке ${i + 1}: укажите название.`);
        return null;
      }
    }
    const services = servicesList.map((s, idx) => {
      const base: Record<string, unknown> =
        s && typeof s === "object" && !Array.isArray(s)
          ? { ...(s as Record<string, unknown>) }
          : {};
      const idRaw =
        typeof base.id === "string"
          ? base.id.trim()
          : String(base.id ?? "").trim();
      const id = idRaw || `svc_${idx + 1}`;
      const title = typeof base.title === "string" ? base.title.trim() : "";
      const description =
        typeof base.description === "string" ? base.description.trim() : "";
      return { ...base, id, title, description } as ServiceItem;
    });
    let extra_ui: Record<string, unknown> | null = null;
    const t = extraUiText.trim();
    if (t !== "") {
      try {
        const parsed = JSON.parse(extraUiText) as unknown;
        if (parsed === null) {
          extra_ui = null;
        } else if (typeof parsed === "object" && !Array.isArray(parsed)) {
          extra_ui = parsed as Record<string, unknown>;
        } else {
          setErr("«Доп. UI» должен быть JSON-объектом, null или пустым полем.");
          return null;
        }
      } catch {
        setErr("Некорректный JSON в поле «Доп. UI».");
        return null;
      }
    }
    return {
      services,
      budget_range_min: budgetMin.trim() === "" ? null : budgetMin.trim(),
      budget_range_max: budgetMax.trim() === "" ? null : budgetMax.trim(),
      extra_ui,
    };
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const body = parsePayload();
    if (!body) return;
    setSaving(true);
    try {
      if (selectedId != null) {
        const updated = await patchAdminData(token, selectedId, body);
        setMsg(`Сохранено запись id=${updated.id}.`);
        await load();
        setSelectedId(updated.id);
      } else {
        const created = await createAdminData(token, body);
        setMsg(`Создана запись id=${created.id}.`);
        await load();
        setSelectedId(created.id);
      }
    } catch (e2) {
      if (e2 instanceof UnauthorizedError) {
        setAdminToken(null);
        onLogout();
        return;
      }
      setErr(e2 instanceof Error ? e2.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const onNewRow = () => {
    setSelectedId(null);
    applyRow(null);
    setMsg(null);
    setErr(null);
  };

  const onReloadSettings = async () => {
    setErr(null);
    setMsg(null);
    setSettingsReloading(true);
    try {
      const list = await fetchAdminDataList();
      setRows(list);
      const sorted = [...list].sort((a, b) => a.id - b.id);
      const r =
        selectedId != null
          ? sorted.find((x) => x.id === selectedId) ?? sorted[0] ?? null
          : sorted[0] ?? null;
      if (r) {
        setSelectedId(r.id);
        applyRow(r);
        setMsg(`Загружены данные записи id=${r.id}.`);
      } else {
        setSelectedId(null);
        applyRow(null);
        setMsg("В БД пока нет записей admin_data.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось загрузить настройки");
    } finally {
      setSettingsReloading(false);
    }
  };

  const onAddService = () => {
    setErr(null);
    let newIndex = 0;
    setServicesList((prev) => {
      const next = [...prev, newEmptyService(prev.length)];
      newIndex = next.length - 1;
      return next;
    });
    setSelectedServiceIndex(newIndex);
  };

  const onDeleteService = () => {
    if (selectedServiceIndex == null) {
      setErr("Выберите строку услуги в таблице.");
      return;
    }
    const ok = window.confirm("Удалить выбранную услугу из списка?");
    if (!ok) return;
    setErr(null);
    const idx = selectedServiceIndex;
    let nextSel: number | null = null;
    setServicesList((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) nextSel = null;
      else nextSel = Math.min(idx, next.length - 1);
      return next;
    });
    setSelectedServiceIndex(nextSel);
  };

  const onEditServiceFocus = () => {
    if (selectedServiceIndex == null) {
      setErr("Выберите строку услуги в таблице.");
      return;
    }
    setErr(null);
    window.requestAnimationFrame(() => {
      document.getElementById(`admin-svc-title-${selectedServiceIndex}`)?.focus();
    });
  };

  const patchServiceField = (
    index: number,
    key: "id" | "title" | "description",
    value: string
  ) => {
    setServicesList((prev) => {
      const next = [...prev];
      const cur = next[index];
      if (!cur || typeof cur !== "object") return prev;
      next[index] = { ...(cur as object), [key]: value } as ServiceItem;
      return next;
    });
  };

  const onCreateAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setUsersMsg(null);
    setUsersErr(null);
    if (newAdminLogin.trim().length < 1 || newAdminPassword.length < 8) {
      setUsersErr("Логин не пустой, пароль — не короче 8 символов.");
      return;
    }
    setUsersBusy(true);
    try {
      const row = await createAdminUser(token, {
        username: newAdminLogin.trim(),
        password: newAdminPassword,
      });
      setUsersMsg(`Создан администратор «${row.username}» (id ${row.id}).`);
      setNewAdminLogin("");
      setNewAdminPassword("");
      await refreshAdmins();
      await load();
    } catch (e2) {
      if (e2 instanceof UnauthorizedError) {
        setAdminToken(null);
        onLogout();
        return;
      }
      setUsersErr(e2 instanceof Error ? e2.message : "Ошибка");
    } finally {
      setUsersBusy(false);
    }
  };

  const onChangeMyPassword = async (e: FormEvent) => {
    e.preventDefault();
    setUsersMsg(null);
    setUsersErr(null);
    if (!me) return;
    if (myNewPassword.length < 8) {
      setUsersErr("Новый пароль — не короче 8 символов.");
      return;
    }
    setUsersBusy(true);
    try {
      await patchAdminUser(token, me.id, { password: myNewPassword });
      setUsersMsg("Пароль обновлён. При следующем входе используйте новый.");
      setMyNewPassword("");
    } catch (e2) {
      if (e2 instanceof UnauthorizedError) {
        setAdminToken(null);
        onLogout();
        return;
      }
      setUsersErr(e2 instanceof Error ? e2.message : "Ошибка");
    } finally {
      setUsersBusy(false);
    }
  };

  const onDeleteAdmin = async (row: AdminUserRow) => {
    const ok = window.confirm(
      row.id === me?.id
        ? "Удалить свою учётную запись? Вы будете разлогинены. Если это последний админ — снова откроется публичная регистрация."
        : `Удалить администратора «${row.username}»?`
    );
    if (!ok) return;
    setUsersMsg(null);
    setUsersErr(null);
    setUsersBusy(true);
    try {
      await deleteAdminUser(token, row.id);
      if (row.id === me?.id) {
        setAdminToken(null);
        onLogout();
        return;
      }
      setUsersMsg(`Удалён id ${row.id}.`);
      await refreshAdmins();
    } catch (e2) {
      if (e2 instanceof UnauthorizedError) {
        setAdminToken(null);
        onLogout();
        return;
      }
      setUsersErr(e2 instanceof Error ? e2.message : "Ошибка удаления");
    } finally {
      setUsersBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="page admin-auth-page">
        <div className="shell admin-auth-shell">
          <p className="hint">Загрузка…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page admin-auth-page">
      <div
        className={
          tab === "leads" ? "shell admin-panel-shell admin-panel-shell--wide" : "shell admin-panel-shell"
        }
      >
        <header className="hero admin-panel-hero">
          <h1>
            {tab === "leads" ? "Управление заявками" : "Панель управления"}
          </h1>
          <p>
            {me ? (
              <>
                {tab === "leads" ? (
                  <>
                    Скоринг и отдел (VIP / общий) на основе полей заявки.{" "}
                    <strong>{me.username}</strong>.
                  </>
                ) : (
                  <>
                    Вы вошли как <strong>{me.username}</strong>. Запросы к API с JWT.
                  </>
                )}
              </>
            ) : (
              "Админ-панель"
            )}
          </p>
          <div className="admin-panel-toolbar">
            <button
              type="button"
              className="ghost admin-toolbar-stats"
              onClick={() => setStatsOpen(true)}
            >
              Статистика лендинга
            </button>
            <Link to="/" className="ghost">
              На сайт
            </Link>
            <button type="button" className="ghost" onClick={() => onLogout()}>
              Выйти
            </button>
          </div>
        </header>

        <div className="admin-tabs" role="tablist">
          <button
            type="button"
            className={tab === "site" ? "admin-tab admin-tab--active" : "admin-tab"}
            onClick={() => setTab("site")}
          >
            Настройки лендинга
          </button>
          <button
            type="button"
            className={tab === "leads" ? "admin-tab admin-tab--active" : "admin-tab"}
            onClick={() => setTab("leads")}
          >
            Заявки
          </button>
          <button
            type="button"
            className={tab === "admins" ? "admin-tab admin-tab--active" : "admin-tab"}
            onClick={() => setTab("admins")}
          >
            Администраторы ({admins.length})
          </button>
        </div>

        {tab === "leads" && (
          <div className="card admin-panel-card admin-leads-card">
            <LeadsPanel
              token={token}
              onAuthError={() => onLogout()}
            />
          </div>
        )}

        {tab === "site" && (
          <form
            className="card admin-panel-card admin-site-settings-form"
            onSubmit={onSave}
          >
            <h2 className="section-title">Настройки лендинга и заявки (admin_data)</h2>
            <div className="field-grid">
              <div className="field-full">
                <label>
                  <span>Запись admin_data</span>
                  <select
                    value={selectedId ?? ""}
                    onChange={(e) => onSelectId(e.target.value)}
                  >
                    <option value="">— новая запись —</option>
                    {[...rows]
                      .sort((a, b) => a.id - b.id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          id {r.id} ({(r.services?.length ?? 0)} усл.)
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="field-full">
                <button
                  type="button"
                  className="ghost admin-settings-reset"
                  onClick={onNewRow}
                >
                  Сбросить выбор (создать новую)
                </button>
              </div>
              <div className="field-full">
                <div className="admin-services-block">
                  <div className="admin-services-head">
                    <h3 className="admin-services-title">Услуги</h3>
                    <p className="admin-services-sub">
                      Управление списком услуг (поле{" "}
                      <code className="admin-code">services</code> в{" "}
                      <code className="admin-code">admin_data</code>). Изменения попадут в API
                      после «Сохранить».
                    </p>
                  </div>
                  <div className="admin-services-layout">
                    <div className="admin-services-table-wrap">
                      <table className="admin-services-table">
                        <thead>
                          <tr>
                            <th className="admin-services-col-num">№</th>
                            <th>ID (ключ)</th>
                            <th>Название услуги</th>
                            <th>Описание</th>
                          </tr>
                        </thead>
                        <tbody>
                          {servicesList.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="admin-services-empty">
                                Нет услуг. Нажмите «Добавить».
                              </td>
                            </tr>
                          ) : (
                            servicesList.map((s, i) => {
                              const sid =
                                typeof s.id === "string" ? s.id : String(s.id ?? "");
                              const title =
                                typeof s.title === "string" ? s.title : "";
                              const desc =
                                typeof s.description === "string"
                                  ? s.description
                                  : "";
                              const isSel = selectedServiceIndex === i;
                              return (
                                <tr
                                  key={`${sid}-${i}`}
                                  className={
                                    isSel ? "admin-services-row admin-services-row--active" : "admin-services-row"
                                  }
                                  onClick={() => setSelectedServiceIndex(i)}
                                >
                                  <td className="admin-services-col-num">{i + 1}</td>
                                  <td>
                                    <input
                                      className="admin-services-input"
                                      value={sid}
                                      onChange={(e) =>
                                        patchServiceField(i, "id", e.target.value)
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      spellCheck={false}
                                      aria-label={`Ключ услуги ${i + 1}`}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      id={`admin-svc-title-${i}`}
                                      className="admin-services-input"
                                      value={title}
                                      onChange={(e) =>
                                        patchServiceField(i, "title", e.target.value)
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      placeholder="Название"
                                      aria-label={`Название услуги ${i + 1}`}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className="admin-services-input"
                                      value={desc}
                                      onChange={(e) =>
                                        patchServiceField(
                                          i,
                                          "description",
                                          e.target.value
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      placeholder="Необязательно"
                                      aria-label={`Описание услуги ${i + 1}`}
                                    />
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="admin-services-toolbar" role="toolbar" aria-label="Действия с услугами">
                      <button
                        type="button"
                        className="admin-svc-tool admin-svc-tool--add"
                        onClick={onAddService}
                      >
                        Добавить
                      </button>
                      <button
                        type="button"
                        className="admin-svc-tool admin-svc-tool--edit"
                        onClick={onEditServiceFocus}
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        className="admin-svc-tool admin-svc-tool--del"
                        onClick={onDeleteService}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label>
                  <span>Бюджет min (строка)</span>
                  <input
                    value={budgetMin}
                    onChange={(e) => setBudgetMin(e.target.value)}
                    placeholder="0"
                  />
                </label>
              </div>
              <div>
                <label>
                  <span>Бюджет max (строка)</span>
                  <input
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(e.target.value)}
                    placeholder="500000"
                  />
                </label>
              </div>
              <div className="field-full">
                <label>
                  <span>Доп. UI (JSON-объект, можно пусто)</span>
                  <textarea
                    className="admin-json"
                    value={extraUiText}
                    onChange={(e) => setExtraUiText(e.target.value)}
                    spellCheck={false}
                    placeholder="{}"
                  />
                </label>
              </div>
            </div>

            <div className="btn-row admin-settings-footer">
              <button
                type="button"
                className="ghost admin-settings-load"
                disabled={settingsReloading || saving}
                onClick={() => void onReloadSettings()}
              >
                {settingsReloading ? "Загрузка…" : "Загрузить текущие настройки"}
              </button>
              <button
                className="primary admin-settings-save"
                type="submit"
                disabled={saving || settingsReloading}
              >
                {saving
                  ? "Сохранение…"
                  : selectedId != null
                    ? "Сохранить настройки (PATCH)"
                    : "Создать запись (POST)"}
              </button>
            </div>

            {msg && <div className="status ok">{msg}</div>}
            {err && <div className="status err">{err}</div>}
          </form>
        )}

        {statsOpen ? (
          <LandingStatsModal
            token={token}
            onClose={() => setStatsOpen(false)}
            onAuthError={() => {
              onLogout();
            }}
          />
        ) : null}

        {tab === "admins" && (
          <div className="card admin-panel-card">
            <h2 className="section-title">Учётные записи</h2>
            <p className="hint">
              Первичная регистрация с главной страницы входа доступна только пока в БД нет ни одного
              админа. Дальше — создавайте пользователей здесь или удаляйте всех, чтобы снова
              открыть публичную регистрацию (осторожно).
            </p>

            <div className="admin-user-table-wrap">
              <table className="admin-user-table">
                <thead>
                  <tr>
                    <th>id</th>
                    <th>Логин</th>
                    <th>Создан</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...admins]
                    .sort((a, b) => a.id - b.id)
                    .map((a) => (
                      <tr key={a.id}>
                        <td>{a.id}</td>
                        <td>
                          {a.username}
                          {me?.id === a.id ? (
                            <span className="admin-user-badge"> вы</span>
                          ) : null}
                        </td>
                        <td className="admin-user-date">
                          {new Date(a.created_at).toLocaleString("ru-RU")}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ghost admin-user-del"
                            disabled={usersBusy}
                            onClick={() => void onDeleteAdmin(a)}
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="hr" />

            <h3 className="section-title section-title--sub">Новый администратор</h3>
            <form className="field-grid" onSubmit={onCreateAdmin}>
              <div>
                <label>
                  <span>Логин</span>
                  <input
                    value={newAdminLogin}
                    onChange={(e) => setNewAdminLogin(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              </div>
              <div>
                <label>
                  <span>Пароль</span>
                  <input
                    type="password"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <div className="field-full">
                <button className="primary" type="submit" disabled={usersBusy}>
                  Создать
                </button>
              </div>
            </form>

            <div className="hr" />

            <h3 className="section-title section-title--sub">Сменить мой пароль</h3>
            <form className="field-grid" onSubmit={onChangeMyPassword}>
              <div className="field-full">
                <label>
                  <span>Новый пароль</span>
                  <input
                    type="password"
                    value={myNewPassword}
                    onChange={(e) => setMyNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <div className="field-full">
                <button className="primary" type="submit" disabled={usersBusy}>
                  Обновить пароль
                </button>
              </div>
            </form>

            <div className="btn-row" style={{ marginTop: "1rem" }}>
              <button type="button" className="ghost" disabled={usersBusy} onClick={() => void refreshAdmins()}>
                Обновить список
              </button>
            </div>

            {usersMsg && <div className="status ok">{usersMsg}</div>}
            {usersErr && <div className="status err">{usersErr}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
