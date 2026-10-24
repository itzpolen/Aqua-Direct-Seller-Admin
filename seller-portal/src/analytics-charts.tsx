import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

/* ----------------------------------------------------------------------------
 * Seller analytics charts.
 *
 * Hand-built SVG/HTML, no chart library. Every chart has an intro animation
 * (CSS only, switched off for prefers-reduced-motion), a hover/focus tooltip
 * and values that are also reachable without hovering (labels or table view).
 * Styling lives in styles.css under the "analytics charts" section.
 * -------------------------------------------------------------------------- */

const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

/* ------------------------------------------------------------------ helpers */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setWidth(Math.round(node.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round the axis to clean numbers: 0 / 500 / 1,000 / 1,500 ... */
function niceScale(maxValue: number, target = 4) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { max: 4, ticks: [0, 1, 2, 3, 4] };
  }
  const raw = maxValue / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;
  const count = Math.ceil(maxValue / step - 1e-9);
  return {
    max: count * step,
    ticks: Array.from({ length: count + 1 }, (_, index) => index * step),
  };
}

/** Column with a 4px rounded data end and a square baseline. */
function barPath(x: number, y: number, width: number, height: number, radius = 4) {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const shortDateFormat = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function addUtcDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dateLabel(value: string) {
  return shortDateFormat.format(new Date(`${value}T12:00:00Z`));
}

/* ------------------------------------------------------------------ count-up */

export function CountUp({
  value,
  format,
  duration = 900,
}: {
  value: number;
  format: (value: number) => string;
  duration?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const fromRef = useRef(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = from + (value - from) * eased;
      fromRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  return <>{format(shown)}</>;
}

/* ----------------------------------------------------------------- sparkline */

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const width = 120;
  const height = 38;
  const pad = 3;
  if (values.length < 2) return null;
  const max = Math.max(...values, 0);
  const flat = max <= 0;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = flat ? height - pad : height - pad - (value / max) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const area = `${line}L${width},${height}L0,${height}Z`;
  return (
    <svg
      className={`viz-spark${flat ? " is-flat" : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <path className="viz-spark-area" d={area} />
      <path className="viz-spark-line" d={line} pathLength={1} />
    </svg>
  );
}

/* ------------------------------------------------------------------ KPI tile */

export interface KpiDelta {
  text: string;
  direction: "up" | "down" | "flat";
}

export function KpiTile({
  label,
  icon,
  tone,
  value,
  caption,
  delta,
  spark,
  sparkLabel,
  hero = false,
  action,
}: {
  label: string;
  icon: ReactNode;
  tone: "blue" | "green" | "amber";
  value: ReactNode;
  caption: string;
  delta?: KpiDelta | null;
  spark?: number[];
  sparkLabel?: string;
  hero?: boolean;
  action?: ReactNode;
}) {
  return (
    <article className={`viz-kpi${hero ? " is-hero" : ""}`}>
      <div className="viz-kpi-top">
        <span className={`viz-kpi-icon tone-${tone}`}>{icon}</span>
        <span className="viz-kpi-label">{label}</span>
      </div>
      <div className="viz-kpi-main">
        <strong className="viz-kpi-value">{value}</strong>
        {delta && (
          <span className={`viz-delta is-${delta.direction}`}>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              {delta.direction === "down"
                ? <path d="M6 2.5v7M3 6.8 6 9.8l3-3" />
                : delta.direction === "up"
                  ? <path d="M6 9.5v-7M3 5.2 6 2.2l3 3" />
                  : <path d="M2.5 6h7" />}
            </svg>
            {delta.text}
          </span>
        )}
      </div>
      <div className="viz-kpi-bottom">
        <small>{caption}</small>
        {action}
      </div>
      {spark && spark.length > 1 && <Sparkline values={spark} label={sparkLabel ?? `${label} trend`} />}
    </article>
  );
}

/* ----------------------------------------------------------- section chips */

export function SectionNav({ items }: { items: Array<{ id: string; label: string }> }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = items.find((item) => visible.has(item.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-130px 0px -55% 0px", threshold: 0 },
    );
    for (const item of items) {
      const node = document.getElementById(item.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="viz-nav" aria-label="Analytics sections">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={active === item.id ? "is-active" : ""}
          aria-current={active === item.id ? "true" : undefined}
          onClick={() => {
            setActive(item.id);
            document.getElementById(item.id)?.scrollIntoView({
              behavior: reduced ? "auto" : "smooth",
              block: "start",
            });
          }}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

/* ---------------------------------------------------------------- rank bars */

export interface RankItem {
  key: string;
  label: string;
  sub?: string;
  valueLabel: string;
  /** Raw number the bar length is based on. */
  value: number;
  /** Share of the total, 0 to 1. Shown as a percentage next to the value. */
  share?: number;
}

/** Horizontal bars for rankings: the leader is solid, the rest are lighter. */
export function RankBars({ items, emptyText }: { items: RankItem[]; emptyText: string }) {
  if (items.length === 0) return <p className="analytics-empty">{emptyText}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ol className="viz-rank">
      {items.map((item, index) => (
        <li
          key={item.key}
          className={index === 0 ? "is-lead" : ""}
          style={cssVars({ "--i": index })}
          title={`${item.label}${item.sub ? ` (${item.sub})` : ""}: ${item.valueLabel}`}
        >
          <div className="viz-rank-head">
            <span className="viz-rank-index">{index + 1}</span>
            <span className="viz-rank-label">
              <strong>{item.label}</strong>
              {item.sub && <small>{item.sub}</small>}
            </span>
            <span className="viz-rank-value">
              <strong>{item.valueLabel}</strong>
              {item.share !== undefined && <small>{Math.round(item.share * 100)}%</small>}
            </span>
          </div>
          <div className="viz-rank-track">
            <span className="viz-rank-fill" style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------- mini columns */

export interface ColumnItem {
  key: string;
  label: string;
  value: number;
  valueLabel: string;
  detail: string;
  emphasis?: boolean;
}

/** A short column chart for a handful of categories. */
export function MiniColumns({
  items,
  ariaLabel,
  height = 150,
}: {
  items: ColumnItem[];
  ariaLabel: string;
  height?: number;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div
      className="viz-cols"
      role="group"
      aria-label={ariaLabel}
      style={cssVars({ "--cols": items.length, "--plot": `${height}px` })}
    >
      {items.map((item, index) => (
        <div
          key={item.key}
          className={`viz-col${item.emphasis ? " is-peak" : ""}`}
          tabIndex={0}
          aria-label={`${item.label}: ${item.valueLabel} ${item.detail}`}
          style={cssVars({ "--i": index })}
        >
          <div className="viz-col-plot">
            {item.value > 0 && item.emphasis && <span className="viz-col-value">{item.valueLabel}</span>}
            <span
              className="viz-col-bar"
              style={{ height: item.value > 0 ? `${Math.max((item.value / max) * 100, 3)}%` : "0%" }}
            />
            <span className="viz-col-tip" role="tooltip">
              <strong>{item.valueLabel}</strong>
              <span>{item.detail}</span>
            </span>
          </div>
          <span className="viz-col-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- sales trend chart */

export interface SalesDay {
  day: number;
  date: string;
  sales: number;
  orders: number;
}

interface SalesTrendChartProps {
  days: SalesDay[];
  previousDaily: number[];
  todayDay: number;
  rangeLabel: string;
  previousRangeLabel: string;
  previousStartDate: string;
  paidOrderCount: number;
  formatMoney: (value: number) => string;
  formatAxis: (value: number) => string;
}

type TrendMode = "daily" | "cumulative";

export function SalesTrendChart({
  days,
  previousDaily,
  todayDay,
  rangeLabel,
  previousRangeLabel,
  previousStartDate,
  paidOrderCount,
  formatMoney,
  formatAxis,
}: SalesTrendChartProps) {
  const [mode, setMode] = useState<TrendMode>("daily");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [active, setActive] = useState<number | null>(null);
  const [plotRef, width] = useElementWidth<HTMLDivElement>();

  const count = days.length;
  const todayIndex = Math.min(Math.max(todayDay, 1), count) - 1;
  const currentShort = rangeLabel;
  const previousShort = previousRangeLabel;
  const dayLabel = (index: number) =>
    dateFormat.format(new Date(`${days[index].date}T12:00:00Z`));
  const previousDayLabel = (index: number) =>
    dateFormat.format(new Date(`${addUtcDays(previousStartDate, index)}T12:00:00Z`));

  const stats = useMemo(() => {
    const cumulative: number[] = [];
    let running = 0;
    for (const day of days) {
      running += day.sales;
      cumulative.push(running);
    }
    const previousCumulative: number[] = [];
    running = 0;
    for (const value of previousDaily) {
      running += value;
      previousCumulative.push(running);
    }
    const elapsed = days.slice(0, todayIndex + 1);
    const total = elapsed.reduce((sum, day) => sum + day.sales, 0);
    let peak = 0;
    let peakIndex = -1;
    elapsed.forEach((day, index) => {
      if (day.sales > peak) {
        peak = day.sales;
        peakIndex = index;
      }
    });
    return {
      cumulative,
      previousCumulative,
      total,
      average: total / Math.max(elapsed.length, 1),
      peak,
      peakIndex,
      previousTotal: previousCumulative[previousCumulative.length - 1] ?? 0,
    };
  }, [days, previousDaily, todayIndex]);

  const hasSales = stats.total > 0 || stats.previousTotal > 0;
  const previousCount = Math.min(previousDaily.length, count);

  const dailyMax = Math.max(...days.slice(0, todayIndex + 1).map((day) => day.sales), 0);
  const cumulativeMax = Math.max(
    stats.cumulative[todayIndex] ?? 0,
    stats.previousCumulative[previousCount - 1] ?? 0,
    0,
  );
  const scale = niceScale(mode === "daily" ? dailyMax : cumulativeMax);

  const w = width;
  const compact = w < 520;
  const height = compact ? 236 : 292;
  const margin = { top: 22, right: 14, bottom: 30, left: compact ? 42 : 50 };
  const innerW = Math.max(w - margin.left - margin.right, 40);
  const innerH = height - margin.top - margin.bottom;
  const band = innerW / count;
  const xAt = (index: number) => margin.left + band * (index + 0.5);
  const yAt = (value: number) => margin.top + innerH - (value / scale.max) * innerH;
  const baseline = yAt(0);

  const clampIndex = (index: number) => Math.min(Math.max(index, 0), todayIndex);
  const onPointerMove = (event: ReactPointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor(((event.clientX - rect.left) / rect.width) * count);
    setActive(index > todayIndex ? null : clampIndex(index));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (view !== "chart") return;
    const current = active ?? todayIndex;
    if (event.key === "ArrowLeft") setActive(clampIndex(current - 1));
    else if (event.key === "ArrowRight") setActive(clampIndex(current + 1));
    else if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(todayIndex);
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };

  const activeDay = active === null ? null : days[active];
  const activeSummary = activeDay === null || active === null
    ? ""
    : mode === "daily"
      ? `${dayLabel(active)}: ${formatMoney(activeDay.sales)} paid sales from ${activeDay.orders} orders placed`
      : `${dayLabel(active)}: ${formatMoney(stats.cumulative[active] ?? 0)} in selected range, `
        + `${formatMoney(stats.previousCumulative[active] ?? 0)} in previous range`;

  const labelStride = Math.max(1, Math.ceil(count / 7));
  const labelDays = days.filter((_, index) =>
    index === 0 || (index + 1) % labelStride === 0 || index === count - 1);

  // Tooltip sits beside the crosshair, flipping at the right edge.
  const tipWidth = 196;
  const tipLeft = active === null
    ? 0
    : xAt(active) + 14 + tipWidth > w - 4
      ? Math.max(xAt(active) - 14 - tipWidth, 4)
      : xAt(active) + 14;

  const linePath = (points: Array<readonly [number, number]>) =>
    points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const currentPoints = stats.cumulative.slice(0, todayIndex + 1).map((value, index) => [xAt(index), yAt(value)] as const);
  const previousPoints = stats.previousCumulative.slice(0, previousCount).map((value, index) => [xAt(index), yAt(value)] as const);
  const lastPoint = currentPoints[currentPoints.length - 1];

  const switchMode = (next: TrendMode) => {
    setMode(next);
    setActive(null);
  };

  const chartLabel = mode === "daily"
    ? `Daily paid sales for ${rangeLabel}. Total ${formatMoney(stats.total)}`
      + (stats.peakIndex >= 0 ? `. Best day ${dayLabel(stats.peakIndex)} at ${formatMoney(stats.peak)}.` : ".")
    : `Cumulative paid sales for ${rangeLabel} against ${previousShort}. `
      + `${formatMoney(stats.total)} in the selected range.`;

  return (
    <section className="panel viz-panel" aria-label="Paid sales trend">
      <div className="viz-panel-head">
        <div>
          <h2>Paid sales trend</h2>
          <p>{rangeLabel} · excludes delivery fees and cancelled orders</p>
        </div>
        <div className="viz-controls">
          <div className="viz-segment" role="group" aria-label="Chart type">
            <button type="button" aria-pressed={mode === "daily"} onClick={() => switchMode("daily")}>Daily</button>
            <button type="button" aria-pressed={mode === "cumulative"} onClick={() => switchMode("cumulative")}>
              vs previous period
            </button>
          </div>
          <button
            type="button"
            className="viz-toggle"
            aria-pressed={view === "table"}
            onClick={() => {
              setView(view === "chart" ? "table" : "chart");
              setActive(null);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 3.5h11v9h-11zM2.5 7h11M2.5 10h11M6.5 3.5v9" />
            </svg>
            {view === "chart" ? "Table" : "Chart"}
          </button>
        </div>
      </div>

      <dl className="viz-summary">
        <div>
          <dt>Best day</dt>
          <dd>{stats.peak > 0 ? formatMoney(stats.peak) : "—"}</dd>
          <small>{stats.peakIndex >= 0 ? dayLabel(stats.peakIndex) : "No paid sales yet"}</small>
        </div>
        <div>
          <dt>Daily average</dt>
          <dd>{formatMoney(stats.average)}</dd>
          <small>over {todayIndex + 1} selected day{todayIndex === 0 ? "" : "s"}</small>
        </div>
        <div>
          <dt>Paid orders</dt>
          <dd>{paidOrderCount}</dd>
          <small>in selected range</small>
        </div>
        <div>
          <dt>Average order</dt>
          <dd>{paidOrderCount > 0 ? formatMoney(stats.total / paidOrderCount) : "—"}</dd>
          <small>per paid order</small>
        </div>
      </dl>

      {view === "chart" && hasSales && mode === "cumulative" && (
        <div className="viz-legend" aria-hidden="true">
          <span><i className="key key-current" />{currentShort}</span>
          <span><i className="key key-previous" />{previousShort}</span>
        </div>
      )}

      <div
        className={`viz-plot${view === "chart" && hasSales ? " is-chart" : ""}`}
        ref={plotRef}
        tabIndex={view === "chart" && hasSales ? 0 : undefined}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (view === "chart" && active === null) setActive(todayIndex);
        }}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        {!hasSales && (
          <div className="analytics-empty">Paid sales will appear here when payments are received.</div>
        )}

        {hasSales && view === "table" && (
          <div className="viz-table-wrap">
            <table className="viz-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Orders placed</th>
                  <th scope="col">Paid sales</th>
                  <th scope="col">Range total</th>
                  <th scope="col">Previous range total</th>
                </tr>
              </thead>
              <tbody>
                {days.slice(0, todayIndex + 1).map((day, index) => (
                  <tr key={day.day}>
                    <th scope="row">{dayLabel(index)}</th>
                    <td>{day.orders}</td>
                    <td>{formatMoney(day.sales)}</td>
                    <td>{formatMoney(stats.cumulative[index] ?? 0)}</td>
                    <td>{index < previousCount ? formatMoney(stats.previousCumulative[index] ?? 0) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasSales && view === "chart" && w > 0 && (
          <>
            <svg className="viz-svg" width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={chartLabel}>
              {scale.ticks.map((tick) => (
                <g key={tick} className="viz-grid">
                  <line
                    className={tick === 0 ? "viz-axis" : "viz-gridline"}
                    x1={margin.left}
                    x2={w - margin.right}
                    y1={yAt(tick)}
                    y2={yAt(tick)}
                  />
                  <text x={margin.left - 8} y={yAt(tick) + 3.5} textAnchor="end">{formatAxis(tick)}</text>
                </g>
              ))}

              {labelDays.map((day) => (
                <text
                  key={day.day}
                  className="viz-xlabel"
                  x={xAt(day.day - 1)}
                  y={baseline + 18}
                  textAnchor="middle"
                >
                  {dateLabel(day.date)}
                </text>
              ))}
              <rect className="viz-today-mark" x={xAt(todayIndex) - 7} y={baseline + 3} width={14} height={2.5} rx={1.25} />

              <g key={mode} className="viz-series">
                {mode === "daily" && (
                  <>
                    {days.slice(0, todayIndex + 1).map((day, index) => {
                      if (day.sales <= 0) return null;
                      const barWidth = Math.max(Math.min(24, band * 0.68), 2);
                      const barHeight = (day.sales / scale.max) * innerH;
                      return (
                        <path
                          key={day.day}
                          className={`viz-bar${active === index ? " is-active" : ""}${active !== null && active !== index ? " is-dim" : ""}`}
                          d={barPath(xAt(index) - barWidth / 2, baseline - barHeight, barWidth, barHeight)}
                          style={cssVars({ "--i": index })}
                        />
                      );
                    })}
                    {stats.average > 0 && (
                      <g className="viz-ref">
                        <line x1={margin.left} x2={w - margin.right} y1={yAt(stats.average)} y2={yAt(stats.average)} />
                        <text x={w - margin.right - 4} y={yAt(stats.average) - 6} textAnchor="end">
                          {compact ? `Avg ${formatAxis(stats.average)}` : `Avg ${formatAxis(stats.average)} / day`}
                        </text>
                      </g>
                    )}
                    {stats.peakIndex >= 0 && active === null && (
                      <text
                        className="viz-peak"
                        x={Math.min(Math.max(xAt(stats.peakIndex), margin.left + 22), w - margin.right - 22)}
                        y={yAt(stats.peak) - 7}
                        textAnchor="middle"
                      >
                        {formatAxis(stats.peak)}
                      </text>
                    )}
                  </>
                )}

                {mode === "cumulative" && (
                  <>
                    {currentPoints.length > 1 && (
                      <path
                        className="viz-area"
                        d={`${linePath(currentPoints)}L${lastPoint[0]},${baseline}L${currentPoints[0][0]},${baseline}Z`}
                      />
                    )}
                    {previousPoints.length > 1 && (
                      <path className="viz-line viz-line-previous" d={linePath(previousPoints)} pathLength={1} />
                    )}
                    {currentPoints.length > 1 && (
                      <path className="viz-line viz-line-current" d={linePath(currentPoints)} pathLength={1} />
                    )}
                    {lastPoint && (
                      <>
                        <g className="viz-dot-pop">
                          <circle cx={lastPoint[0]} cy={lastPoint[1]} r={6.5} className="viz-ring" />
                          <circle cx={lastPoint[0]} cy={lastPoint[1]} r={4.5} className="viz-dot-current" />
                        </g>
                        {active === null && (
                          <text
                            className="viz-peak"
                            x={Math.min(lastPoint[0] + 4, w - margin.right - 4)}
                            y={lastPoint[1] - 14}
                            textAnchor="end"
                          >
                            {formatAxis(stats.cumulative[todayIndex] ?? 0)}
                          </text>
                        )}
                      </>
                    )}
                  </>
                )}
              </g>

              {active !== null && (
                <g className="viz-hover" pointerEvents="none">
                  <line className="viz-cross" x1={xAt(active)} x2={xAt(active)} y1={margin.top} y2={baseline} />
                  {mode === "cumulative" && (
                    <>
                      {active < previousCount && (
                        <>
                          <circle cx={xAt(active)} cy={yAt(stats.previousCumulative[active] ?? 0)} r={6} className="viz-ring" />
                          <circle cx={xAt(active)} cy={yAt(stats.previousCumulative[active] ?? 0)} r={4} className="viz-dot-previous" />
                        </>
                      )}
                      <circle cx={xAt(active)} cy={yAt(stats.cumulative[active] ?? 0)} r={6.5} className="viz-ring" />
                      <circle cx={xAt(active)} cy={yAt(stats.cumulative[active] ?? 0)} r={4.5} className="viz-dot-current" />
                    </>
                  )}
                </g>
              )}

              <rect
                className="viz-hit"
                x={margin.left}
                y={margin.top}
                width={innerW}
                height={innerH + 10}
                onPointerMove={onPointerMove}
                onPointerDown={onPointerMove}
              />
            </svg>

            {active !== null && activeDay && (
              <div className="viz-tip" style={{ left: tipLeft, top: margin.top, width: tipWidth }} aria-hidden="true">
                <span className="viz-tip-date">{dayLabel(active)}</span>
                {mode === "daily" ? (
                  <>
                    <div className="viz-tip-row">
                      <i className="key key-current" />
                      <strong>{formatMoney(activeDay.sales)}</strong>
                      <span>paid sales</span>
                    </div>
                    <div className="viz-tip-row is-plain">
                      <strong>{activeDay.orders}</strong>
                      <span>order{activeDay.orders === 1 ? "" : "s"} placed</span>
                    </div>
                    {active < previousCount && (
                      <div className="viz-tip-row is-plain">
                        <strong>{formatMoney(previousDaily[active] ?? 0)}</strong>
                        <span>on {previousDayLabel(active)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="viz-tip-row">
                      <i className="key key-current" />
                      <strong>{formatMoney(stats.cumulative[active] ?? 0)}</strong>
                      <span>{currentShort}</span>
                    </div>
                    <div className="viz-tip-row">
                      <i className="key key-previous" />
                      <strong>{active < previousCount ? formatMoney(stats.previousCumulative[active] ?? 0) : "—"}</strong>
                      <span>{previousShort}</span>
                    </div>
                    {active < previousCount && (() => {
                      const diff = (stats.cumulative[active] ?? 0) - (stats.previousCumulative[active] ?? 0);
                      return (
                        <div className={`viz-tip-diff ${diff > 0 ? "is-up" : diff < 0 ? "is-down" : ""}`}>
                          {diff === 0 ? "Even with previous period" : `${diff > 0 ? "+" : "−"}${formatMoney(Math.abs(diff))} vs previous period`}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
            <span className="viz-sr" aria-live="polite">{activeSummary}</span>
          </>
        )}
      </div>

      {view === "chart" && hasSales && (
        <p className="viz-hint">
          {mode === "daily"
            ? "Hover or use the arrow keys to read a day. The thin line is the daily average."
            : `Running total of paid sales, ${currentShort} against ${previousShort}.`}
        </p>
      )}
    </section>
  );
}
