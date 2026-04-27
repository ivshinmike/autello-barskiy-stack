import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminWarmLeadById,
  fetchAdminWarmLeads,
  UnauthorizedError,
  setAdminToken,
  type ScoredWarmLead,
} from "./api";

type Props = {
  token: string;
  onAuthError: () => void;
};

type SortMode = "priority" | "created_desc";

function formatBudgetRuble(parsed: number, raw: string | null): string {
  if (parsed > 0) {
    return (
      new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(parsed) +
      "\u00a0₽"
    );
  }
  const t = raw?.trim();
  return t && t.length > 0 ? t : "—";
}

function contactHint(method: string | null): { icon: string; label: string } {
  if (!method) return { icon: "○", label: "не указан" };
  const m = method.toLowerCase();
  if (m.includes("телег") || m.includes("telegram")) return { icon: "✈", label: "Telegram" };
  if (m.includes("whatsapp") || m.includes("ватс")) return { icon: "◉", label: "WhatsApp" };
  if (m.includes("тел") || m.includes("phone") || m.includes("звон")) return { icon: "☎", label: "Телефон" };
  if (m.includes("mail") || m.includes("email") || m.includes("почт")) return { icon: "✉", label: "Email" };
  return { icon: "•", label: method };
}

function fullName(lead: ScoredWarmLead): string {
  const parts = [lead.last_name, lead.first_name, lead.middle_name].filter(
    (x) => x && x.trim() !== ""
  );
  return parts.length > 0 ? parts.join(" ") : `id ${lead.id}`;
}

export default function LeadsPanel({ token, onAuthError }: Props) {
  const [sort, setSort] = useState<SortMode>("priority");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchAdminWarmLeads>> | null>(null);
  const [modalLead, setModalLead] = useState<ScoredWarmLead | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      setData(
        await fetchAdminWarmLeads(token, { sort, skip: 0, limit: 500 })
      );
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setAdminToken(null);
        onAuthError();
        return;
      }
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [token, sort, onAuthError]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (lead: ScoredWarmLead) => {
    setModalLead(lead);
    setModalLoading(true);
    try {
      const fresh = await fetchAdminWarmLeadById(token, lead.id);
      setModalLead(fresh);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setAdminToken(null);
        onAuthError();
        return;
      }
      setErr(e instanceof Error ? e.message : "Не удалось обновить заявку");
    } finally {
      setModalLoading(false);
    }
  };

  const stats = data?.stats;
  const items = data?.items ?? [];

  return (
    <div className="admin-leads-page">
      <p className="admin-leads-intro">
        Список с интеллектуальной оценкой: бюджет, роль, размер компании, сроки и смысл полей
        заявки. Режим <strong>по приоритету</strong> выводит срочных и крупных выше, затем
        тёплых и «холодных».
      </p>

      <div className="admin-lead-stats" role="group" aria-label="Статистика заявок">
        <div className="admin-lead-stat">
          <span className="admin-lead-stat__icon" aria-hidden>
            ⊞
          </span>
          <div>
            <div className="admin-lead-stat__n">{loading ? "—" : stats?.total ?? 0}</div>
            <div className="admin-lead-stat__label">Всего</div>
          </div>
        </div>
        <div className="admin-lead-stat admin-lead-stat--hot">
          <span className="admin-lead-stat__icon" aria-hidden>
            🔥
          </span>
          <div>
            <div className="admin-lead-stat__n">{loading ? "—" : stats?.hot ?? 0}</div>
            <div className="admin-lead-stat__label">Горячие</div>
          </div>
        </div>
        <div className="admin-lead-stat admin-lead-stat--warm">
          <span className="admin-lead-stat__icon" aria-hidden>
            🌡
          </span>
          <div>
            <div className="admin-lead-stat__n">{loading ? "—" : stats?.warm ?? 0}</div>
            <div className="admin-lead-stat__label">Тёплые</div>
          </div>
        </div>
        <div className="admin-lead-stat admin-lead-stat--cold">
          <span className="admin-lead-stat__icon" aria-hidden>
            ❄
          </span>
          <div>
            <div className="admin-lead-stat__n">{loading ? "—" : stats?.cold ?? 0}</div>
            <div className="admin-lead-stat__label">Холодные</div>
          </div>
        </div>
      </div>

      <div className="admin-leads-toolbar" role="toolbar" aria-label="Сортировка и обновление">
        <div className="admin-leads-sort" role="group" aria-label="Порядок">
          <button
            type="button"
            className={
              sort === "priority" ? "admin-leads-sort-btn admin-leads-sort-btn--on" : "admin-leads-sort-btn"
            }
            onClick={() => setSort("priority")}
          >
            По приоритету
          </button>
          <button
            type="button"
            className={
              sort === "created_desc"
                ? "admin-leads-sort-btn admin-leads-sort-btn--on"
                : "admin-leads-sort-btn"
            }
            onClick={() => setSort("created_desc")}
          >
            По дате (новые)
          </button>
        </div>
        <button type="button" className="ghost admin-leads-refresh" onClick={() => void load()} disabled={loading}>
          {loading ? "Загрузка…" : "Обновить"}
        </button>
      </div>

      {err && <div className="status err">{err}</div>}

      <div className="admin-leads-table-wrap">
        <table className="admin-leads-table">
          <thead>
            <tr>
              <th>Приоритет</th>
              <th>Клиент</th>
              <th>Компания / ниша</th>
              <th>Бюджет</th>
              <th>Температура</th>
              <th>Статус</th>
              <th>Отдел</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} className="admin-leads-empty">
                  Заявок пока нет. Отправьте тестовую с лендинга или загрузите SQL-фикстуры.
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const c = contactHint(row.contact_method);
                const tempClass =
                  row.temperature === "hot"
                    ? "admin-lead-row--hot"
                    : row.temperature === "warm"
                      ? "admin-lead-row--warm"
                      : "admin-lead-row--cold";
                const prClass =
                  row.temperature === "hot"
                    ? "admin-lead-priority--hot"
                    : row.temperature === "warm"
                      ? "admin-lead-priority--warm"
                      : "admin-lead-priority--cold";
                return (
                  <tr key={row.id} className={`admin-lead-row ${tempClass}`}>
                    <td>
                      <span className={`admin-lead-priority ${prClass}`}>
                        <span aria-hidden>🔥</span> {row.priority_score}
                      </span>
                    </td>
                    <td>
                      <div className="admin-lead-client">
                        {fullName(row)}
                        <div className="admin-lead-contact" title={c.label}>
                          <span aria-hidden>{c.icon}</span> {c.label}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="admin-lead-company">
                        <span className="admin-lead-company__size">
                          {row.company_size?.trim() || "—"}
                        </span>
                        {row.business_niche ? (
                          <span className="admin-lead-company__niche">
                            {(row.business_niche.length > 36
                              ? `${row.business_niche.slice(0, 36)}…`
                              : row.business_niche)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="admin-lead-budget">
                      {formatBudgetRuble(row.budget_parsed_rub, row.budget)}
                    </td>
                    <td>
                      <span
                        className={`admin-lead-temp admin-lead-temp--${row.temperature}`}
                      >
                        {row.temperature_label}
                      </span>
                    </td>
                    <td>
                      <span className="admin-lead-ok" title="Рекомендация">
                        {row.attention_label === "Стоит внимания" ? "✓ " : "○ "}
                        {row.attention_label}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          row.department === "vip" ? "admin-dept admin-dept--vip" : "admin-dept"
                        }
                      >
                        {row.department_label}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="primary admin-lead-view"
                        onClick={() => void openDetail(row)}
                      >
                        Просмотр
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modalLead ? (
        <div
          className="admin-lead-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-lead-modal-title"
          onClick={() => setModalLead(null)}
        >
          <div
            className="admin-lead-modal card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="admin-lead-modal-title" className="section-title">
              Заявка #{modalLead.id}
            </h2>
            {modalLoading ? <p className="hint">Обновление…</p> : null}
            <div className="admin-lead-modal-grid">
              <div>
                <span className="admin-lead-dl__k">Контакт</span>
                <p className="admin-lead-dl__v">{fullName(modalLead)}</p>
              </div>
              <div>
                <span className="admin-lead-dl__k">Связь / время</span>
                <p className="admin-lead-dl__v">
                  {contactHint(modalLead.contact_method).label}
                  {modalLead.preferred_time
                    ? ` · ${modalLead.preferred_time}`
                    : null}
                </p>
              </div>
              <div className="field-full">
                <span className="admin-lead-dl__k">Оценка</span>
                <p className="admin-lead-dl__v">
                  <strong>{modalLead.priority_score}</strong> баллов · {modalLead.temperature_label} ·
                  отдел {modalLead.department_label}
                  {modalLead.personal_manager_recommended
                    ? " · персональный менеджер рекомендуется"
                    : null}
                </p>
              </div>
              <div>
                <span className="admin-lead-dl__k">Ниша</span>
                <p className="admin-lead-dl__v">{modalLead.business_niche ?? "—"}</p>
              </div>
              <div>
                <span className="admin-lead-dl__k">Компания</span>
                <p className="admin-lead-dl__v">
                  {(modalLead.company_size ?? "—") +
                    (modalLead.business_size ? `, ${modalLead.business_size}` : "")}
                </p>
              </div>
              <div>
                <span className="admin-lead-dl__k">Роль</span>
                <p className="admin-lead-dl__v">{modalLead.role_type ?? "—"}</p>
              </div>
              <div>
                <span className="admin-lead-dl__k">Бюджет (строка / распозн.)</span>
                <p className="admin-lead-dl__v">
                  {formatBudgetRuble(modalLead.budget_parsed_rub, modalLead.budget)} (
                  {modalLead.budget ?? "—"})
                </p>
              </div>
              <div>
                <span className="admin-lead-dl__k">Срок</span>
                <p className="admin-lead-dl__v">{modalLead.result_deadline ?? "—"}</p>
              </div>
              <div>
                <span className="admin-lead-dl__k">Продукт / услуга</span>
                <p className="admin-lead-dl__v">{modalLead.product_interest ?? "—"}</p>
              </div>
              <div className="field-full">
                <span className="admin-lead-dl__k">Детали бизнеса</span>
                <p className="admin-lead-dl__v pre">{modalLead.business_info ?? "—"}</p>
              </div>
              <div className="field-full">
                <span className="admin-lead-dl__k">Комментарий</span>
                <p className="admin-lead-dl__v pre">{modalLead.comments ?? "—"}</p>
              </div>
              <div className="field-full">
                <span className="admin-lead-dl__k">Распределение баллов</span>
                <ul className="admin-lead-score-bars">
                  {(
                    [
                      ["Бюджет", modalLead.score_details.budget],
                      ["Компания", modalLead.score_details.company],
                      ["Роль", modalLead.score_details.role],
                      ["Срок", modalLead.score_details.deadline],
                      ["Ниша", modalLead.score_details.niche],
                      ["Объём", modalLead.score_details.need],
                    ] as const
                  ).map(([label, n]) => (
                    <li key={label}>
                      <span className="admin-lead-sb__l">{label}</span>
                      <span className="admin-lead-sb__bar" aria-hidden>
                        <i style={{ width: `${Math.min(100, n * 4)}%` }} />
                      </span>
                      <span className="admin-lead-sb__n">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="admin-lead-modal-actions">
              <button type="button" className="ghost" onClick={() => setModalLead(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
