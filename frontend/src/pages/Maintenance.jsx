import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import {
  FiTool,
  FiPlus,
  FiImage,
  FiSend,
  FiPaperclip,
  FiClock,
  FiCheckCircle,
  FiAlertCircle,
} from "react-icons/fi";
import Toast from "../components/Toast";

const STATUS_LABEL = {
  submitted: "Submitted",
  in_progress: "In Progress",
  resolved: "Resolved",
};

function StatusChip({ status }) {
  const map = {
    submitted: {
      bg: "#fffbeb",
      clr: "#92400e",
      br: "#fde68a",
      icon: <FiClock />,
    },
    in_progress: {
      bg: "#eff6ff",
      clr: "#1e40af",
      br: "#bfdbfe",
      icon: <FiAlertCircle />,
    },
    resolved: {
      bg: "#ecfdf5",
      clr: "#065f46",
      br: "#a7f3d0",
      icon: <FiCheckCircle />,
    },
  };
  const s = map[status] || map.submitted;

  return (
    <span
      className="chip"
      style={{
        background: s.bg,
        color: s.clr,
        borderColor: s.br,
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
      }}
    >
      {s.icon} {STATUS_LABEL[status] || status}
    </span>
  );
}

export default function Maintenance() {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  // new ticket form
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [desc, setDesc] = useState("");
  const [imgUrl, setImgUrl] = useState("");

  // chat box
  const [message, setMessage] = useState("");

  // toasts
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();

  const user = useMemo(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("user")) || { id: "u1", name: "Admin" }
      );
    } catch {
      return { id: "u1", name: "Admin" };
    }
  }, []);

  function showToast(text) {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  async function load() {
    setLoading(true);
    const list = await api(`/maintenance?userId=${user.id}`);
    setTickets(list);
    setSelected(
      (prev) => (prev ? list.find((t) => t.id === prev.id) || list[0] : list[0]) || null
    );
    setLoading(false);
  }

  useEffect(() => {
    load();

    // SSE live updates
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
    const es = new EventSource(`${API_URL}/events`);

    const handler = (ev) => {
      if (ev.type !== "message") return;
      try {
        JSON.parse(ev.data);
      } catch { }
    };

    // listen named event
    const onMaint = (ev) => {
      const data = JSON.parse(ev.data);
      if (
        !selected ||
        (data.ticketId && selected.id === data.ticketId) ||
        data.ticket
      ) {
        load();
      }
      const label =
        data.action === "status"
          ? `Ticket status: ${data.status}`
          : data.action === "comment"
            ? "New message"
            : data.action === "created"
              ? "Ticket created"
              : "Update";
      showToast(label);
    };

    es.addEventListener("maintenance", onMaint);
    es.onmessage = handler;
    es.onerror = () => { };

    return () => {
      es.removeEventListener("maintenance", onMaint);
      es.close();
    };
  }, [selected?.id]);

  async function submitTicket(e) {
    e.preventDefault();
    const payload = {
      userId: user.id,
      title,
      category,
      description: desc,
      images: imgUrl ? [imgUrl] : [],
    };
    const t = await api("/maintenance", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setTitle("");
    setCategory("General");
    setDesc("");
    setImgUrl("");
    setTickets((prev) => [t, ...prev]);
    setSelected(t);
    showToast("Ticket submitted");
  }

  async function addComment() {
    if (!selected || !message.trim()) return;
    const c = await api(`/maintenance/${selected.id}/comments`, {
      method: "POST",
      body: JSON.stringify({
        userId: user.id,
        name: user.name,
        text: message.trim(),
      }),
    });
    setTickets((prev) =>
      prev.map((t) => (t.id === selected.id ? { ...t, comments: [...t.comments, c] } : t))
    );
    setSelected((s) => ({ ...s, comments: [...(s?.comments || []), c] }));
    setMessage("");
  }

  async function changeStatus(next) {
    if (!selected) return;
    const updated = await api(`/maintenance/${selected.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSelected(updated);
    showToast(`Marked as: ${STATUS_LABEL[next]}`);
  }

  async function attachImage() {
    if (!selected || !imgUrl) return;
    await api(`/maintenance/${selected.id}/images`, {
      method: "POST",
      body: JSON.stringify({ imageUrl: imgUrl }),
    });
    setImgUrl("");
    load();
    showToast("Image attached");
  }

  return (
    <div className="modern-content">
      {toast && <Toast text={toast} />}

      <div className="section-header" style={{ marginBottom: 12 }}>
        <div className="section-left">
          <div className="section-icon">
            <FiTool />
          </div>
          <h3 style={{ margin: 0 }}>Maintenance</h3>
        </div>
      </div>

      {/* Layout: left column list + right column detail */}
      <div
        className="dashboard-grid"
        style={{ gridTemplateColumns: "minmax(280px, 420px) 1fr" }}
      >
        {/* LEFT: Create + My Tickets */}
        <div className="modern-card" style={{ display: "grid", gap: 14 }}>
          <div className="card-header">
            <h3>
              <FiPlus style={{ verticalAlign: "-2px", marginRight: 8 }} /> New
              Request
            </h3>
          </div>
          <form onSubmit={submitTicket} className="stack">
            <input
              className="input"
              placeholder="Title (e.g., Leaking tap)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <div className="row" style={{ gap: 10 }}>
              <select
                className="select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>General</option>
                <option>Electrical</option>
                <option>Plumbing</option>
                <option>Carpentry</option>
                <option>Cleaning</option>
                <option>Security</option>
              </select>
            </div>
            <textarea
              className="textarea"
              rows={4}
              placeholder="Describe the issue in detail…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
            <div className="row" style={{ gap: 10 }}>
              <input
                className="input"
                placeholder="Image URL (optional)"
                value={imgUrl}
                onChange={(e) => setImgUrl(e.target.value)}
              />
              <button
                type="button"
                className="btn outline"
                onClick={attachImage}
                disabled={!selected || !imgUrl}
              >
                <FiImage /> Attach
              </button>
            </div>
            <button className="btn primary" type="submit">
              <FiPlus /> Submit Request
            </button>
          </form>

          <div className="card-header" style={{ marginTop: 8 }}>
            <h3>My Tickets</h3>
          </div>
          <div className="stack" style={{ maxHeight: 420, overflow: "auto" }}>
            {loading && <div className="muted">Loading…</div>}
            {!loading && tickets.length === 0 && (
              <div className="muted">No requests yet.</div>
            )}
            {tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="item"
                style={{
                  textAlign: "left",
                  borderColor:
                    selected?.id === t.id ? "#c7d2fe" : undefined,
                  background:
                    selected?.id === t.id ? "#eef2ff" : undefined,
                  cursor: "pointer",
                }}
              >
                <div className="item-title">{t.title}</div>
                <div className="item-sub">
                  {t.category} •{" "}
                  {new Date(t.createdAt).toLocaleString()}
                </div>
                <StatusChip status={t.status} />
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: Details */}
        <div className="modern-card" style={{ display: "grid", gap: 14 }}>
          {!selected ? (
            <div className="muted">Select a ticket to view details.</div>
          ) : (
            <>
              <div className="row between">
                <div>
                  <div className="card-title" style={{ marginBottom: 4 }}>
                    {selected.title}
                  </div>
                  <div className="muted">
                    {selected.category} • Opened{" "}
                    {new Date(selected.createdAt).toLocaleString()}
                  </div>
                </div>
                <StatusChip status={selected.status} />
              </div>

              <div className="list-item">
                <div className="list-body">
                  <strong>Description</strong>
                  <div style={{ marginTop: 6 }}>
                    {selected.description || "—"}
                  </div>
                </div>
              </div>

              {/* Images */}
              <div className="list-item">
                <div className="list-body">
                  <strong>Images</strong>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(120px, 1fr))",
                      gap: 10,
                      marginTop: 10,
                    }}
                  >
                    {(selected.images || []).map((img, i) => (
                      <a
                        key={i}
                        href={img.url || img}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={img.url || img}
                          alt="attachment"
                          style={{
                            width: "100%",
                            height: 100,
                            objectFit: "cover",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                          }}
                          onError={(e) =>
                            (e.currentTarget.style.display = "none")
                          }
                        />
                      </a>
                    ))}
                    {selected.images?.length === 0 && (
                      <div className="muted">No images</div>
                    )}
                  </div>
                </div>
              </div>

              {/* History */}
              <div className="list-item">
                <div className="list-body">
                  <strong>Timeline</strong>
                  <ul className="list" style={{ marginTop: 8 }}>
                    {(selected.history || []).map((h) => (
                      <li key={h.id} className="list-row">
                        <div className="list-title">
                          <StatusChip status={h.status} />
                        </div>
                        <div className="list-sub">
                          {new Date(h.at).toLocaleString()}
                        </div>
                        <div className="list-body">
                          {h.note || ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

                {/* Quick status actions */}
                <div className="row" style={{ gap: 8 }}>
                  {selected.status &&
                    selected.status.toLowerCase() === "submitted" && (
                      <button
                        className="btn outline"
                        onClick={() => changeStatus("in_progress")}
                      >
                        Start Progress
                      </button>
                    )}
                  {selected.status &&
                    selected.status.toLowerCase() === "in_progress" && (
                      <button
                        className="btn outline"
                        onClick={() => changeStatus("resolved")}
                      >
                        Mark Resolved
                      </button>
                    )}
                  {/* No button for resolved */}
                </div>

              {/* Comments / Chat */}
              <div className="list-item">
                <div className="list-body">
                  <strong>Comments</strong>
                  <div className="stack" style={{ marginTop: 10 }}>
                    {(selected.comments || []).map((c) => {
                      const mine = c.userId === user.id;
                      return (
                        <div
                          key={c.id}
                          className={`bubble ${mine ? "me" : ""}`}
                          style={{ wordBreak: "break-word" }}
                        >
                          {!mine && (
                            <div
                              className="list-sub"
                              style={{ marginBottom: 4, fontWeight: 600 }}
                            >
                              {c.name || "User"}
                            </div>
                          )}
                          <div>{c.text}</div>
                          <div className="time">
                            {c.createdAt ? new Date(c.createdAt).toLocaleTimeString() : ""}
                          </div>
                        </div>
                      );
                    })}
                    {(!selected.comments ||
                      selected.comments.length === 0) && (
                        <div className="muted">No messages yet.</div>
                      )}
                    <div className="row">
                      <input
                        className="input"
                        placeholder="Write a message…"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addComment()}
                      />
                      <button className="btn outline" onClick={addComment}>
                        <FiSend /> Send
                      </button>
                    </div>
                    <div className="muted small">
                      <FiPaperclip style={{ verticalAlign: "-2px" }} /> Use the
                      image URL above to attach photos, or paste a data-URL.
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
