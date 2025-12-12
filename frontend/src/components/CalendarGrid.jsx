// src/components/CalendarGrid.jsx
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enUS from "date-fns/locale/en-US";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "../styles/theme.css"; // <-- custom theme overrides

const locales = { "en-US": enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

// Custom toolbar that matches your app look
function CustomToolbar({ label, onNavigate, onView, view }) {
  return (
    <div className="flex items-center justify-between mb-2 gap-2">
      {/* Left: navigation */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate("TODAY")}
          className="px-2 py-1 text-[11px] rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-100 bg-white/60 dark:bg-slate-900/70 hover:bg-slate-50 dark:hover:bg-slate-800/80"
        >
          Today
        </button>
        <div className="inline-flex border border-slate-300 dark:border-slate-600 rounded-md overflow-hidden text-[11px]">
          <button
            type="button"
            onClick={() => onNavigate("PREV")}
            className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800/80"
          >
            ⟨
          </button>
          <button
            type="button"
            onClick={() => onNavigate("NEXT")}
            className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800/80"
          >
            ⟩
          </button>
        </div>
      </div>

      {/* Center: label */}
      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
        {label}
      </div>

      {/* Right: view switch */}
      <div className="inline-flex border border-slate-300 dark:border-slate-600 rounded-md overflow-hidden text-[11px]">
        <button
          type="button"
          onClick={() => onView("week")}
          className={
            "px-2 py-1 " +
            (view === "week"
              ? "bg-purple-600 text-white"
              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200")
          }
        >
          Week
        </button>
        <button
          type="button"
          onClick={() => onView("month")}
          className={
            "px-2 py-1 " +
            (view === "month"
              ? "bg-purple-600 text-white"
              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200")
          }
        >
          Month
        </button>
      </div>
    </div>
  );
}

export default function CalendarGrid({ events, defaultView = "month" }) {
  return (
    <div className="mt-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-900/90 p-3 shadow-[0_6px_18px_rgba(15,23,42,0.28)]">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        defaultView={defaultView}
        views={["month", "week"]}
        components={{
          toolbar: CustomToolbar,
        }}
        popup
        style={{ height: 320 }}
        // Make events look like small purple pills
        eventPropGetter={(event) => ({
          style: {
            backgroundColor: "rgba(129, 140, 248, 0.18)", // indigo-400/20
            borderRadius: "9999px",
            border: "1px solid rgba(129, 140, 248, 0.65)",
            color: "#0f172a", // slate-900
            fontSize: "10px",
            paddingInline: "4px",
            paddingBlock: "1px",
          },
          className: "rbc-event-pill",
        })}
      />
    </div>
  );
}