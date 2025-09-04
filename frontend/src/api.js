// Simple fetch wrapper that points to your backend API
const API_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

/**
 * api("/announcements") -> GET
 * api("/announcements", { method:"POST", body: JSON.stringify({...}) })
 */
export async function api(path, opts = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText);
  }

  return res.json();
}

export { API_URL };
