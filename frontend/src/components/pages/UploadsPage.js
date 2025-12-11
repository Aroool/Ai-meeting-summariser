// src/components/pages/UploadsPage.jsx
import { useEffect, useState } from "react";
import { Download, Trash2, Star } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const API = process.env.REACT_APP_API_URL || "";
const LS_KEY = "ai_summariser_user";
const AFTER_GOOGLE_KEY = "after_google_auth_destination";

const DRIVE_LS_PREFIX = "uploads_drive_files_";
const STARRED_LS_PREFIX = "uploads_starred_";

// ---- helpers ----
function readLocalUser() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "null");
  } catch {
    return null;
  }
}

// small helper to send X-User-Id like other components
function authHeaders(userId) {
  return userId ? { "X-User-Id": String(userId) } : {};
}

// Format "Nov 12, 2025, 4:04 PM"
function formatDateTime(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Try to get a nice human transcript name
function deriveTranscriptTitle(m) {
  const meetingId = m.id;

  // Prefer explicit transcript fields first
  const candidates = [
    m.transcript_filename,
    m.transcript_name,
    m.transcript_path,
    m.transcript_file,
  ].filter(Boolean);

  if (candidates.length) {
    const raw = String(candidates[0]);

    // strip folders if present
    const parts = raw.split(/[\\/]/);
    let name = parts[parts.length - 1];

    // strip "meeting_<id>_" prefix if your backend prefixes like that
    if (meetingId) {
      const prefix = `meeting_${meetingId}_`;
      if (name.startsWith(prefix)) {
        name = name.slice(prefix.length);
      }
    }
    return name;
  }

  // 🚑 Fallbacks if for some reason we have no transcript fields at all
  if (m.title) {
    return m.title.endsWith("_Transcript.txt")
      ? m.title
      : `${m.title}_Transcript.txt`;
  }

  return "Transcript.txt";
}


// Build uploads list from meetings array
function normalizeUploadsFromMeetings(meetings) {
  const manual = [];
  const drive = [];

  for (const m of meetings || []) {
    const hasTranscript =
      !!m.transcript_filename ||
      !!m.transcript_path ||
      !!m.transcript_name ||
      !!m.transcript_file;

    if (!hasTranscript) continue;

    const kind =
      m.transcript_source === "gdrive" ? "gdrive" : "manual";

    // ----------------------------
    // CLEAN TRANSCRIPT NAME
    // ----------------------------
    let filename =
      m.transcript_filename ||
      m.transcript_name ||
      m.transcript_path ||
      m.transcript_file ||
      "Transcript.txt";

    // Only take the actual file name, strip folders
    filename = filename.split("/").pop().split("\\").pop();

    // Remove meeting prefixes like: meeting_15_2025blah_
    filename = filename.replace(/^meeting_\d+_[A-Za-z0-9]+_/, "");

    const uploadedAt =
      m.transcript_uploaded_at ||
      m.updated_at ||
      m.created_at ||
      null;

    const item = {
      id: `m-${m.id}-${kind}`,
      meetingId: m.id,
      kind,
      title: filename,
      createdAt: uploadedAt,
      path: m.transcript_path || m.transcript_file || "",
      raw: m,
    };

    if (kind === "gdrive") drive.push(item);
    else manual.push(item);
  }

  return { manual, drive };
}



function mapDriveFilesToItems(files) {
  return (files || []).map((f) => ({
    id: `drive-${f.id}`,
    meetingId: null,
    kind: "gdrive",
    title: f.name || "Drive file",
    createdAt: f.modifiedTime || null,
    path: f.webViewLink || "",
    raw: f,
  }));
}

function loadDriveFromStorage(userId) {
  try {
    const raw = localStorage.getItem(`${DRIVE_LS_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDriveToStorage(userId, files) {
  try {
    localStorage.setItem(
      `${DRIVE_LS_PREFIX}${userId}`,
      JSON.stringify(files || [])
    );
  } catch {
    // ignore
  }
}

function mergeById(primary, secondary) {
  // primary wins on conflicts
  const map = new Map();
  for (const item of secondary || []) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of primary || []) {
    if (item && item.id) map.set(item.id, item);
  }
  return Array.from(map.values());
}

// ---- component ----
export default function UploadsPage() {
  const user = readLocalUser() || {};
  const userId = user.id || user.user_id || user.uid || 1;

  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);
  const openDrive = params.get("drive") === "1";
  const attachMeetingId = params.get("attach");
  const isAttachMode = !!attachMeetingId;

  // initial tab depends on ?drive=1
  const [activeTab, setActiveTab] = useState(openDrive ? "drive" : "manual"); // 'manual' | 'drive'
  const [manualFiles, setManualFiles] = useState([]);
  const [driveFiles, setDriveFiles] = useState(() =>
    loadDriveFromStorage(userId)
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [starred, setStarred] = useState(() => {
    try {
      const raw = localStorage.getItem(`${STARRED_LS_PREFIX}${userId}`);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr);
    } catch {
      return new Set();
    }
  });

  // Attach / preview modal state
  const [previewItem, setPreviewItem] = useState(null);
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // If the query param changes while we're on this page, sync the tab
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const driveFlag = p.get("drive") === "1";
    setActiveTab(driveFlag ? "drive" : "manual");
  }, [location.search]);

  // Persist drive files whenever they change
  useEffect(() => {
    saveDriveToStorage(userId, driveFiles);
  }, [driveFiles, userId]);

  // Persist starred set whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(
        `${STARRED_LS_PREFIX}${userId}`,
        JSON.stringify(Array.from(starred))
      );
    } catch {
      // ignore
    }
  }, [starred, userId]);

  async function fetchUploads() {
    setLoading(true);
    setErr("");

    try {
      const r = await fetch(`${API}/api/meetings/user/${userId}`, {
        credentials: "include",
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(
          t && t.startsWith("{")
            ? "Could not load uploads."
            : t || `Error ${r.status}`
        );
      }

      const list = await r.json();
      const { manual, drive } = normalizeUploadsFromMeetings(list);

      const cachedDrive = loadDriveFromStorage(userId);
      const mergedDrive = mergeById(drive, cachedDrive);

      setManualFiles(manual);
      setDriveFiles(mergedDrive);
    } catch (e) {
      console.error("Uploads fetch error:", e);
      setErr(e?.message || "Failed to load uploads.");
      setManualFiles([]);
      // keep existing driveFiles from storage instead of clearing
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUploads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const currentList = activeTab === "manual" ? manualFiles : driveFiles;

  const toggleStar = (id) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---- DOWNLOAD: real endpoints now ----
  const handleDownload = (item) => {
    // Manual transcripts: use meeting transcript endpoint
    if (item.kind === "manual" && item.meetingId) {
      const url = `${API}/api/meetings/${item.meetingId}/transcript?raw=true`;
      window.open(url, "_blank");
      return;
    }

    // Drive uploads: use webViewLink or any https URL
    if (item.path && /^https?:\/\//i.test(item.path)) {
      window.open(item.path, "_blank");
      return;
    }

    // Fallback for any relative file path (if you ever store them)
    if (item.path) {
      const path =
        item.path.startsWith("/") ? item.path : `/${item.path}`;
      window.open(`${API}${path}`, "_blank");
      return;
    }

    alert("Download endpoint not wired yet – front-end only for now.");
  };

  // ---- DELETE: call meeting transcript DELETE for manual items ----
  const handleDelete = async (item) => {
    const sure = window.confirm(
      `Delete transcript for “${item.title}”? This cannot be undone.`
    );
    if (!sure) return;

    // Manual meeting transcripts -> real API delete
    if (item.kind === "manual" && item.meetingId) {
      try {
        const res = await fetch(
          `${API}/api/meetings/${item.meetingId}/transcript`,
          {
            method: "DELETE",
            credentials: "include",
          }
        );

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(
            t || `Failed to delete transcript (HTTP ${res.status})`
          );
        }

        // Remove from UI
        setManualFiles((list) => list.filter((f) => f.id !== item.id));
        // Also un-star if it was starred
        setStarred((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        return;
      } catch (e) {
        console.error("Delete transcript error:", e);
        alert(
          e?.message ||
            "Failed to delete transcript. Please try again from the meeting page."
        );
        return;
      }
    }

    // GDrive list items: still front-end only for now
    if (item.kind === "gdrive") {
      setDriveFiles((list) => list.filter((f) => f.id !== item.id));
      setStarred((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // --- handlers for the two buttons ---
  const handleConnectDrive = async () => {
    setErr("");
    try {
      const res = await fetch(`${API}/api/google/auth-url`, {
        credentials: "include",
        headers: authHeaders(userId),
        redirect: "follow",
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(
          t || `Failed to start Google Drive connection (HTTP ${res.status})`
        );
      }

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      const url =
        data.auth_url ||
        data.authUrl ||
        data.url ||
        data.redirect_url ||
        data.redirect ||
        data.login_url;

      if (url && typeof url === "string") {
        localStorage.setItem(AFTER_GOOGLE_KEY, "uploads");
        window.location.href = url;
        return;
      }

      localStorage.setItem(AFTER_GOOGLE_KEY, "uploads");
      window.location.href = `${API}/api/google/auth-url`;
    } catch (e) {
      console.error("Connect Drive error:", e);
      setErr(e?.message || "Failed to connect Google Drive.");
    }
  };

  const handleBackfill = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${API}/api/google/drive/backfill`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(userId),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Backfill failed.");
      }

      const data = await res.json();
      const files = data.files || [];
      const items = mapDriveFilesToItems(files);

      setDriveFiles((prev) => mergeById(items, prev));
    } catch (e) {
      console.error("Backfill transcripts error:", e);
      setErr(e?.message || "Failed to backfill transcripts from Google Drive.");
    } finally {
      setLoading(false);
    }
  };

  // -------- attach-to-meeting flow --------
  const openAttachModal = async (item) => {
    if (!isAttachMode || !attachMeetingId) return;

    setPreviewItem(item);
    setPreviewText("");
    setPreviewError("");
    setIsAttachModalOpen(true);
    setIsPreviewLoading(true);

    try {
      const raw = item.raw || {};
      const fileId =
        raw.id ||
        raw.fileId ||
        (item.id && item.id.startsWith("drive-")
          ? item.id.slice("drive-".length)
          : null);

      const mimeType = raw.mimeType || null;

      if (!fileId) {
        setPreviewError("Could not determine Drive file id for this item.");
        setIsPreviewLoading(false);
        return;
      }

      const res = await fetch(`${API}/api/google/drive/preview_text`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(userId),
        },
        body: JSON.stringify({
          file_id: fileId,
          mime_type: mimeType,
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Preview failed (${res.status})`);
      }

      const data = await res.json();
      setPreviewText(data.text || "");
    } catch (e) {
      console.error("Preview error:", e);
      setPreviewError(e?.message || "Failed to load preview from Drive.");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleConfirmAttach = async () => {
    if (!previewItem || !attachMeetingId) return;

    try {
      const raw = previewItem.raw || {};
      const fileId =
        raw.id ||
        raw.fileId ||
        (previewItem.id && previewItem.id.startsWith("drive-")
          ? previewItem.id.slice("drive-".length)
          : null);
      const mimeType = raw.mimeType || null;

      if (!fileId) {
        alert("Could not determine Drive file id for this item.");
        return;
      }

      const res = await fetch(`${API}/api/google/drive/attach_to_meeting`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(userId),
        },
        body: JSON.stringify({
          meeting_id: Number(attachMeetingId),
          file_id: fileId,
          mime_type: mimeType,
          name: previewItem.title,
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Attach failed (${res.status})`);
      }

      setIsAttachModalOpen(false);
      setPreviewItem(null);
      setPreviewText("");

      navigate(`/meetings/${attachMeetingId}`);
    } catch (e) {
      console.error("Attach to meeting error:", e);
      alert(e?.message || "Failed to attach Drive file to meeting.");
    }
  };

  const handleCloseAttachModal = () => {
    setIsAttachModalOpen(false);
    setPreviewItem(null);
    setPreviewText("");
    setPreviewError("");
  };

  // -------- render --------
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
          Uploads
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {isAttachMode
            ? `Select a Google Drive transcript to attach to Meeting #${attachMeetingId}.`
            : "All transcripts you’ve uploaded across meetings."}
        </p>
      </header>

      {/* Tabs + refresh */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-6 text-sm border-b border-slate-200 dark:border-slate-700">
          <button
            type="button"
            className={`pb-2 -mb-px ${
              activeTab === "manual"
                ? "border-b-2 border-rose-400 text-slate-900 dark:text-slate-50"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
            onClick={() => setActiveTab("manual")}
          >
            Manual
          </button>
          <button
            type="button"
            className={`pb-2 -mb-px ${
              activeTab === "drive"
                ? "border-b-2 border-rose-400 text-slate-900 dark:text-slate-50"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
            onClick={() => setActiveTab("drive")}
          >
            G Drive uploads
          </button>
        </div>

        <button
          type="button"
          onClick={fetchUploads}
          disabled={loading}
          className="px-3 py-1.5 rounded-full text-xs border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-100 bg-white/80 dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Card container */}
      <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
        {/* section header */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
          {activeTab === "manual" ? "MANUAL UPLOADED" : "G DRIVE UPLOADS"}
        </div>

        {/* extra toolbar ONLY for G Drive tab */}
        {activeTab === "drive" && (
          <div className="px-4 pt-3 pb-3 flex flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={handleConnectDrive}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500 text-white hover:bg-sky-600"
            >
              Connect to G&nbsp;Drive
            </button>
            <button
              type="button"
              onClick={handleBackfill}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800"
            >
              Backfill transcripts
            </button>
          </div>
        )}

        {err && (
          <div className="px-4 py-3 text-xs text-red-600 border-b border-slate-100 dark:border-slate-800">
            {err}
          </div>
        )}

        {/* List */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading && currentList.length === 0 && (
            <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-300">
              Loading uploads…
            </div>
          )}

          {!loading && currentList.length === 0 && (
            <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-300">
              No files found.
            </div>
          )}

          {currentList.map((item) => {
            const label =
              item.kind === "gdrive" ? "G-Drive upload" : "Manual upload";
            const dt = formatDateTime(item.createdAt);

            return (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/70 transition"
              >
                {/* Left icon */}
                <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[11px] font-semibold text-slate-500">
                  TXT
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">
                    {item.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {label}
                    {dt && ` · ${dt}`}
                  </div>
                </div>

                {/* Status pill */}
                <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 text-[11px] mr-1">
                  Uploaded
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {isAttachMode &&
                    activeTab === "drive" &&
                    item.kind === "gdrive" && (
                      <button
                        type="button"
                        onClick={() => openAttachModal(item)}
                        className="px-3 py-1.5 rounded-full bg-purple-600 text-white text-xs font-medium hover:bg-purple-700"
                      >
                        Attach to meeting
                      </button>
                    )}

                  <button
                    type="button"
                    onClick={() => toggleStar(item.id)}
                    className={`p-1.5 rounded-full border text-slate-500 hover:text-amber-400 hover:border-amber-300 dark:text-slate-300 dark:hover:text-amber-300 ${
                      starred.has(item.id)
                        ? "border-amber-300 bg-amber-50/60 dark:bg-amber-900/40 text-amber-400"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                    title={starred.has(item.id) ? "Unstar" : "Star"}
                  >
                    <Star
                      size={14}
                      className={starred.has(item.id) ? "fill-current" : ""}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownload(item)}
                    className="p-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-50 dark:hover:bg-slate-700"
                    title="Download"
                  >
                    <Download size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="p-1.5 rounded-full border border-rose-200/80 text-rose-500 hover:bg-rose-50 dark:border-rose-700/60 dark:text-rose-300 dark:hover:bg-rose-900/30"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Attach / Preview modal */}
      {isAttachModalOpen && previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Attach transcript to Meeting #{attachMeetingId}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {previewItem.title}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseAttachModal}
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300"
                aria-label="Close attach modal"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto bg-slate-50/80 dark:bg-slate-950/60">
              {isPreviewLoading ? (
                <p className="text-xs text-slate-500 dark:text-slate-300">
                  Loading preview from Google Drive…
                </p>
              ) : previewError ? (
                <p className="text-xs text-rose-600 dark:text-rose-300">
                  {previewError}
                </p>
              ) : previewText ? (
                <pre className="text-[11px] sm:text-xs font-mono whitespace-pre-wrap text-slate-800 dark:text-slate-100">
                  {previewText}
                </pre>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-300">
                  No preview text available, but you can still attach this file.
                </p>
              )}
            </div>

            <div className="flex justify-between items-center px-4 py-3 border-t border-slate-200 dark:border-slate-700 text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Attach this transcript to the meeting? You can regenerate the
                summary afterwards.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCloseAttachModal}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAttach}
                  disabled={isPreviewLoading}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-60"
                >
                  Attach to meeting
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
