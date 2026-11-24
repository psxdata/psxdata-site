// Fills the page from /data/snapshot.json (built every weekday by scripts/snapshot.py), draws the
// interactive index chart, and runs the theme toggle, index switcher and tools tabs.
(() => {
  const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const intf = new Intl.NumberFormat("en-US");
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const minus = (s) => s.replace("-", "−");
  const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  const parseDay = (d) => new Date(d + "T00:00:00");

  const fmt = {
    num: (v) => nf.format(v),
    int: (v) => intf.format(v),
    compact: (v) => compact.format(v),
    signed: (v) => (v > 0 ? "+" : "") + minus(nf.format(v)),
    pct: (v) => (v > 0 ? "+" : "") + minus(nf.format(v)) + "%",
    date: (v) => parseDay(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    longDate: (v) => parseDay(v).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    years: (v) => String(Math.floor((Date.now() - parseDay(v)) / (365.25 * 864e5))),
    stars: (v) => "★ " + intf.format(v),
  };
  const apply = (el, v) => { el.textContent = (fmt[el.dataset.format] || String)(v); };
  const setDelta = (el, v) => {
    el.classList.remove("up", "down");
    if (v != null) el.classList.add(v >= 0 ? "up" : "down");
  };

  /* ---------- Theme toggle ---------- */
  const root = document.documentElement;
  const toggle = document.getElementById("theme-toggle");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  function syncToggle() {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    toggle.setAttribute("aria-label", `Switch to ${next} theme`);
    toggle.title = `Switch to ${next} theme`;
    themeMeta.content = root.dataset.theme === "dark" ? "#0a0f0d" : "#f6faf8";
  }

  /* ---------- Small animation helpers ---------- */
  // Restart a CSS animation class on an element (remove, force reflow, add back).
  const replay = (el, cls) => {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };
  // Slide a pill indicator under the active button of a switcher.
  function moveIndicator(group, active, instant) {
    const ind = group.querySelector(".indicator");
    if (!ind || !active) return;
    if (instant) ind.style.transition = "none";
    ind.style.width = active.offsetWidth + "px";
    ind.style.transform = `translateX(${active.offsetLeft}px)`;
    if (instant) { void ind.offsetWidth; ind.style.transition = ""; }
    ind.classList.add("ready");
  }
  const activeIn = (group) => group.querySelector('[aria-pressed="true"],[aria-selected="true"]');
  const placeAll = () => document.querySelectorAll(".segmented,.tablist").forEach((g) => moveIndicator(g, activeIn(g), true));
  placeAll();
  window.addEventListener("resize", placeAll);
  if (document.fonts) document.fonts.ready.then(placeAll);
  toggle.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
    syncToggle();
  });
  syncToggle();

  /* ---------- Page-wide numbers ---------- */
  function fillStats(snap) {
    document.querySelectorAll("[data-stat]").forEach((el) => {
      const v = get(snap, el.dataset.stat);
      if (v == null) return; // keep the fallback text already in the HTML
      apply(el, v);
      el.hidden = false;
    });
    document.querySelectorAll("[data-href]").forEach((el) => {
      const v = get(snap, el.dataset.href);
      if (v) el.href = v;
    });
  }

  /* ---------- Interactive chart ---------- */
  const chart = document.getElementById("chart");
  const labels = document.getElementById("chart-labels");
  let series = [];

  function drawChart(s, label) {
    series = s || [];
    if (series.length < 2) {
      chart.innerHTML = '<div class="chart-empty">Chart unavailable</div>';
      labels.textContent = "";
      return;
    }
    const W = 1000, H = 300;
    const closes = series.map((p) => p[1]);
    const lo = Math.min(...closes), hi = Math.max(...closes);
    const span = hi - lo || 1;
    const pad = span * 0.08;
    const yMin = lo - pad, yMax = hi + pad;
    const yPct = (v) => (1 - (v - yMin) / (yMax - yMin)) * 100;
    const xPct = (i) => (i / (series.length - 1)) * 100;

    const line = series.map((p, i) => `${i ? "L" : "M"}${(xPct(i) * W / 100).toFixed(1)},${(yPct(p[1]) * H / 100).toFixed(1)}`).join("");
    const ticks = [0.2, 0.5, 0.8].map((f) => yMin + (yMax - yMin) * (1 - f));
    chart.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
      ticks.map((t) => `<line class="grid" x1="0" x2="${W}" y1="${(yPct(t) * H / 100).toFixed(1)}" y2="${(yPct(t) * H / 100).toFixed(1)}"/>`).join("") +
      `<path class="area" d="${line}L${W},${H}L0,${H}Z"/><path class="line" pathLength="1" d="${line}"/></svg>` +
      ticks.map((t) => `<span class="grid-label" style="top:${yPct(t)}%">${intf.format(Math.round(t))}</span>`).join("") +
      `<div class="crosshair" hidden></div><div class="dot" hidden></div><div class="tip" hidden></div>` +
      `<span class="visually-hidden" aria-live="polite"></span>`;

    const first = series[0], last = series[series.length - 1];
    const change = (last[1] / first[1] - 1) * 100;
    chart.setAttribute("aria-label",
      `${label} daily closes from ${fmt.date(first[0])} to ${fmt.date(last[0])}: from ${nf.format(first[1])} to ` +
      `${nf.format(last[1])}, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}%. ` +
      `Low ${nf.format(lo)}, high ${nf.format(hi)}. Use the left and right arrow keys to read each day.`);
    labels.innerHTML = `<span>${fmt.date(first[0])}</span><span>${fmt.date(last[0])}</span>`;

    chart._scale = { xPct, yPct };
  }

  function showPoint(i, announce) {
    if (!series.length) return;
    i = Math.max(0, Math.min(series.length - 1, i));
    chart._index = i;
    const { xPct, yPct } = chart._scale;
    const [d, close] = series[i];
    const prev = i > 0 ? series[i - 1][1] : null;
    const x = xPct(i), y = yPct(close);
    const cross = chart.querySelector(".crosshair"), dot = chart.querySelector(".dot"), tip = chart.querySelector(".tip");
    cross.style.left = x + "%";
    dot.style.left = x + "%";
    dot.style.top = y + "%";
    const day = prev == null ? "" : `<span class="delta ${close >= prev ? "up" : "down"}">${fmt.pct((close / prev - 1) * 100)}</span>`;
    tip.innerHTML = `<b>${nf.format(close)}</b><span>${fmt.longDate(d)}</span> ${day}`;
    cross.hidden = dot.hidden = tip.hidden = false;
    // Keep the tooltip inside the chart: flip it to the left of the point past the middle.
    const w = chart.clientWidth, px = (x / 100) * w, tw = tip.offsetWidth;
    tip.style.left = (px + 12 + tw > w ? Math.max(0, px - 12 - tw) : px + 12) + "px";
    if (announce) {
      chart.querySelector("[aria-live]").textContent =
        `${fmt.longDate(d)}: ${nf.format(close)}${prev == null ? "" : `, ${fmt.pct((close / prev - 1) * 100)} on the day`}`;
    }
  }
  function hidePoint() {
    chart.querySelectorAll(".crosshair,.dot,.tip").forEach((el) => (el.hidden = true));
  }
  const indexAt = (clientX) => {
    const r = chart.getBoundingClientRect();
    return Math.round(((clientX - r.left) / r.width) * (series.length - 1));
  };
  chart.addEventListener("pointermove", (e) => showPoint(indexAt(e.clientX), false));
  chart.addEventListener("pointerdown", (e) => showPoint(indexAt(e.clientX), false));
  chart.addEventListener("pointerleave", () => { if (document.activeElement !== chart) hidePoint(); });
  chart.addEventListener("focus", () => showPoint(chart._index ?? series.length - 1, true));
  chart.addEventListener("blur", hidePoint);
  chart.addEventListener("keydown", (e) => {
    const cur = chart._index ?? series.length - 1;
    const step = e.shiftKey ? 20 : 1;
    const next = { ArrowLeft: cur - step, ArrowRight: cur + step, Home: 0, End: series.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    showPoint(next, true);
  });

  /* ---------- Index switcher ---------- */
  let snap = null;
  function showIndex(key, animate) {
    const idx = snap.indices[key];
    if (!idx) return;
    const group = document.querySelector(".segmented");
    group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.index === key)));
    moveIndicator(group, activeIn(group), !animate);
    if (animate) {
      replay(document.querySelector(".market-level"), "swap");
      replay(document.querySelector(".market-kpis"), "swap");
      document.querySelectorAll(".mover-list").forEach((l) => replay(l, "swap"));
    }
    document.querySelectorAll("[data-idx]").forEach((el) => {
      const v = idx[el.dataset.idx];
      if (v == null) return;
      apply(el, v);
      if (el.classList.contains("delta")) setDelta(el, v);
    });
    document.querySelectorAll("[data-idx-delta]").forEach((el) => setDelta(el, idx[el.dataset.idxDelta]));
    chart._index = undefined;
    drawChart(idx.series, idx.label);
    fillMovers(idx.movers);
  }
  document.querySelectorAll(".segmented button").forEach((b) =>
    b.addEventListener("click", () => {
      if (snap && b.getAttribute("aria-pressed") !== "true") showIndex(b.dataset.index, true);
    }));

  function fillMovers(movers) {
    const row = (m) => {
      const li = document.createElement("li");
      li.title = m.name;
      const sym = document.createElement("span");
      sym.className = "sym";
      sym.textContent = m.symbol;
      const chg = document.createElement("span");
      chg.className = `delta ${m.change_pct >= 0 ? "up" : "down"}`;
      chg.textContent = fmt.pct(m.change_pct);
      li.append(sym, chg);
      return li;
    };
    document.getElementById("gainers").replaceChildren(...(movers ? movers.gainers : []).map(row));
    document.getElementById("losers").replaceChildren(...(movers ? movers.losers : []).map(row));
  }

  /* ---------- Tools tab outputs ---------- */
  function fillDividends(rows) {
    document.getElementById("div-rows").replaceChildren(...rows.map((r) => {
      const tr = document.createElement("tr");
      for (const [val, cls] of [
        [r.symbol, ""],
        [r.sector, "cell-wrap"],
        [nf.format(r.price), "num"],
        [nf.format(r.dividend_yield) + "%", "num"],
        [r.pe_ratio == null ? "—" : nf.format(r.pe_ratio), "num"],
      ]) {
        const td = document.createElement("td");
        td.textContent = val;
        if (cls) td.className = cls;
        tr.append(td);
      }
      return tr;
    }));
  }

  // Same shape the REST API returns for GET /stocks/{symbol}/quote, trimmed to the useful fields.
  function fillRest(q, generatedAt) {
    const keys = ["symbol", "sector_name", "price", "change_pct", "change_1y_pct", "pe_ratio", "dividend_yield", "market_cap"];
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    const val = (v) => (typeof v === "string" ? `<span class="s">"${esc(v)}"</span>` : esc(v));
    const lines = keys.filter((k) => k in q).map((k) => `    <span class="k">"${k}"</span>: ${val(q[k])}`);
    document.getElementById("rest-json").innerHTML =
      `{\n  <span class="k">"data"</span>: {\n${lines.join(",\n")},\n    …\n  },\n` +
      `  <span class="k">"meta"</span>: { <span class="k">"timestamp"</span>: ${val(generatedAt)}, … }\n}`;
  }

  fetch("/data/snapshot.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((data) => {
      snap = data;
      fillStats(snap);
      showIndex("KSE100");
      if (snap.dividends) fillDividends(snap.dividends);
      if (snap.quote) fillRest(snap.quote, snap.generated_at);
    })
    .catch(() => {
      chart.innerHTML = '<div class="chart-empty">Market data is unavailable right now.</div>';
      document.getElementById("div-rows").innerHTML = "<tr><td colspan=\"5\">Unavailable right now.</td></tr>";
      document.getElementById("rest-json").textContent = "Unavailable right now.";
    });

  /* ---------- Tools tabs (WAI-ARIA tabs: arrow keys, Home and End) ---------- */
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function select(tab, focus) {
    if (tab.getAttribute("aria-selected") === "true") { if (focus) tab.focus(); return; }
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute("aria-controls"));
      panel.hidden = !on;
      if (on) replay(panel, "enter");
    });
    moveIndicator(tab.parentElement, tab, false);
    if (focus) tab.focus();
  }

  /* ---------- FAQ: animate open and close of each <details> ---------- */
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  document.querySelectorAll(".faq details").forEach((d) => {
    const body = d.querySelector(".faq-body");
    let anim = null;
    d.querySelector("summary").addEventListener("click", (e) => {
      if (reduceMotion.matches || !body.animate) return; // let the browser toggle instantly
      e.preventDefault();
      if (anim) anim.cancel();
      const opening = !d.open;
      if (opening) d.open = true;
      const full = body.scrollHeight;
      const frames = opening
        ? [{ height: "0px", opacity: 0 }, { height: full + "px", opacity: 1 }]
        : [{ height: full + "px", opacity: 1 }, { height: "0px", opacity: 0 }];
      anim = body.animate(frames, { duration: 240, easing: "cubic-bezier(.2,.7,.2,1)" });
      anim.onfinish = () => { anim = null; if (!opening) d.open = false; };
    });
  });
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab, false));
    tab.addEventListener("keydown", (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], true);
    });
  });
})();
