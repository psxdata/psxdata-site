"""Build public/data/snapshot.json: the market numbers shown on psxdata.org.

Runs once a day after the PSX close (see .github/workflows/snapshot.yml). Uses the psxdata
library itself, so the landing page is also a daily check that the library works.
"""

from __future__ import annotations

import json
import math
import sys
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import psxdata

OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "snapshot.json"


def _num(value) -> float | None:
    """Parse PSX numbers that may arrive as strings like '1,024.46' or '0.49%'."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.replace(",", "").replace("%", "").strip()
        if not value:
            return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(out) else out


INDICES = {"KSE100": "KSE-100", "KMI30": "KMI-30"}


def index_history(symbol: str) -> pd.DataFrame:
    df = psxdata.stocks(symbol, start="2000-01-01", end=date.today().isoformat())
    df = df[["date", "close"]].dropna()
    df["date"] = pd.to_datetime(df["date"])
    return df.drop_duplicates("date", keep="last").sort_values("date").reset_index(drop=True)


def pct(new: float, old: float) -> float:
    return round((new / old - 1) * 100, 2)


def index_block(hist: pd.DataFrame) -> dict:
    last = hist.iloc[-1]
    prev = hist.iloc[-2]
    year_ago = hist[hist["date"] <= last["date"] - pd.DateOffset(years=1)].iloc[-1]
    year_start = hist[hist["date"] < pd.Timestamp(last["date"].year, 1, 1)].iloc[-1]
    recent = hist[hist["date"] > last["date"] - pd.DateOffset(years=1)]
    return {
        "close": round(float(last["close"]), 2),
        "change": round(float(last["close"] - prev["close"]), 2),
        "change_pct": pct(last["close"], prev["close"]),
        "ytd_pct": pct(last["close"], year_start["close"]),
        "one_year_pct": pct(last["close"], year_ago["close"]),
        "since": hist["date"].iloc[0].strftime("%Y-%m-%d"),
        "series": [[d.strftime("%Y-%m-%d"), round(float(c), 2)] for d, c in zip(recent["date"], recent["close"])],
    }


def movers(kse: pd.DataFrame) -> dict:
    rows = []
    for r in kse.itertuples():
        price, chg = _num(r.current), _num(r.change_pct)
        if price is None or chg is None:
            continue
        rows.append({"symbol": r.symbol, "name": r.name, "price": price, "change_pct": chg})
    rows.sort(key=lambda x: x["change_pct"], reverse=True)
    return {"gainers": rows[:5], "losers": rows[::-1][:5]}


def dividend_table(screener: pd.DataFrame, kse_symbols: set[str]) -> list[dict]:
    df = screener[screener["symbol"].isin(kse_symbols)].dropna(subset=["dividend_yield", "price"])
    df = df[df["dividend_yield"] > 0].sort_values("dividend_yield", ascending=False).head(5)
    return [
        {
            "symbol": r.symbol,
            "sector": str(r.sector_name).title(),
            "price": round(float(r.price), 2),
            "dividend_yield": round(float(r.dividend_yield), 2),
            "pe_ratio": None if pd.isna(r.pe_ratio) else round(float(r.pe_ratio), 2),
        }
        for r in df.itertuples()
    ]


def quote_record(symbol: str) -> dict:
    q = psxdata.quote(symbol).iloc[0].to_dict()
    out = {}
    for key, value in q.items():
        if isinstance(value, pd.Timestamp):
            out[key] = value.isoformat()
        elif value is None or (isinstance(value, float) and math.isnan(value)) or value is pd.NA:
            out[key] = None
        elif hasattr(value, "item"):
            out[key] = value.item()
        else:
            out[key] = value
    return out


def fetch_json(url: str) -> dict | None:
    req = urllib.request.Request(url, headers={"User-Agent": "psxdata-site-snapshot"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.load(resp)
    except Exception as exc:  # Stats are optional; the page hides a missing number.
        print(f"warning: {url}: {exc}", file=sys.stderr)
        return None


def main() -> None:
    indices, constituents, as_of = {}, {}, None
    for symbol, label in INDICES.items():
        hist = index_history(symbol)
        constituents[symbol] = psxdata.indices(symbol)
        indices[symbol] = {"label": label, **index_block(hist), "movers": movers(constituents[symbol])}
        as_of = max(as_of or "", hist["date"].iloc[-1].strftime("%Y-%m-%d"))
    screener = psxdata.screener()
    pypi = fetch_json("https://pypistats.org/api/packages/psxdata/recent") or {}
    repo = fetch_json("https://api.github.com/repos/psxdata/psxdata") or {}
    release = fetch_json("https://api.github.com/repos/psxdata/psxdata/releases/latest") or {}

    snapshot = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "as_of": as_of,
        "indices": indices,
        "dividends": dividend_table(screener, set(constituents["KSE100"]["symbol"])),
        "quote": quote_record("LUCK"),
        "stats": {
            "tickers": len(psxdata.tickers()),
            "screener_stocks": int(len(screener)),
            "sectors": int(screener["sector_name"].dropna().nunique()),
            "downloads_last_month": (pypi.get("data") or {}).get("last_month"),
            "github_stars": repo.get("stargazers_count"),
            "history_since": indices["KSE100"]["since"],
        },
        "release": {"tag": release.get("tag_name"), "url": release.get("html_url")} if release.get("tag_name") else None,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snapshot, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT} (as of {snapshot['as_of']}, {OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
