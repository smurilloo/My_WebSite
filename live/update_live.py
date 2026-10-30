"""Rewrite the "live trading on Bitget" block of site/index.html from the bot's trade ledger.

Usage: python live/update_live.py <path to trades.sqlite>

Reads the closed trades of every strategy (net of fees and funding as reported by
Bitget) since config.json "since" and replaces everything between the
live:start / live:end markers in site/index.html. Prints "changed" or "unchanged".
"""

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "live" / "config.json"
INDEX = ROOT / "site" / "index.html"
START, END = "<!-- live:start -->", "<!-- live:end -->"

# Spanish lives in the markup; English comes from the same data-i18n keys in site/js/i18n.js.
NAMES = {
    "S1": ("sx.s1", "Giros en extremos"),
    "S2": ("sx.s2", "Momentum de serie temporal"),
    "S4": ("sx.s4", "Rupturas con impulso"),
}


def epoch(ts):
    return datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp()


def load_trades(db_path, cfg):
    since = epoch(cfg["since"] + " 00:00:00")
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    rows = con.execute(
        "SELECT strategy, exit_ts_utc, net_profit FROM trades "
        "WHERE status = 'CLOSED' AND exit_ts_utc IS NOT NULL AND net_profit IS NOT NULL"
    ).fetchall()
    con.close()
    return [(s, epoch(ts), float(net)) for s, ts, net in rows if epoch(ts) >= since]


def card(label, name_key, name, pct, meta, label_key=None):
    lab = f' data-i18n="{label_key}"' if label_key else ""
    return (
        '          <div class="strat reveal">\n'
        f'            <span class="strat__id mono"{lab}>{label}</span>\n'
        f'            <h4 data-i18n="{name_key}">{name}</h4>\n'
        f'            <b class="mono" data-count="{abs(pct):.2f}" data-dec="2" data-prefix="{"+" if pct >= 0 else "−"}" '
        f'data-suffix="%">0</b><span class="strat__unit mono" data-i18n="rl.net">neto de comisiones</span>\n'
        f'            <p class="strat__meta mono">{meta}</p>\n'
        "          </div>\n"
    )


def n_trades(n):
    return f"{n} trade" if n == 1 else f"{n} trades"


def render(trades, cfg):
    cap = float(cfg["capital_usdt"])
    by = {}
    for s, _, net in trades:
        by.setdefault(cfg["strategies"].get(s, s), []).append(net)
    order = sorted(by)
    last = datetime.fromtimestamp(max(t for _, t, _ in trades), timezone.utc).strftime("%Y-%m-%d") if trades else "—"

    total = sum(net for _, _, net in trades) / cap * 100
    html = [
        '        <p class="real__head mono reveal"><span class="live"><i></i><span data-i18n="rl.head">'
        'Operativa real en Bitget · capital real</span></span><span><span data-i18n="rl.period">'
        f'Desde el {cfg["since"]} · solo trades cerrados · último cierre:</span> {last}</span></p>\n',
        '        <div class="strats">\n',
        card("Total", "rl.all", "Cuenta completa", total,
             f"{n_trades(len(trades))} · {' + '.join(order) or '—'}", label_key="rl.total"),
    ]
    for sid in order:
        key, name = NAMES.get(sid, ("", sid))
        html.append(card(sid, key, name, sum(by[sid]) / cap * 100, n_trades(len(by[sid]))))
    html.append("        </div>\n")
    html.append(
        '        <p class="backtest-date mono reveal" data-i18n="rl.note">Rentabilidad sobre el capital de la cuenta '
        f'al {cfg["since"]}, neta de comisiones y funding según Bitget. Se actualiza automáticamente con cada '
        "trade cerrado; las posiciones abiertas no se incluyen.</p>\n"
    )
    return "".join(html)


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    block = render(load_trades(sys.argv[1], cfg), cfg)
    page = INDEX.read_text(encoding="utf-8")
    head, rest = page.split(START, 1)
    _, tail = rest.split(END, 1)
    new = f"{head}{START}\n{block}        {END}{tail}"
    if new == page:
        print("unchanged")
        return
    INDEX.write_text(new, encoding="utf-8", newline="")
    print("changed")


if __name__ == "__main__":
    main()
