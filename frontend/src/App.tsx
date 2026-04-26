import { useCallback, useEffect, useRef, useState, type FormEvent, type CSSProperties } from "react";
import {
  fetchAdminDataList,
  parseBudgetBounds,
  submitWarmLead,
  type WarmLeadCreatePayload,
} from "./api";
import type { AdminDataRow, LeadBehavior, WarmLeadForm } from "./types";

const ORBS: { top: string; left: string; size: "sm" | "md" | "lg"; delay: string; dur: string }[] =
  [
    { top: "8%", left: "5%", size: "md", delay: "0s", dur: "24s" },
    { top: "65%", left: "8%", size: "lg", delay: "2s", dur: "28s" },
    { top: "20%", left: "78%", size: "sm", delay: "1s", dur: "20s" },
    { top: "82%", left: "72%", size: "md", delay: "3s", dur: "26s" },
    { top: "40%", left: "12%", size: "sm", delay: "4s", dur: "22s" },
    { top: "12%", left: "42%", size: "lg", delay: "1.5s", dur: "30s" },
    { top: "70%", left: "38%", size: "sm", delay: "0.5s", dur: "18s" },
    { top: "30%", left: "88%", size: "md", delay: "2.5s", dur: "25s" },
    { top: "88%", left: "22%", size: "sm", delay: "3.5s", dur: "21s" },
    { top: "50%", left: "55%", size: "lg", delay: "1s", dur: "32s" },
  ];

const emptyForm = (): WarmLeadForm => ({
  first_name: "",
  last_name: "",
  middle_name: "",
  business_info: "",
  business_niche: "",
  company_size: "",
  task_volume: "",
  role_type: "",
  business_size: "",
  need_volume: "",
  result_deadline: "",
  task_type: "",
  product_interest: "",
  budget: "0",
  contact_method: "",
  preferred_time: "",
  comments: "",
});

export default function App() {
  const [form, setForm] = useState<WarmLeadForm>(emptyForm);
  const [adminRow, setAdminRow] = useState<AdminDataRow | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [budgetMin, setBudgetMin] = useState(0);
  const [budgetMax, setBudgetMax] = useState(1_000_000);
  const [sending, setSending] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const pageT0 = useRef<number>(Date.now());
  const clickMap = useRef<Record<string, number>>({});
  const cursorSamples = useRef<{ x: number; y: number; t: number }[]>([]);
  const moveThrottle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visitCount = useRef(0);

  const bump = useCallback((key: string) => {
    clickMap.current[key] = (clickMap.current[key] ?? 0) + 1;
  }, []);

  useEffect(() => {
    const k = "autello_site_visits";
    const n = (parseInt(localStorage.getItem(k) ?? "0", 10) || 0) + 1;
    localStorage.setItem(k, String(n));
    visitCount.current = n;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchAdminDataList();
        const row = list.length
          ? [...list].sort((a, b) => a.id - b.id)[0]
          : null;
        setAdminRow(row);
        if (row) {
          const { min, max } = parseBudgetBounds(row.budget_range_min, row.budget_range_max);
          setBudgetMin(min);
          setBudgetMax(max);
          const mid = Math.round((min + max) / 2);
          setForm((f) => ({ ...f, budget: String(mid) }));
        }
      } catch (e) {
        setAdminError(
          e instanceof Error ? e.message : "не удалось загрузить настройки (бюджет по умолчанию)"
        );
        setBudgetMin(0);
        setBudgetMax(1_000_000);
      }
    })();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (moveThrottle.current) return;
      moveThrottle.current = setTimeout(() => {
        moveThrottle.current = null;
        const t = Date.now() - pageT0.current;
        const arr = cursorSamples.current;
        arr.push({ x: e.clientX, y: e.clientY, t });
        if (arr.length > 40) arr.splice(0, arr.length - 40);
      }, 200);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const onChange = (key: keyof WarmLeadForm, v: string) => {
    setForm((f) => ({ ...f, [key]: v }));
  };

  const onBudgetSlider = (n: number) => {
    setForm((f) => ({ ...f, budget: String(n) }));
  };

  const formatMoney = (n: number) =>
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    setOkMsg(null);
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setErrMsg("Укажите имя и фамилию.");
      return;
    }
    bump("submit");
    setSending(true);
    const timeOn = (Date.now() - pageT0.current) / 1000;
    const behavior: LeadBehavior = {
      time_on_page_seconds: timeOn,
      button_clicks: { ...clickMap.current },
      cursor_hover_data: { samples: [...cursorSamples.current] },
      page_return_count: Math.max(0, visitCount.current - 1),
      raw_metrics: {
        userAgent: navigator.userAgent,
        visitTotal: visitCount.current,
        viewport: { w: window.innerWidth, h: window.innerHeight },
      },
    };
    const payload: WarmLeadCreatePayload = { ...form, behavior };
    try {
      const res = (await submitWarmLead(payload)) as { id: number };
      setOkMsg(
        `Заявка отправлена. Номер: ${res.id}. Мы свяжемся с вами в удобное время.`
      );
      {
        const { min, max } = parseBudgetBounds(
          adminRow?.budget_range_min,
          adminRow?.budget_range_max
        );
        setForm({
          ...emptyForm(),
          budget: String(Math.round((min + max) / 2)),
        });
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Ошибка отправки");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page">
      {ORBS.map((o, i) => (
        <div
          key={i}
          className={`orb orb--${o.size}`}
          style={
            {
              top: o.top,
              left: o.left,
              ["--delay" as string]: o.delay,
              ["--dur" as string]: o.dur,
            } as CSSProperties
          }
        />
      ))}

      <div className="shell">
        <header className="hero">
          <h1>Autéllo</h1>
          <p> Заявка для тёплых клиентов: заполните поля — мы подберём формат сотрудничества и свяжемся с вами. </p>
        </header>

        <form className="card" onSubmit={onSubmit}>
          {adminError && <div className="status admin-err">Настройки сети: {adminError}</div>}

          <h2 className="section-title">Контакты</h2>
          <div className="field-grid">
            <div>
              <label>
                <span>Имя *</span>
                <input
                  required
                  value={form.first_name}
                  onChange={(e) => onChange("first_name", e.target.value)}
                  onFocus={() => bump("focus_first_name")}
                />
              </label>
            </div>
            <div>
              <label>
                <span>Фамилия *</span>
                <input
                  required
                  value={form.last_name}
                  onChange={(e) => onChange("last_name", e.target.value)}
                  onFocus={() => bump("focus_last_name")}
                />
              </label>
            </div>
            <div className="field-full">
              <label>
                <span>Отчество</span>
                <input
                  value={form.middle_name}
                  onChange={(e) => onChange("middle_name", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="hr" />
          <h2 className="section-title">О бизнесе</h2>
          <div className="field-grid">
            <div>
              <label>
                <span>Ниша</span>
                <input
                  value={form.business_niche}
                  onChange={(e) => onChange("business_niche", e.target.value)}
                />
              </label>
            </div>
            <div>
              <label>
                <span>Размер компании</span>
                <input
                  value={form.company_size}
                  onChange={(e) => onChange("company_size", e.target.value)}
                />
              </label>
            </div>
            <div>
              <label>
                <span>Размер бизнеса</span>
                <input
                  value={form.business_size}
                  onChange={(e) => onChange("business_size", e.target.value)}
                />
              </label>
            </div>
            <div className="field-full">
              <label>
                <span>Информация о бизнесе</span>
                <textarea
                  value={form.business_info}
                  onChange={(e) => onChange("business_info", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="hr" />
          <h2 className="section-title">Роль и задача</h2>
          <div className="field-grid">
            <div>
              <label>
                <span>Кто вы</span>
                <select
                  value={form.role_type}
                  onChange={(e) => onChange("role_type", e.target.value)}
                >
                  <option value="">— выберите —</option>
                  <option value="Сотрудник">Сотрудник</option>
                  <option value="Руководитель">Руководитель</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                <span>Объём задачи</span>
                <input
                  value={form.task_volume}
                  onChange={(e) => onChange("task_volume", e.target.value)}
                />
              </label>
            </div>
            <div>
              <label>
                <span>Объём потребности</span>
                <input
                  value={form.need_volume}
                  onChange={(e) => onChange("need_volume", e.target.value)}
                />
              </label>
            </div>
            <div>
              <label>
                <span>Тип задачи</span>
                <input
                  value={form.task_type}
                  onChange={(e) => onChange("task_type", e.target.value)}
                />
              </label>
            </div>
            <div>
              <label>
                <span>Интересующий продукт</span>
                <input
                  value={form.product_interest}
                  onChange={(e) => onChange("product_interest", e.target.value)}
                />
              </label>
            </div>
            <div>
              <label>
                <span>Срок (когда нужен результат)</span>
                <input
                  type="date"
                  value={form.result_deadline}
                  onChange={(e) => onChange("result_deadline", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="hr" />
          <h2 className="section-title">Бюджет</h2>
          <p className="hint">
            Диапазон подставляется из админ-настроек. Итог уходит в заявку как выбранная сумма
            (строкой).
          </p>
          <div className="budget-block">
            <div className="budget-line">
              <span>{formatMoney(budgetMin)}</span>
              <span className="budget-value">
                {formatMoney(Number.parseInt(form.budget || "0", 10) || 0)} ₽
              </span>
              <span>{formatMoney(budgetMax)}</span>
            </div>
            <input
              type="range"
              min={budgetMin}
              max={budgetMax}
              step={Math.max(1, Math.round((budgetMax - budgetMin) / 500) || 1)}
              value={Number.parseInt(form.budget || "0", 10) || budgetMin}
              onChange={(e) => onBudgetSlider(Number(e.target.value))}
            />
          </div>

          <div className="hr" />
          <h2 className="section-title">Связь</h2>
          <div className="field-grid">
            <div>
              <label>
                <span>Удобный способ связи</span>
                <input
                  value={form.contact_method}
                  onChange={(e) => onChange("contact_method", e.target.value)}
                  placeholder="телеграм, телефон, почта…"
                />
              </label>
            </div>
            <div>
              <label>
                <span>Удобное время</span>
                <input
                  value={form.preferred_time}
                  onChange={(e) => onChange("preferred_time", e.target.value)}
                />
              </label>
            </div>
            <div className="field-full">
              <label>
                <span>Комментарии</span>
                <textarea
                  value={form.comments}
                  onChange={(e) => onChange("comments", e.target.value)}
                />
              </label>
            </div>
          </div>

          {adminRow && adminRow.services?.length > 0 && (
            <>
              <div className="hr" />
              <h2 className="section-title">Услуги (из админки)</h2>
              <p className="hint">
                {adminRow.services.map((s, i) => (
                  <span key={i}>
                    {(s.title as string) || (s as { name?: string }).name || JSON.stringify(s)}
                    {i < adminRow.services.length - 1 ? " · " : ""}
                  </span>
                ))}
              </p>
            </>
          )}

          <div className="btn-row">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                bump("reset");
                setErrMsg(null);
                setOkMsg(null);
                const { min, max } = parseBudgetBounds(
                  adminRow?.budget_range_min,
                  adminRow?.budget_range_max
                );
                setForm({
                  ...emptyForm(),
                  budget: String(Math.round((min + max) / 2)),
                });
              }}
            >
              Очистить
            </button>
            <button className="primary" type="submit" disabled={sending}>
              {sending ? "Отправка…" : "Отправить заявку"}
            </button>
          </div>

          {okMsg && <div className="status ok">{okMsg}</div>}
          {errMsg && <div className="status err">{errMsg}</div>}
        </form>
      </div>
    </div>
  );
}
