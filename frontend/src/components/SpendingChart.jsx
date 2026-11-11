import { useId, useState } from "react";
import { ChartBar, Table2 } from "lucide-react";
import { formatPrice } from "../format.js";

// "2026-05-11" → "11 maj 2026" (read as a local date – new Date("2026-05-11") would be UTC)
function formatDate(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
}

// "Vem har jag köpt till?" – a horizontal bar chart: how much I've spent (my share) per recipient,
// for gifts to events in the chosen period. One series, so one colour (the brand rose) and no legend.
// Values at the bar tips, a tooltip on hover/focus with the number of gifts, and a table view.
//
// The period counts from N months back up to today – and includes coming events I've already bought
// for, plus gifts from wish profiles (they have no date). "Eget": two dates, from and to (both included);
// gifts without a date aren't in a range of my own. Several recipients on one list ("Anna, Bert")
// make one bar. More than MAX_BARS people: the rest fold into "Övriga".
const PERIODS = [
    { key: "3m", label: "3 mån", months: 3 },
    { key: "6m", label: "6 mån", months: 6 },
    { key: "12m", label: "12 mån", months: 12 },
    { key: "year", label: "I år" },
    { key: "all", label: "Allt" },
    { key: "custom", label: "Eget" },
];
const MAX_BARS = 8;

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The first date in the period (as "YYYY-MM-DD"), or null for all time
function periodStart(period) {
    const today = new Date();
    if (period.key === "all") return null;
    if (period.key === "year") return `${today.getFullYear()}-01-01`;
    const d = new Date(today.getFullYear(), today.getMonth() - period.months, today.getDate());
    return iso(d);
}

// A clean axis maximum (1, 2 or 5 × 10^n) and its ticks
function niceScale(max) {
    if (max <= 0) return { top: 100, ticks: [0, 50, 100] };
    const step10 = 10 ** Math.floor(Math.log10(max / 4));
    const step = [1, 2, 5, 10].map((m) => m * step10).find((s) => max / s <= 4);
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let t = 0; t <= top + step / 2; t += step) ticks.push(t);
    return { top, ticks };
}

// "1 200 kr" on the axis without "kr" – the column title says it
const tickText = (v) => new Intl.NumberFormat("sv-SE").format(v);

export default function SpendingChart({ gifts }) {
    // "Eget" (the coming events, see below) is chosen from the start
    const [periodKey, setPeriodKey] = useState("custom");
    // "Eget": the coming events to begin with – from today to the last coming event's date
    // (six months ahead if there's none)
    const [custom, setCustom] = useState(() => {
        const today = iso(new Date());
        const coming = gifts.map((g) => g.endDate).filter((d) => d && d >= today).sort();
        const sixMonthsAhead = new Date();
        sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);
        return { from: today, to: coming.at(-1) ?? iso(sixMonthsAhead) };
    });
    const [asTable, setAsTable] = useState(false);
    const titleId = useId();
    const period = PERIODS.find((p) => p.key === periodKey);
    const isCustom = periodKey === "custom";
    const start = isCustom ? custom.from || null : periodStart(period);
    const end = isCustom ? custom.to || null : null;

    // My share per recipient, in the period
    const byPerson = new Map();
    for (const g of gifts) {
        if (isCustom && !g.endDate) continue; // no date: not in a range of my own
        if (start && g.endDate && g.endDate < start) continue;
        if (end && g.endDate && g.endDate > end) continue;
        const who = g.recipients || g.eventName || "Okänd mottagare";
        const row = byPerson.get(who) ?? { name: who, amount: 0, count: 0 };
        row.amount += Math.round((g.myShare ?? 0) * 100);
        row.count += 1;
        byPerson.set(who, row);
    }
    let rows = [...byPerson.values()]
        .map((r) => ({ ...r, amount: r.amount / 100 }))
        .filter((r) => r.amount > 0)
        .sort((a, b) => b.amount - a.amount);
    if (rows.length > MAX_BARS) {
        const rest = rows.slice(MAX_BARS - 1);
        rows = [
            ...rows.slice(0, MAX_BARS - 1),
            {
                name: `Övriga (${rest.length})`,
                amount: rest.reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100,
                count: rest.reduce((s, r) => s + r.count, 0),
                isRest: true,
            },
        ];
    }
    const total = rows.reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100;
    const { top, ticks } = niceScale(rows[0]?.amount ?? 0);

    return (
        <section className="section spending" aria-labelledby={titleId}>
            <div className="section-head spending-head">
                <div>
                    <h2 id={titleId}>Vem har jag köpt till?</h2>
                    <p className="muted small spending-sub">
                        Min del av gåvorna
                        {isCustom
                            ? start && end
                                ? ` ${formatDate(start)} – ${formatDate(end)}`
                                : start
                                  ? ` sedan ${formatDate(start)}`
                                  : end
                                    ? ` till och med ${formatDate(end)}`
                                    : ""
                            : start
                              ? ` sedan ${formatDate(start)}`
                              : ""}
                        {rows.length > 0 && <> · totalt <strong>{formatPrice(total)}</strong></>}
                    </p>
                </div>
                {/* The filters in one row above the chart: the period, and chart / table */}
                <div className="spending-controls">
                    <div className="segmented" role="radiogroup" aria-label="Period">
                        {PERIODS.map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                role="radio"
                                aria-checked={p.key === periodKey}
                                className={`segmented-option${p.key === periodKey ? " is-active" : ""}`}
                                onClick={() => setPeriodKey(p.key)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        onClick={() => setAsTable(!asTable)}
                        aria-pressed={asTable}
                    >
                        {asTable ? (
                            <>
                                <ChartBar size={16} aria-hidden="true" /> Diagram
                            </>
                        ) : (
                            <>
                                <Table2 size={16} aria-hidden="true" /> Tabell
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* "Eget": the two dates, under the controls */}
            {isCustom && (
                <div className="field-row spending-range">
                    <label className="field">
                        <span>Från</span>
                        <input
                            type="date"
                            value={custom.from}
                            max={custom.to || undefined}
                            onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                        />
                    </label>
                    <label className="field">
                        <span>Till</span>
                        <input
                            type="date"
                            value={custom.to}
                            min={custom.from || undefined}
                            onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                        />
                    </label>
                </div>
            )}

            {rows.length === 0 ? (
                <p className="muted spending-empty">Inga gåvor med pris under den här perioden.</p>
            ) : asTable ? (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Till</th>
                                <th className="num">Gåvor</th>
                                <th className="num">Min del</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.name}>
                                    <td>{r.name}</td>
                                    <td className="num">{r.count}</td>
                                    <td className="num">{formatPrice(r.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td>Totalt</td>
                                <td className="num">{rows.reduce((s, r) => s + r.count, 0)}</td>
                                <td className="num">{formatPrice(total)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            ) : (
                <div className="bar-chart" role="list" aria-label="Min del per mottagare">
                    {/* Hairline gridlines behind the bars, their values under the last row */}
                    <div className="bar-chart-grid" aria-hidden="true">
                        {ticks.map((t) => (
                            <span key={t} className="bar-chart-tick" style={{ "--v": t / top }}>
                                <span className="bar-chart-tick-label">{tickText(t)}</span>
                            </span>
                        ))}
                    </div>
                    {rows.map((r) => (
                        <div key={r.name} className="bar-row" role="listitem" tabIndex={0}>
                            <span className={`bar-label${r.isRest ? " muted" : ""}`} title={r.name}>
                                {r.name}
                            </span>
                            <span className="bar-track">
                                <span className={`bar${r.isRest ? " bar-rest" : ""}`} style={{ "--v": r.amount / top }} />
                                <span className="bar-value">{formatPrice(r.amount)}</span>
                                {/* The tooltip: shown on hover and on keyboard focus */}
                                <span className="bar-tooltip" role="tooltip">
                                    <strong>{r.name}</strong>
                                    <br />
                                    {formatPrice(r.amount)} · {r.count} {r.count === 1 ? "gåva" : "gåvor"}
                                </span>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
