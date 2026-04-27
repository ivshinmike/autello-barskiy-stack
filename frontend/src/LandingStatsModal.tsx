import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchLeadBehaviorPings,
  sendTestLeadBehaviorPing,
  setAdminToken,
  UnauthorizedError,
  type LeadBehaviorPingRow,
} from "./api";

type Props = {
  token: string;
  onClose: () => void;
  onAuthError: () => void;
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildDailyMaxMap(rows: LeadBehaviorPingRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.created_at);
    const k = dayKey(d);
    const v = r.time_on_page;
    m.set(k, Math.max(m.get(k) ?? 0, v));
  }
  return m;
}

/** Среднее дневных максимумов `time_on_page` за последние `n` календарных дней (только дни с данными). */
function avgDailyMaxOverPastDays(rows: LeadBehaviorPingRow[], n: number): number | null {
  const m = buildDailyMaxMap(rows);
  const vals: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const v = m.get(dayKey(d));
    if (v != null && v > 0) vals.push(v);
  }
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function fmtDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m === 0) return `${s} с`;
  return `${m} мин ${s} с`;
}

function parseCursorPoints(raw: string): { x: number; y: number }[] {
  if (!raw?.trim()) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    const out: { x: number; y: number }[] = [];
    for (const p of j) {
      if (!p || typeof p !== "object") continue;
      const o = p as { x?: unknown; y?: unknown };
      const x = Number(o.x);
      const y = Number(o.y);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
    }
    return out;
  } catch {
    return [];
  }
}

const MAX_POINTS = 60_000;

function buildHeatmapModel(rows: LeadBehaviorPingRow[]) {
  let points: { x: number; y: number }[] = [];
  for (const r of rows) {
    points.push(...parseCursorPoints(r.cursor_positions));
  }
  if (!points.length) return null;
  if (points.length > MAX_POINTS) {
    const step = Math.ceil(points.length / MAX_POINTS);
    points = points.filter((_, i) => i % step === 0);
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = Math.max(32, span * 0.06);
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const bw = maxX - minX;
  const bh = maxY - minY;
  const COLS = 56;
  const cellW = bw / COLS;
  const ROWS = Math.max(28, Math.round((COLS * bh) / bw));
  const cellH = bh / ROWS;
  const bin = new Map<string, number>();
  for (const p of points) {
    let bx = Math.floor((p.x - minX) / cellW);
    let by = Math.floor((p.y - minY) / cellH);
    bx = Math.max(0, Math.min(COLS - 1, bx));
    by = Math.max(0, Math.min(ROWS - 1, by));
    const key = `${bx},${by}`;
    bin.set(key, (bin.get(key) ?? 0) + 1);
  }
  let maxCount = 0;
  const rawCells: { cx: number; cy: number; count: number; r: number }[] = [];
  for (const [key, count] of bin) {
    maxCount = Math.max(maxCount, count);
    const [bx, by] = key.split(",").map(Number);
    const cx = minX + (bx + 0.5) * cellW;
    const cy = minY + (by + 0.5) * cellH;
    rawCells.push({ cx, cy, count, r: 0 });
  }
  const maxR = Math.min(cellW, cellH) * 0.5;
  const minR = Math.min(cellW, cellH) * 0.1;
  for (const c of rawCells) {
    const t = maxCount > 0 ? c.count / maxCount : 0;
    c.r = minR + t * (maxR - minR);
  }
  return {
    cells: rawCells,
    vb: { x: minX, y: minY, w: bw, h: bh },
    maxCount,
    pointTotal: points.length,
  };
}

const FETCH_LIMIT = 2500;

export default function LandingStatsModal({ token, onClose, onAuthError }: Props) {
  const [rows, setRows] = useState<LeadBehaviorPingRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const data = await fetchLeadBehaviorPings(token, {
        skip: 0,
        limit: FETCH_LIMIT,
      });
      setRows(data);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setAdminToken(null);
        onAuthError();
        return;
      }
      setLoadErr(e instanceof Error ? e.message : "Ошибка загрузки");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, onAuthError]);

  useEffect(() => {
    void load();
  }, [load]);

  const runTestPost = useCallback(async () => {
    setTestBusy(true);
    setTestResult(null);
    try {
      const res = await sendTestLeadBehaviorPing();
      if (res.ok) {
        setTestResult(
          `Тестовый POST успешен (${res.status}). Запись должна появиться в lead_behavior_pings. Обновляем список…`
        );
        await load();
      } else {
        setTestResult(
          `Тестовый POST отклонён: HTTP ${res.status}. Ответ: ${res.detail || "—"}. Проверьте логи бэкенда и наличие таблицы lead_behavior_pings.`
        );
      }
    } catch (e) {
      setTestResult(
        `Сеть: ${e instanceof Error ? e.message : "ошибка"}. Проверьте, что страница открыта с того же хоста, что и API (или задайте VITE_API_BASE).`
      );
    } finally {
      setTestBusy(false);
    }
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dailyMap = useMemo(
    () => (rows?.length ? buildDailyMaxMap(rows) : new Map<string, number>()),
    [rows]
  );

  const statToday = useMemo(() => {
    if (!rows?.length) return null;
    const v = dailyMap.get(dayKey(new Date()));
    return v != null && v > 0 ? v : null;
  }, [rows, dailyMap]);

  const statWeek = useMemo(
    () => (rows?.length ? avgDailyMaxOverPastDays(rows, 7) : null),
    [rows]
  );

  const statMonth = useMemo(
    () => (rows?.length ? avgDailyMaxOverPastDays(rows, 30) : null),
    [rows]
  );

  const heat = useMemo(() => (rows?.length ? buildHeatmapModel(rows) : null), [rows]);

  return (
    <div
      className="stats-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-modal-title"
      onClick={onClose}
    >
      <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="stats-modal-head">
          <h2 id="stats-modal-title" className="stats-modal-title">
            Статистика лендинга (заявка)
          </h2>
          <div className="stats-modal-actions">
            <button type="button" className="ghost stats-modal-refresh" onClick={() => void load()}>
              Обновить
            </button>
            <button type="button" className="ghost stats-modal-close" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>

        <p className="stats-modal-hint">
          Данные: до {FETCH_LIMIT} последних записей телеметрии (
          <code className="admin-code">GET /api/lead-behavior/records?skip=0&amp;limit=…</code>
          ). Время — максимальное зафиксированное «секунд на странице» в снимке; по дням усредняются
          только дни, где есть замеры.
        </p>
        <p className="stats-modal-hint stats-modal-hint--warn">
          <strong>Важно для pgAdmin:</strong> поток раз в секунду с лендинга пишется в таблицу{" "}
          <code className="admin-code">lead_behavior_pings</code> (поля{" "}
          <code className="admin-code">time_on_page</code>,{" "}
          <code className="admin-code">buttons_clicked</code>,{" "}
          <code className="admin-code">cursor_positions</code>). Таблица{" "}
          <code className="admin-code">lead_behaviors</code> — другая сущность: одна строка на
          отправленную заявку (<code className="admin-code">application_id</code> = id из{" "}
          <code className="admin-code">warm_leads</code>), заполняется при POST{" "}
          <code className="admin-code">/api/warm-leads</code>, а не из секундной телеметрии.
        </p>

        <div className="stats-modal-debug">
          <p className="stats-modal-hint stats-modal-hint--compact">
            <strong>Нет строк в выборке?</strong> Секундная телеметрия шлётся только с{" "}
            <strong>главной страницы заявки</strong> (маршрут «/», не админка). Подержите вкладку
            открытой несколько секунд. В консоли браузера при ошибках POST смотрите сообщения{" "}
            <code className="admin-code">[autello] POST /api/lead-behavior</code>.
          </p>
          <div className="stats-modal-debug-row">
            <button
              type="button"
              className="ghost stats-modal-test-btn"
              disabled={testBusy || loading}
              onClick={() => void runTestPost()}
            >
              {testBusy ? "Отправка теста…" : "Проверить цепочку: тестовый POST в lead_behavior_pings"}
            </button>
          </div>
          {testResult ? (
            <div
              className={
                testResult.startsWith("Тестовый POST успешен")
                  ? "status ok stats-modal-test-result"
                  : "status err stats-modal-test-result"
              }
            >
              {testResult}
            </div>
          ) : null}
        </div>

        {loading && <p className="hint">Загрузка…</p>}
        {loadErr && <div className="status err">{loadErr}</div>}

        {!loading && !loadErr && rows && (
          <>
            <section className="stats-section">
              <h3 className="stats-section-title">Время на странице</h3>
              <div className="stats-metrics">
                <div className="stats-metric">
                  <span className="stats-metric-label">Сегодня (макс. за день)</span>
                  <span className="stats-metric-value">{fmtDuration(statToday)}</span>
                </div>
                <div className="stats-metric">
                  <span className="stats-metric-label">7 дней (среднее дневных макс.)</span>
                  <span className="stats-metric-value">{fmtDuration(statWeek)}</span>
                </div>
                <div className="stats-metric">
                  <span className="stats-metric-label">30 дней (среднее дневных макс.)</span>
                  <span className="stats-metric-value">{fmtDuration(statMonth)}</span>
                </div>
              </div>
              <p className="stats-mini-hint">Записей в выборке: {rows.length}</p>
            </section>

            <section className="stats-section stats-section--heatmap">
              <h3 className="stats-section-title">Хит-карта курсора</h3>
              <p className="stats-mini-hint">
                Кружки — плотность позиций мыши (ярче и крупнее = чаще). Учтено до {MAX_POINTS.toLocaleString("ru-RU")}{" "}
                точек.
              </p>
              {heat ? (
                <div className="stats-heatmap-wrap">
                  <svg
                    className="stats-heatmap-svg"
                    viewBox={`${heat.vb.x} ${heat.vb.y} ${heat.vb.w} ${heat.vb.h}`}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <rect
                      x={heat.vb.x}
                      y={heat.vb.y}
                      width={heat.vb.w}
                      height={heat.vb.h}
                      fill="rgba(8, 6, 14, 0.5)"
                      stroke="rgba(212, 175, 55, 0.2)"
                      strokeWidth={Math.max(1, heat.vb.w / 500)}
                    />
                    {heat.cells.map((c, i) => {
                      const intensity = heat.maxCount > 0 ? c.count / heat.maxCount : 0;
                      return (
                        <circle
                          key={`${c.cx}-${c.cy}-${i}`}
                          cx={c.cx}
                          cy={c.cy}
                          r={c.r}
                          fill={`rgba(212, 175, 55, ${0.12 + 0.72 * intensity})`}
                          stroke={`rgba(255, 230, 160, ${0.25 + 0.5 * intensity})`}
                          strokeWidth={Math.max(0.4, heat.vb.w / 600)}
                        />
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <p className="hint">Нет координат курсора в загруженных записях.</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
