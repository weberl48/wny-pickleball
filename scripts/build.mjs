// Builds docs/index.html: live PickFit events (Tockify) + weekly patterns for Village Glen / Pickleball Island.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const WEEKS = 6;
const TZ = "America/New_York";
const parts = (ms) => {
  const o = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { d: `${o.year}-${o.month}-${o.day}`, t: `${o.hour}:${o.minute}` };
};
const kindOf = (t) =>
  /league|competition|club|tournament|dupr|scramble/i.test(t) ? "league"
  : /level up|drill|lesson|clinic|instruction|beginner/i.test(t) ? "learn" : "open";

// Monday of the current week, New York time
const nowNY = parts(Date.now()).d;
const [y, m, d] = nowNY.split("-").map(Number);
const monday = new Date(Date.UTC(y, m - 1, d));
monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const isoOf = (dt) => dt.toISOString().slice(0, 10);
const first = isoOf(monday);
const endDt = new Date(monday); endDt.setUTCDate(endDt.getUTCDate() + WEEKS * 7);
const last = isoOf(endDt);

// PickFit via Tockify
const res = await fetch(`https://tockify.com/api/ngevent?calname=pickfitbuff&max=1500&start-ms=${monday.getTime() - 864e5}`);
if (!res.ok) throw new Error(`Tockify ${res.status}`);
const { events } = await res.json();
const EV = [];
for (const e of events) {
  if (e.status?.name && e.status.name !== "scheduled") continue;
  const s = parts(e.when.start.millis), en = parts(e.when.end.millis);
  if (s.d < first || s.d >= last) continue;
  const raw = e.content.summary.text;
  if (/boxing|metcon/i.test(raw)) continue; // PickFit fitness classes, not pickleball
  const t = raw.replace(/Pickleball /g, "").replace(/^Advanced \(4\.0\+\) Open Play$/, "Open Play 4.0+").trim();
  EV.push({ v: "PF", d: s.d, s: s.t, e: en.t, t, k: kindOf(t), n: "", u: `https://tockify.com/pickfitbuff/detail/${e.eid.uid}/${e.eid.tid}` });
}
if (EV.length < 50) throw new Error(`Only ${EV.length} PickFit events; refusing to publish`);

// Village Glen + Pickleball Island weekly patterns
const patterns = JSON.parse(readFileSync("data/patterns.json", "utf8"));
for (let w = 0; w < WEEKS; w++) for (const p of patterns) {
  const day = new Date(monday); day.setUTCDate(day.getUTCDate() + w * 7 + p.wd);
  const { wd, ...rest } = p;
  EV.push({ ...rest, d: isoOf(day) });
}
EV.sort((a, b) => a.d.localeCompare(b.d) || a.s.localeCompare(b.s) || a.v.localeCompare(b.v));

const updated = new Date().toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const html = readFileSync("template.html", "utf8")
  .replace("/*EV*/[]", JSON.stringify(EV))
  .replace("/*FIRST*/2026,9,5", `${monday.getUTCFullYear()},${monday.getUTCMonth()},${monday.getUTCDate()}`)
  .replace("/*WEEKS*/6", String(WEEKS))
  .replace("/*UPDATED*/", updated + " ET");
mkdirSync("docs", { recursive: true });
writeFileSync("docs/index.html", html);
console.log(`built ${EV.length} events (${EV.filter((e) => e.v === "PF").length} PickFit) for ${first}..${last}`);
