// src/components/CalendarPanel.jsx
import {
  useEffect,
  useImperativeHandle,
  useState,
  forwardRef,
} from "react";
import CalendarGrid from "./CalendarGrid";

const API = process.env.REACT_APP_API_URL || "";

// ---------- small helpers ----------
const p2 = (n) => String(n).padStart(2, "0");

function partsToISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseSafe(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Nice, short “Thu, Nov 13 · 10:00–11:00 AM”
function formatEventRange(start, end) {
  if (!start) return "—";

  const dateOpts = { weekday: "short", month: "short", day: "numeric" };
  const timeOpts = { hour: "numeric", minute: "2-digit" };

  const dateLabel = start.toLocaleDateString(undefined, dateOpts);
  const startTime = start.toLocaleTimeString(undefined, timeOpts);

  if (!end) {
    return `${dateLabel} · ${startTime}`;
  }

  const endTime = end.toLocaleTimeString(undefined, timeOpts);
  const sameDay = start.toDateString() === end.toDateString();

  if (sameDay) {
    return `${dateLabel} · ${startTime}–${endTime}`;
  }

  const endLabel = end.toLocaleDateString(undefined, dateOpts);
  return `${dateLabel} ${startTime} → ${endLabel} ${endTime}`;
}

// shared input style (light + dark)
const inputBase =
  "mt-1 w-full rounded-md border px-2 py-1 text-sm " +
  "border-slate-300 bg-white/90 text-slate-900 " +
  "placeholder:text-slate-400 " +
  "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-400/60";

const buttonPrimary =
  "px-3 py-1.5 rounded-md text-sm font-medium " +
  "bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60 transition";

// ---------- main component ----------
const CalendarPanel = forwardRef(function CalendarPanel({ userId }, ref) {
  const [mode, setMode] = useState("offline"); // "offline" | "google"

  // -------- OFFLINE CALENDAR STATE --------
  const [offTitle, setOffTitle] = useState("Follow-up meeting");
  const [offDate, setOffDate] = useState("");
  const [offTime, setOffTime] = useState(""); // start only
  const [offNotifyEmail, setOffNotifyEmail] = useState("");
  const [offDescription, setOffDescription] = useState("");
  const [offEvents, setOffEvents] = useState([]);
  const [offStatus, setOffStatus] = useState("");
  const [offLoading, setOffLoading] = useState(false);

  // -------- GOOGLE CALENDAR STATE --------
  const [gTitle, setGTitle] = useState("Follow-up meeting");
  const [gDate, setGDate] = useState("");
  const [gStartTime, setGStartTime] = useState("");
  const [gDescription, setGDescription] = useState("");
  const [gEvents, setGEvents] = useState([]);
  const [gBusy, setGBusy] = useState(false);
  const [gErr, setGErr] = useState("");
  const [connected, setConnected] = useState(false);

  const userIdHeader = userId
    ? {
        "X-User-Id": String(userId),
      }
    : {};

  function authHeaders() {
    return userId ? { "X-User-Id": String(userId) } : {};
  }

  // Expose prefill() so Dashboard can fill the composer from Upcoming Events
  useImperativeHandle(ref, () => ({
    prefill(u) {
      if (!u) return;

      // OFFLINE mode prefill
      if (mode === "offline") {
        let dStr = offDate;
        let tStr = offTime;

        if (u.start_iso) {
          const d = new Date(u.start_iso);
          if (!Number.isNaN(d.getTime())) {
            dStr = d.toISOString().slice(0, 10); // yyyy-mm-dd
            tStr = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
          }
        }

        const extra = u.source ? `\n\nSource: ${u.source}` : "";
        setOffTitle(u.title || "Follow-up meeting");
        setOffDescription((u.description || "") + extra);
        setOffDate(dStr);
        setOffTime(tStr);
        setOffStatus("Prefilled from summary – review and Save Event.");
        return;
      }

      // GOOGLE mode prefill
      if (mode === "google") {
        let dStr = gDate;
        let sStr = gStartTime;

        if (u.start_iso) {
          const d = new Date(u.start_iso);
          if (!Number.isNaN(d.getTime())) {
            dStr = d.toISOString().slice(0, 10); // yyyy-mm-dd
            sStr = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
          }
        }

        const extra = u.source ? `\n\nSource: ${u.source}` : "";
        setGTitle(u.title || "Follow-up meeting");
        setGDescription((u.description || "") + extra);
        setGDate(dStr);
        setGStartTime(sStr);
        setGErr("Prefilled from summary – review after connecting Google Calendar.");
      }
    },
  }));

  // -------- OFFLINE: load events --------
  async function loadOfflineEvents() {
    setOffLoading(true);
    try {
      const res = await fetch(`${API}/api/events?limit=20`, {
        headers: {
          ...userIdHeader,
        },
        credentials: "include",
      });
      if (!res.ok) {
        console.warn("Failed to load offline events", await res.text());
        setOffEvents([]);
        return;
      }
      const data = await res.json();
      const raw = Array.isArray(data) ? data : [];

      // de-duplicate by id so refresh doesn’t create duplicates
      const seen = new Set();
      const unique = raw.filter((e) => {
        if (!e || e.id == null) return false;
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });

      setOffEvents(unique);
    } catch (err) {
      console.error("Error loading offline events", err);
      setOffEvents([]);
    } finally {
      setOffLoading(false);
    }
  }

  // -------- OFFLINE: create event --------
  async function createOfflineEvent(e) {
    e?.preventDefault?.();
    setOffStatus("");

    if (!offTitle || !offDate || !offTime) {
      setOffStatus("Title, date and time are required.");
      return;
    }

    const startIso = partsToISO(offDate, offTime);
    if (!startIso) {
      setOffStatus("Invalid date/time.");
      return;
    }

    try {
      const res = await fetch(`${API}/api/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...userIdHeader,
        },
        credentials: "include",
        body: JSON.stringify({
          title: offTitle,
          description: offDescription || null,
          start_time: startIso,
          end_time: null, // no end time
          location: null,
          notify_email: offNotifyEmail || null,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Create offline event failed:", text);
        throw new Error(text || "Failed to create event");
      }

      const data = await res.json();

      // add new event, but avoid duplicates by id
      setOffEvents((prev) => {
        const filtered = prev.filter((ev) => ev.id !== data.id);
        return [data, ...filtered];
      });

      // reset fields; no success text
      setOffTitle("Follow-up meeting");
      setOffDate("");
      setOffTime("");
      setOffNotifyEmail("");
      setOffDescription("");
      setOffStatus("");
    } catch (err) {
      console.error(err);
      setOffStatus("Error creating event – see console / backend logs.");
    }
  }

  // -------- OFFLINE: send email --------
  async function sendOfflineEmail(ev) {
    try {
      const res = await fetch(`${API}/api/events/${ev.id}/send_email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...userIdHeader,
        },
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("Send email failed:", text);
        throw new Error(text || "Failed to send email");
      }
      alert("Email triggered from backend (check inbox/logs).");
    } catch (err) {
      console.error(err);
      alert("Error sending email – see console / backend logs.");
    }
  }

  // -------- OFFLINE: delete event --------
  async function deleteOfflineEvent(id) {
    if (!id) return;
    try {
      const res = await fetch(`${API}/api/events/${id}`, {
        method: "DELETE",
        headers: {
          ...userIdHeader,
        },
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Delete offline event failed:", text);
        alert("Failed to delete event. See console / backend logs.");
        return;
      }

      // Remove from local state so it doesn’t re-appear
      setOffEvents((prev) => prev.filter((ev) => ev.id !== id));
    } catch (err) {
      console.error("Delete offline event error:", err);
      alert("Error deleting event – see console / backend logs.");
    }
  }

  // -------- GOOGLE: fetch events --------
  async function fetchGoogleEvents() {
    setGBusy(true);
    setGErr("");
    try {
      const url = `${API}/api/calendar/events`;

      const res = await fetch(url, {
        credentials: "include",
        headers: authHeaders(),
      });

      if (!res.ok) {
        setConnected(false);

        if ([400, 401, 403, 409].includes(res.status)) {
          const t = await res.text().catch(() => "");
          setGErr(
            t ||
              "Google Calendar not connected. Click Not connected above."
          );
          setGEvents([]);
          return;
        }

        const t = await res.text().catch(() => "");
        setGErr(`Calendar error (${res.status}): ${t || "unknown error"}`);
        setGEvents([]);
        return;
      }

      setConnected(true);

      const data = await res.json().catch(() => []);
      const items = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : [];

      const norm = items
        .map((e, i) => {
          const start = e.start?.dateTime || e.start?.date || e.start;
          const end = e.end?.dateTime || e.end?.date || e.end;
          const sd = parseSafe(start);
          const ed = parseSafe(end);
          return {
            id: e.id || i,
            title: e.summary || e.title || "Untitled",
            start: sd,
            end: ed,
            location: e.location || "",
          };
        })
        .filter((e) => !!e.start)
        .sort((a, b) => a.start - b.start);

      setGEvents(norm);
    } catch (e) {
      setConnected(false);
      setGErr(`Failed to fetch calendar: ${e?.message || e}`);
      setGEvents([]);
    } finally {
      setGBusy(false);
    }
  }

  // -------- GOOGLE: connect --------
  async function connectGoogle() {
    setGErr("");
    try {
      const url = `${API}/api/google/auth-url`;

      const r = await fetch(url, {
        credentials: "include",
        headers: authHeaders(),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        setGErr(`Failed to get auth URL: ${t || r.status}`);
        return;
      }
      const { url: authUrl } = await r.json();
      if (authUrl) window.location.href = authUrl;
      else setGErr("Missing auth URL from server.");
    } catch (e) {
      setGErr(`Failed to start OAuth: ${e?.message || e}`);
    }
  }

  // -------- GOOGLE: create event (start + 30min end) --------
  async function createGoogleEvent() {
    const start_iso = partsToISO(gDate, gStartTime);

    if (!start_iso) {
      setGErr("Please set a valid date and start time.");
      return;
    }

    const startDate = new Date(start_iso);
    const endDate = new Date(start_iso);
    endDate.setMinutes(endDate.getMinutes() + 30); // +30 mins
    const end_iso = endDate.toISOString();

    setGBusy(true);
    setGErr("");
    try {
      const body = {
        title: (gTitle || "Follow-up meeting").trim(),
        description: gDescription || "",
        start_iso,
        end_iso,
      };

      const url = `${API}/api/calendar/create`;

      const r = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        setGErr(`Create event failed (${r.status}): ${t}`);
        return;
      }

      await fetchGoogleEvents();
    } catch (e) {
      setGErr(`Create event error: ${e?.message || e}`);
    } finally {
      setGBusy(false);
    }
  }

  // -------- GOOGLE: delete event --------
  async function deleteGoogleEvent(id) {
    if (!id) return;

    try {
      const url = `${API}/api/calendar/events/${encodeURIComponent(id)}`;

      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders(),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Delete Google event failed:", text);
        alert("Failed to delete Google event. See console/backend logs.");
        return;
      }

      // Remove from local state
      setGEvents((prev) => prev.filter((ev) => ev.id !== id));
    } catch (e) {
      console.error("Delete Google event error:", e);
      alert("Error deleting Google event – see console/backend logs.");
    }
  }

  // -------- auto-load when userId/mode changes --------
  useEffect(() => {
    if (userId == null) return;
    if (mode === "offline") {
      loadOfflineEvents();
    } else {
      fetchGoogleEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mode]);

  const isRefreshing = mode === "offline" ? offLoading : gBusy;

  // -------- COMBINED EVENTS FOR GRID (offline + google) --------
  const calendarEvents = [
    // offline events: convert start_time string -> Date, add +30min end
    ...offEvents
      .filter((e) => e.start_time)
      .map((e) => {
        const start = parseSafe(e.start_time);
        if (!start) return null;
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        return {
          title: e.title || "Offline event",
          start,
          end,
        };
      })
      .filter(Boolean),
    // google events already have Date objects
    ...gEvents.map((e) => ({
      title: e.title || "Google event",
      start: e.start,
      end: e.end || new Date(e.start.getTime() + 30 * 60 * 1000),
    })),
  ];

  return (
    <div className="p-4 rounded-2xl border border-slate-200/70 bg-white/95 shadow-[0_10px_35px_rgba(15,23,42,0.35)] dark:bg-slate-900/95 dark:border-slate-700/80 space-y-4">
      {/* Header + mode switch */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-900 dark:text-slate-50 text-sm">
            Calendar
          </h3>
          <div className="inline-flex border border-slate-300 dark:border-slate-600 rounded-md overflow-hidden text-[11px]">
            {/* Google first, then Offline */}
            <button
              type="button"
              onClick={() => setMode("google")}
              className={`px-2 py-1 ${
                mode === "google"
                  ? "bg-purple-600 text-white"
                  : "bg-white dark:bg-slate-900 text-slate-707 dark:text-slate-200"
              }`}
            >
              Google
            </button>
            <button
              type="button"
              onClick={() => setMode("offline")}
              className={`px-2 py-1 ${
                mode === "offline"
                  ? "bg-purple-600 text-white"
                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              }`}
            >
              Offline
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connect / Connected pill (Google only) */}
          {mode === "google" && (
            <button
              type="button"
              onClick={connectGoogle}
              className={
                "px-2 py-0.5 rounded-full text-[11px] font-medium border " +
                (connected
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/60 hover:bg-emerald-500/20"
                  : "bg-slate-700/40 text-slate-200 border-slate-500/60 hover:bg-slate-600")
              }
            >
              {connected ? "Connected" : "Not connected"}
            </button>
          )}

          {/* Refresh button with rotate icon */}
          <button
            type="button"
            onClick={mode === "offline" ? loadOfflineEvents : fetchGoogleEvents}
            disabled={isRefreshing}
            className="px-2.5 py-1.5 rounded-md border border-slate-300 text-xs text-slate-700 bg-white/5 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-100 dark:bg-slate-900/40 dark:hover:bg-slate-800/80 transition flex items-center justify-center"
            aria-label="Refresh events"
          >
            <span
              className={
                "text-base " + (isRefreshing ? "animate-spin" : "")
              }
            >
              ⟳
            </span>
          </button>
        </div>
      </div>

      {/* OFFLINE MODE */}
      {mode === "offline" && (
        <>
          {/* Offline composer */}
          <form
            onSubmit={createOfflineEvent}
            className="space-y-3 mb-3 text-xs"
          >
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Title *
              </label>
              <input
                className={inputBase}
                value={offTitle}
                onChange={(e) => setOffTitle(e.target.value)}
                placeholder="Follow-up meeting"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Date *
              </label>
              <input
                type="date"
                className={inputBase}
                value={offDate}
                onChange={(e) => setOffDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Time *
              </label>
              <input
                type="time"
                className={inputBase}
                value={offTime}
                onChange={(e) => setOffTime(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Email to notify (optional)
              </label>
              <input
                type="email"
                className={inputBase}
                value={offNotifyEmail}
                onChange={(e) => setOffNotifyEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Description
              </label>
              <textarea
                className={inputBase + " resize-none"}
                rows={2}
                value={offDescription}
                onChange={(e) => setOffDescription(e.target.value)}
                placeholder="Agenda, notes, context…"
              />
            </div>

            {offStatus && (
              <p className="text-[11px] text-purple-600 dark:text-purple-400">
                {offStatus}
              </p>
            )}

            <button
              type="submit"
              className={buttonPrimary + " w-full"}
              disabled={offLoading}
            >
              Save Event (Offline)
            </button>
          </form>

          {/* Upcoming Offline Events */}
          <div className="border-t border-slate-200/70 dark:border-slate-700/80 pt-3 mt-2">
            <h4 className="font-semibold text-slate-900 dark:text-slate-50 text-xs mb-2">
              Upcoming Offline Events
            </h4>
            {offLoading && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Loading…
              </p>
            )}
            {!offLoading && offEvents.length === 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                No events yet – create one above.
              </p>
            )}
            {!offLoading && offEvents.length > 0 && (
              <ul className="space-y-2 text-xs max-h-64 overflow-y-auto pr-1">
                {offEvents.slice(0, 10).map((ev) => (
                  <li
                    key={ev.id}
                    className="border border-slate-200/70 dark:border-slate-700/80 rounded-xl px-3 py-2 bg-slate-50/80 dark:bg-slate-800/80"
                  >
                    <div className="flex justify-between items-center gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-50 truncate">
                          {ev.title}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {ev.start_time
                            ? formatEventRange(
                                parseSafe(ev.start_time),
                                null
                              )
                            : "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {ev.notify_email && (
                          <button
                            type="button"
                            onClick={() => sendOfflineEmail(ev)}
                            className="px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 text-[10px] text-slate-700 dark:text-slate-100 bg-white/60 dark:bg-slate-900/70 hover:bg-slate-100 dark:hover:bg-slate-800/80"
                            title={`Send email to ${ev.notify_email}`}
                          >
                            ✉️
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteOfflineEvent(ev.id)}
                          className="px-2 py-0.5 rounded-md border border-rose-300/80 text-[10px] text-rose-600 bg-rose-50/80 hover:bg-rose-100 dark:border-rose-500/60 dark:text-rose-200 dark:bg-rose-900/40 dark:hover:bg-rose-900/70"
                          title="Delete event"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* GOOGLE MODE */}
      {mode === "google" && (
        <>
          {/* Google composer – similar style to offline */}
          <div className="space-y-3 mb-4 text-xs">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Title
              </label>
              <input
                className={inputBase}
                value={gTitle}
                onChange={(e) => setGTitle(e.target.value)}
                placeholder="Follow-up meeting"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Date
              </label>
              <input
                type="date"
                className={inputBase}
                value={gDate}
                onChange={(e) => setGDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Time
              </label>
              <input
                type="time"
                className={inputBase}
                value={gStartTime}
                onChange={(e) => setGStartTime(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Description
              </label>
              <textarea
                className={inputBase + " resize-none"}
                rows={2}
                value={gDescription}
                onChange={(e) => setGDescription(e.target.value)}
                placeholder="Context or agenda…"
              />
            </div>

            <button
              type="button"
              onClick={createGoogleEvent}
              disabled={gBusy || !connected || !gDate || !gStartTime}
              className={buttonPrimary + " w-full"}
            >
              Add to Google Calendar
            </button>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Tip: Use this as a helper while viewing your Google Calendar
              events below. Connection status is shown at the top right.
            </p>
          </div>

          {/* Upcoming Google Events */}
          <div className="border-t border-slate-200/70 dark:border-slate-700/80 pt-3 mt-2">
            <h4 className="font-semibold text-slate-900 dark:text-slate-50 text-xs mb-2">
              Upcoming Google Events
            </h4>

            {gBusy && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Loading…
              </p>
            )}

            {gErr && !gBusy && (
              <p className="mb-2 text-[11px] text-red-500 dark:text-red-400">
                {gErr}
              </p>
            )}

            {!gBusy && gEvents.length === 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {connected
                  ? "No upcoming events."
                  : "Google Calendar not connected."}
              </p>
            )}

            {!gBusy && gEvents.length > 0 && (
              <ul className="space-y-2 text-xs max-h-64 overflow-y-auto pr-1">
                {gEvents.slice(0, 10).map((e) => (
                  <li
                    key={e.id}
                    className="border border-slate-200/70 dark:border-slate-700/80 rounded-xl px-3 py-2 bg-slate-50/80 dark:bg-slate-800/80"
                  >
                    <div className="flex justify-between items-center gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-50 truncate">
                          {e.title}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {formatEventRange(e.start, e.end)}
                        </div>
                        {e.location && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            📍 {e.location}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => deleteGoogleEvent(e.id)}
                          className="px-2 py-0.5 rounded-md border border-rose-300/80 text-[10px] text-rose-600 bg-rose-50/80 hover:bg-rose-100 dark:border-rose-500/60 dark:text-rose-200 dark:bg-rose-900/40 dark:hover:bg-rose-900/70"
                          title="Delete from Google Calendar"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* COMBINED CALENDAR VIEW (Month / Week) */}
      {calendarEvents.length > 0 && (
        <div className="pt-3 border-t border-slate-200/70 dark:border-slate-700/80">
          <h4 className="font-semibold text-slate-900 dark:text-slate-50 text-xs mb-2">
            Calendar View (Week / Month)
          </h4>
          <CalendarGrid events={calendarEvents} defaultView="month" />
        </div>
      )}
    </div>
  );
});

export default CalendarPanel;