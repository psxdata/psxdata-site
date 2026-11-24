// Fills the page from /data/snapshot.json (built daily by scripts/snapshot.py) and runs the tabs.
(() => {
  const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const intf = new Intl.NumberFormat("en-US");
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const minus = (s) => s.replace("-", "−");

  const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

  const formats = {
    num: (v) => nf.format(v),
    int: (v) => intf.format(v),
    compact: (v) => compact.format(v),
    signed: (v) => (v > 0 ? "+" : "") + minus(nf.format(v)),
    pct: (v) => (v > 0 ? "+" : "") + minus(nf.format(v)) + "%",
    date: (v) => new Date(v + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    years: (v) => String(Math.floor((Date.now() - new Date(v)) / (365.25 * 864e5))),
    stars: (v) => "★ " + intf.format(v),
  };

  function fillStats(snap) {
    document.querySelectorAll("[data-stat]").forEach((el) => {
      const v = get(snap, el.dataset.stat);
      if (v == null) return; // keep the fallback text already in the HTML
      el.textContent = (formats[el.dataset.format] || String)(v);
      el.hidden = false;
    });
    document.querySelectorAll("[data-delta]").forEach((el) => {
      const v = get(snap, el.dataset.delta);
      if (v == null) return;
      el.classList.add(v >= 0 ? "up" : "down");
    });
  }

  function drawChart(series) {
    const box = document.getElementById("chart");
    if (!series || series.length < 2) {
      box.innerHTML = '<div class="chart-empty">Chart unavailable</div>';
      return;
    }
    const W = 1000, H = 220, pad = 8;
    const closes = series.map((p) => p[1]);
    const lo = Math.min(...closes), hi = Math.max(...closes);
    const x = (i) => (i / (series.length - 1)) * W;
    const y = (v) => pad + (1 - (v - lo) / (hi - lo || 1)) * (H - pad * 2);
    const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    const area = `${line}L${W},${H}L0,${H}Z`;
    const grid = [0.25, 0.5, 0.75].map((f) => `<line class="grid" x1="0" x2="${W}" y1="${H * f}" y2="${H * f}"/>`).join("");
    const first = series[0], last = series[series.length - 1];
    const change = ((last[1] / first[1] - 1) * 100).toFixed(1);
    box.setAttribute("aria-label",
      `KSE-100 daily closes from ${formats.date(first[0])} to ${formats.date(last[0])}: ` +
      `from ${nf.format(first[1])} to ${nf.format(last[1])}, ${change > 0 ? "up" : "down"} ${Math.abs(change)}%. ` +
      `Low ${nf.format(lo)}, high ${nf.format(hi)}.`);
    box.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${grid}` +
      `<path class="area" d="${area}"/><path class="line" d="${line}"/></svg>`;
    const labels = document.createElement("div");
    labels.className = "chart-labels";
    labels.setAttribute("aria-hidden", "true");
    labels.innerHTML = `<span>${formats.date(first[0])}</span><span>Low ${nf.format(lo)} · High ${nf.format(hi)}</span><span>${formats.date(last[0])}</span>`;
    box.after(labels);
  }

  function fillMovers(movers) {
    const row = (m) => {
      const li = document.createElement("li");
      li.title = m.name;
      li.innerHTML = `<span class="sym"></span><span class="delta ${m.change_pct >= 0 ? "up" : "down"}"></span>`;
      li.children[0].textContent = m.symbol;
      li.children[1].textContent = formats.pct(m.change_pct);
      return li;
    };
    for (const [id, list] of [["gainers", movers.gainers], ["losers", movers.losers]]) {
      document.getElementById(id).replaceChildren(...list.map(row));
    }
  }

  function fillDividends(rows) {
    const tbody = document.getElementById("div-rows");
    tbody.replaceChildren(...rows.map((r) => {
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
    .then((snap) => {
      fillStats(snap);
      drawChart(snap.kse100 && snap.kse100.series);
      if (snap.movers) fillMovers(snap.movers);
      if (snap.dividends) fillDividends(snap.dividends);
      if (snap.quote) fillRest(snap.quote, snap.generated_at);
    })
    .catch(() => {
      document.getElementById("chart").innerHTML = '<div class="chart-empty">Market data is unavailable right now.</div>';
      document.getElementById("div-rows").innerHTML = '<tr><td colspan="5" class="faint">Unavailable right now.</td></tr>';
      document.getElementById("rest-json").textContent = "Unavailable right now.";
    });

  // Tabs (WAI-ARIA tabs pattern: arrow keys, Home and End move between tabs).
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function select(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  }
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
