// src/components/CalendarPanel.jsx
import {
  useEffect,
  useImperativeHandle,
  useState,
  forwardRef,
} from "react";

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

const buttonGhost =
  "px-3 py-1.5 rounded-md border text-sm " +
  "border-slate-300 text-slate-700 bg-white/5 hover:bg-slate-50 " +
  "dark:border-slate-600 dark:text-slate-100 dark:bg-slate-900/40 dark:hover:bg-slate-800/80 transition";

const buttonPrimary =
  "px-3 py-1.5 rounded-md text-sm font-medium " +
  "bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60 transition";

// ---------- main component ----------
const CalendarPanel = forwardRef(function CalendarPanel({ userId }, ref) {
  const [mode, setMode] = useState("offline"); // "offline" | "google"

  // -------- OFFLINE CALENDAR STATE --------
  const [offTitle, setOffTitle] = useState("Follow-up meeting");
  const [offDate, setOffDate] = useState("");
  const [offTime, setOffTime] = useState("");
  const [offLocation, setOffLocation] = useState("");
  const [offNotifyEmail, setOffNotifyEmail] = useState("");
  const [offDescription, setOffDescription] = useState("");
  const [offEvents, setOffEvents] = useState([]);
  const [offStatus, setOffStatus] = useState("");
  const [offLoading, setOffLoading] = useState(false);

  // -------- GOOGLE CALENDAR STATE --------
  const [gTitle, setGTitle] = useState("Follow-up meeting");
  const [gDate, setGDate] = useState("");
  const [gStartTime, setGStartTime] = useState("");
  const [gEndTime, setGEndTime] = useState("");
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

  // Expose prefill() so Dashboard can fill the OFFLINE composer from Upcoming Events
 // Expose prefill() so Dashboard can fill the composer from Upcoming Events
useImperativeHandle(ref, () => ({
  prefill(u) {
    if (!u) return;

    // If user is currently in OFFLINE mode, prefill the offline form
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

    // If user is currently in GOOGLE mode, prefill the Google form
    if (mode === "google") {
      let dStr = gDate;
      let sStr = gStartTime;
      let eStr = gEndTime;

      if (u.start_iso) {
        const d = new Date(u.start_iso);
        if (!Number.isNaN(d.getTime())) {
          dStr = d.toISOString().slice(0, 10); // yyyy-mm-dd
          sStr = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
        }
      }

      if (u.end_iso) {
        const d = new Date(u.end_iso);
        if (!Number.isNaN(d.getTime())) {
          eStr = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
        }
      }

      const extra = u.source ? `\n\nSource: ${u.source}` : "";
      setGTitle(u.title || "Follow-up meeting");
      setGDescription((u.description || "") + extra);
      setGDate(dStr);
      setGStartTime(sStr);
      setGEndTime(eStr);
      setGErr("Prefilled from summary – review and Add to Google Calendar.");
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
      setOffEvents(Array.isArray(data) ? data : []);
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
          end_time: null,
          location: offLocation || null,
          notify_email: offNotifyEmail || null,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Create offline event failed:", text);
        throw new Error(text || "Failed to create event");
      }

      const data = await res.json();
      setOffEvents((prev) => [data, ...prev]);

      setOffTitle("Follow-up meeting");
      setOffDate("");
      setOffTime("");
      setOffLocation("");
      setOffNotifyEmail("");
      setOffDescription("");
      setOffStatus(
        "Event saved to offline calendar. Email will be sent if notify email is set."
      );
    } catch (err) {
      console.error(err);
      setOffStatus("Error creating event – see console / backend logs.");
    }
  }

  // -------- OFFLINE: send email for event --------
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

  // -------- GOOGLE: fetch events --------
  async function fetchGoogleEvents() {
    setGBusy(true);
    setGErr("");
    try {
      const url =
        userId != null
          ? `${API}/api/calendar/events?uid=${encodeURIComponent(userId)}`
          : `${API}/api/calendar/events`;

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
              "Google Calendar not connected. Click Connect to link your account."
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
      const url =
        userId != null
          ? `${API}/api/google/auth-url?uid=${encodeURIComponent(userId)}`
          : `${API}/api/google/auth-url`;

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

  // -------- GOOGLE: create event --------
  async function createGoogleEvent() {
    const start_iso = partsToISO(gDate, gStartTime);
    let end_iso = partsToISO(gDate, gEndTime);

    if (!start_iso) {
      setGErr("Please set a valid date and start time.");
      return;
    }
    if (!end_iso) {
      setGErr("Please set a valid end time.");
      return;
    }

    // if end < start (user typo), push end to next day
    if (new Date(end_iso) <= new Date(start_iso)) {
      const s = new Date(start_iso);
      const e = new Date(start_iso);
      e.setDate(e.getDate() + 1);
      end_iso = e.toISOString();
    }

    setGBusy(true);
    setGErr("");
    try {
      const body = {
        title: (gTitle || "Follow-up meeting").trim(),
        description: gDescription || "",
        start_iso,
        end_iso,
      };

      const url =
        userId != null
          ? `${API}/api/calendar/create?uid=${encodeURIComponent(userId)}`
          : `${API}/api/calendar/create`;

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

  return (
    <div className="p-4 rounded-2xl border border-slate-200/70 bg-white/95 shadow-[0_10px_35px_rgba(15,23,42,0.35)] dark:bg-slate-900/95 dark:border-slate-700/80 space-y-4">
      {/* Header + mode switch */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-900 dark:text-slate-50 text-sm">
            Calendar
          </h3>
          <div className="inline-flex border border-slate-300 dark:border-slate-600 rounded-md overflow-hidden text-[11px]">
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
            <button
              type="button"
              onClick={() => setMode("google")}
              className={`px-2 py-1 ${
                mode === "google"
                  ? "bg-purple-600 text-white"
                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              }`}
            >
              Google
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={mode === "offline" ? loadOfflineEvents : fetchGoogleEvents}
          disabled={mode === "offline" ? offLoading : gBusy}
          className="px-2.5 py-1.5 rounded-md border border-slate-300 text-xs text-slate-700 bg-white/5 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-100 dark:bg-slate-900/40 dark:hover:bg-slate-800/80 transition"
        >
          {mode === "offline"
            ? offLoading
              ? "Refreshing…"
              : "Refresh Events"
            : gBusy
            ? "Refreshing…"
            : "Refresh Events"}
        </button>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  Location
                </label>
                <input
                  className={inputBase}
                  value={offLocation}
                  onChange={(e) => setOffLocation(e.target.value)}
                  placeholder="Online / Room 201"
                />
              </div>
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

          {/* Offline event list */}
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
                {offEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="border border-slate-200/70 dark:border-slate-700/80 rounded-xl px-3 py-2 bg-slate-50/80 dark:bg-slate-800/80"
                  >
                    <div className="flex justify-between items-center">
                      <div className="font-medium text-slate-900 dark:text-slate-50 truncate">
                        {ev.title}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {ev.start_time
                          ? new Date(ev.start_time).toLocaleString()
                          : "—"}
                      </div>
                    </div>
                    {ev.location && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        📍 {ev.location}
                      </div>
                    )}
                    {ev.description && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {ev.description.length > 80
                          ? ev.description.slice(0, 80) + "…"
                          : ev.description}
                      </div>
                    )}
                    <div className="mt-1 flex justify-between items-center">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {ev.notify_email ? `Notify: ${ev.notify_email}` : ""}
                      </span>
                      {ev.notify_email && (
                        <button
                          type="button"
                          onClick={() => sendOfflineEmail(ev)}
                          className="text-[10px] px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700"
                        >
                          Send Email
                        </button>
                      )}
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
          {/* Quick Event Composer for Google */}
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-slate-900 dark:text-slate-50 text-sm">
                Quick Event Composer (Google)
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  connected
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/40"
                    : "bg-slate-700/40 text-slate-200 border border-slate-500/60"
                }`}
              >
                {connected ? "Connected" : "Not connected"}
              </span>
            </div>

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Start time
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
                  End time
                </label>
                <input
                  type="time"
                  className={inputBase}
                  value={gEndTime}
                  onChange={(e) => setGEndTime(e.target.value)}
                />
              </div>
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

            <div className="flex gap-2">
              <button
                type="button"
                onClick={connectGoogle}
                className={buttonGhost + " flex-1"}
              >
                Connect Google Calendar
              </button>
              <button
                type="button"
                onClick={createGoogleEvent}
                disabled={gBusy || !gDate || !gStartTime || !gEndTime}
                className={buttonPrimary + " flex-1"}
              >
                Add to Google Calendar
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Tip: End time is assumed to be on the same day. If it&apos;s
              earlier than the start time, we&apos;ll roll it to the next day
              automatically.
            </p>
          </div>

          {/* Google events list */}
          <div className="border-t border-slate-200/70 dark:border-slate-700/80 pt-3 mt-2">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-slate-900 dark:text-slate-50 text-xs">
                Google Calendar
              </h4>
            </div>

            {gErr && (
              <p className="mb-2 text-xs text-red-500 dark:text-red-400">
                {gErr}
              </p>
            )}

            {gEvents.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {connected
                  ? "No upcoming events."
                  : "No events (connect your calendar above)."}
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {gEvents.slice(0, 6).map((e) => (
                  <li
                    key={e.id}
                    className="border border-slate-200/70 dark:border-slate-700/80 rounded-xl px-3 py-2 bg-slate-50/80 dark:bg-slate-800/80"
                  >
                    <div className="font-medium text-slate-900 dark:text-slate-50 truncate">
                      {e.title}
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                      {formatEventRange(e.start, e.end)}
                    </div>
                    {e.location && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {e.location}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
});

export default CalendarPanel;