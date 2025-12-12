// src/components/pages/DashboardPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CalendarPanel from "../CalendarPanel";

const API = process.env.REACT_APP_API_URL || "";
const AFTER_GOOGLE_KEY = "after_google_auth_destination";
const NOTES_KEY_PREFIX = "dashboard_notes_";

/* ------------ date helpers ------------ */
const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const p2 = (n) => String(n).padStart(2, "0");

const toLocalISO = (d) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(
    d.getHours()
  )}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;

/* ------------ time parsing ------------ */
function parseTimeBits(str) {
  if (!str) return null;
  const m = str.trim().match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  let h = +m[1];
  const mm = m[2] ? +m[2] : 0;
  const ap = (m[3] || "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (!ap && h <= 7) h += 12; // assume small hours without am/pm are PM
  return { h24: h, m: mm };
}

/* ------------ extract upcoming ------------ */
function extractUpcomingFromText(text) {
  if (!text || typeof text !== "string") return [];

  const now = new Date();
  let anchorYear = null;

  // Try to anchor year from header like: "Date: November 9, 2025"
  {
    const head = text.slice(0, 600);
    const y1 = head.match(
      /\bDate:\s*(?:[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*)?(\d{4}))\b/i
    );
    const y2 = head.match(/\b(20\d{2})\b/);
    if (y1?.[1]) anchorYear = parseInt(y1[1], 10);
    else if (y2?.[1]) anchorYear = parseInt(y2[1], 10);
  }

  const out = [];

  // ISO-like: 2025-11-12 or 2025-11-12 10:00
  {
    const re = /\b(20\d{2})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?\b/g;
    for (const m of text.matchAll(re)) {
      const dt = new Date(
        +m[1],
        +m[2] - 1,
        +m[3],
        m[4] ? +m[4] : 10,
        m[5] ? +m[5] : 0
      );
      if (dt >= now) {
        out.push({
          title: "",
          start_iso: toLocalISO(dt),
          end_iso: null,
          description: `Auto-detected: ${m[0]}`,
          source: m[0],
        });
      }
    }
  }

  // mm/dd(/yyyy) [time]
  {
    const re =
      /\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?(?:\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?\b/gi;
    for (const m of text.matchAll(re)) {
      const mo = +m[1];
      const d = +m[2];
      let y = m[3] ? +m[3] : anchorYear || new Date().getFullYear();
      if (y < 100) y += 2000;
      const tb = parseTimeBits(m[4] || "");
      const dt = new Date(y, mo - 1, d, tb?.h24 ?? 10, tb?.m ?? 0);
      if (dt >= now) {
        out.push({
          title: "",
          start_iso: toLocalISO(dt),
          end_iso: null,
          description: `Auto-detected: ${m[0]}`,
          source: m[0],
        });
      }
    }
  }

  // Month-name forms
  {
    const monthMap = MONTHS;
    const re =
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?(?:\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?\b/gi;

    for (const m of text.matchAll(re)) {
      const mo = monthMap[m[1].toLowerCase().replace(/\./g, "")];
      const d = +m[2];
      const y = m[3] ? +m[3] : anchorYear || new Date().getFullYear();
      const tb = parseTimeBits(m[4] || "");
      const dt = new Date(y, mo - 1, d, tb?.h24 ?? 10, tb?.m ?? 0);
      if (dt >= now) {
        out.push({
          title: "",
          start_iso: toLocalISO(dt),
          end_iso: null,
          description: `Auto-detected: ${m[0]}`,
          source: m[0],
        });
      }
    }
  }

  // Dedup + sort
  const seen = new Set();
  const dedup = [];
  for (const it of out) {
    if (!seen.has(it.start_iso)) {
      seen.add(it.start_iso);
      dedup.push(it);
    }
  }
  dedup.sort((a, b) => new Date(a.start_iso) - new Date(b.start_iso));
  return dedup;
}

/* ------------ title helpers ------------ */
function titleFromDecisions(decisions = []) {
  if (!Array.isArray(decisions) || !decisions.length) return null;

  const cleaned = decisions
    .map((d) => String(d || "").trim())
    .filter(Boolean);
  if (!cleaned.length) return null;

  const preprocess = (text) =>
    text
      .replace(/^decision:\s*/i, "")
      .replace(/^(we will|we'll|let's|lets|we should|need to)\s+/i, "")
      .replace(/^[-*]\s*/, "")
      .trim();

  for (const d of cleaned) {
    const lower = d.toLowerCase();
    if (lower.includes("meeting") || lower.includes("call")) {
      const t = preprocess(d);
      return t.split(/[.!?\n]/)[0].trim();
    }
  }

  return preprocess(cleaned[0]);
}

function inferUpcomingTitle(u = {}) {
  return (
    (u.raw_title || "").trim() ||
    (u.title || "").trim() ||
    (u.description || "").trim().slice(0, 30) ||
    "Upcoming Meeting"
  );
}

/* ================================
   MAIN COMPONENT
================================ */
export default function DashboardPage({ user }) {
  const navigate = useNavigate();
  const userId = user?.id || user?.user_id || user?.uid || 1;

  const DISMISSED_KEY = `dismissed_events_${userId}`;
  const notesKey = `${NOTES_KEY_PREFIX}${userId}`;

  const [meetings, setMeetings] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [notes, setNotes] = useState("");

  const calRef = useRef(null);

  /* ---- Load dismissed events once per user ---- */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_KEY);
      setDismissed(stored ? JSON.parse(stored) : []);
    } catch {
      setDismissed([]);
    }
  }, [DISMISSED_KEY]);

  const dismissEvent = (iso) => {
    setDismissed((prev) => {
      if (prev.includes(iso)) return prev;
      const updated = [...prev, iso];
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  /* ---- Fetch meetings ---- */
  async function fetchMeetings() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/meetings/user/${userId}`, {
        credentials: "include",
      });
      const list = r.ok ? await r.json() : [];
      setMeetings(Array.isArray(list) ? list : []);
    } catch {
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }

  /* ---- Extract upcoming from ALL meetings ---- */
  async function fetchUpcomingFromAllMeetings() {
    if (!meetings.length) {
      setUpcoming([]);
      return;
    }

    setLoadingUpcoming(true);
    const all = [];

    try {
      for (const mt of meetings) {
        if (!mt?.id) continue;

        const res = await fetch(
          `${API}/api/meetings/${mt.id}/summary?t=${Date.now()}`,
          { credentials: "include" }
        );
        if (!res.ok) continue;

        const payload = await res.json();
        const s =
          (payload && typeof payload === "object" && payload.normalized) ||
          payload ||
          {};

        const decisions =
          Array.isArray(s.decisions)
            ? s.decisions
            : Array.isArray(payload.decisions)
            ? payload.decisions
            : [];

        const textParts = [];
        [
          s.summary_text,
          s.summary,
          s.summary_markdown,
          payload.summary_text,
          payload.summary,
          payload.summary_markdown,
          ...decisions,
          ...(s.action_items || []),
          payload.raw_transcript,
          payload.full_text,
        ]
          .filter((t) => typeof t === "string" && t.trim())
          .forEach((t) => textParts.push(t));

        const extracted = extractUpcomingFromText(textParts.join("\n"));

        const titled = extracted.map((u, idx) => ({
          ...u,
          title: titleFromDecisions([decisions[idx]]) || inferUpcomingTitle(u),
        }));

        all.push(...titled);
      }

      // Dedup + sort
      const unique = [
        ...new Map(all.map((item) => [item.start_iso, item])).values(),
      ].sort((a, b) => new Date(a.start_iso) - new Date(b.start_iso));

      // Filter out dismissed events
      const filtered = unique.filter(
        (ev) => !dismissed.includes(ev.start_iso)
      );

      setUpcoming(filtered);
    } catch (err) {
      console.error("fetchUpcomingFromAllMeetings ERROR:", err);
      setUpcoming([]);
    } finally {
      setLoadingUpcoming(false);
    }
  }

  /* ---- Effects ---- */
  useEffect(() => {
    fetchMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    fetchUpcomingFromAllMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(meetings), JSON.stringify(dismissed)]);

  // Handle redirect after Google auth (kept from original)
  useEffect(() => {
    const dest = localStorage.getItem(AFTER_GOOGLE_KEY);
    if (dest) {
      localStorage.removeItem(AFTER_GOOGLE_KEY);
      if (dest === "uploads") {
        navigate("/uploads");
      }
    }
  }, [navigate]);

  /* ---- Notes persistence ---- */
  useEffect(() => {
    const stored = localStorage.getItem(notesKey);
    setNotes(stored || "");
  }, [notesKey]);

  useEffect(() => {
    if (notes.trim()) localStorage.setItem(notesKey, notes);
    else localStorage.removeItem(notesKey);
  }, [notes, notesKey]);

  const recent3 = useMemo(
    () => (meetings || []).slice(0, 3),
    [meetings]
  );

  /* ================================
     RENDER UI
  ================================ */
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Recent meetings card */}
          <section className="rounded-xl border bg-white/95 shadow-sm dark:bg-slate-900 dark:border-slate-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-gray-800 dark:text-slate-100">
                Recent Meetings
              </h3>
              <button
                onClick={() => navigate("/meetings")}
                className="px-3 py-1.5 rounded-md bg-purple-600 text-white text-sm hover:bg-purple-700"
              >
                + New Meeting
              </button>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <li className="px-4 py-4 text-sm text-gray-500 dark:text-slate-400">
                  Loading…
                </li>
              )}
              {!loading && recent3.length === 0 && (
                <li className="px-4 py-4 text-sm text-gray-500 dark:text-slate-400">
                  No meetings yet.
                </li>
              )}
              {recent3.map((m) => (
                <li key={m.id} className="px-4 py-3">
                  <button
                    onClick={() => navigate(`/meetings/${m.id}`)}
                    className="w-full text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 dark:text-slate-100 truncate">
                          {m.title || `Meeting #${m.id}`}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                          {m.platform || "—"} ·{" "}
                          <span className="text-green-600 dark:text-green-400">
                            Uploaded
                          </span>
                        </div>
                      </div>
                      <span className="text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300">
                        ›
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Upcoming events card */}
          <section className="rounded-xl border bg-white/95 shadow-sm dark:bg-slate-900 dark:border-slate-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-gray-800 dark:text-slate-100">
                Upcoming Events
              </h3>
              <button
                onClick={fetchUpcomingFromAllMeetings}
                disabled={loadingUpcoming}
                className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-sm text-gray-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
              >
                {loadingUpcoming ? "Refreshing…" : "Refresh from Summary"}
              </button>
            </div>
            <div className="p-4 grid gap-3 md:grid-cols-2">
              {Array.isArray(upcoming) && upcoming.length > 0 ? (
                upcoming.map((u, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (calRef.current?.prefill) {
                        calRef.current.prefill(u);
                      }
                      // mark as dismissed permanently
                      dismissEvent(u.start_iso);
                      // remove immediately from UI
                      setUpcoming((prev) =>
                        prev.filter((_, idx) => idx !== i)
                      );
                    }}
                    className="text-left border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white/80 dark:bg-slate-800 hover:shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-purple-300 dark:focus:ring-purple-500"
                    title="Click to prefill the Event Composer"
                  >
                    <div className="font-medium text-gray-900 dark:text-slate-100">
                      {u.title || inferUpcomingTitle(u)}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-slate-300 mt-1">
                      {u.start_iso
                        ? new Date(u.start_iso).toLocaleString()
                        : "—"}
                    </div>
                    {u.description && (
                      <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                        {u.description.length > 80
                          ? u.description.slice(0, 80) + "…"
                          : u.description}
                      </div>
                    )}
                  </button>
                ))
              ) : (
                <p className="col-span-full text-sm text-gray-600 dark:text-slate-300">
                  No upcoming items detected yet. Click “Refresh from Summary”
                  to pull dates mentioned in your latest summaries and
                  decisions.
                </p>
              )}
            </div>
          </section>

          {/* Notes card */}
          <section className="rounded-xl border bg-white/95 shadow-sm dark:bg-slate-900 dark:border-slate-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-gray-800 dark:text-slate-100">
                Notes
              </h3>
              <span className="text-[11px] text-gray-400 dark:text-slate-500">
                Auto-saved
              </span>
            </div>
            <div className="p-4">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Jot down quick ideas, next steps, or reminders…"
                className="w-full min-h-[120px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-300 dark:focus:ring-purple-500 resize-y"
              />
            </div>
          </section>
        </div>

        {/* Right column – Calendar + composer */}
        <div className="sticky top-4 self-start">
          <CalendarPanel ref={calRef} userId={userId} />
        </div>
      </div>
    </div>
  );
}