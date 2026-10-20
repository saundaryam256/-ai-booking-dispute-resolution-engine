const API_ROOT = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

export const api = {
  disputes: (search = "", status = "") => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    return request(`/disputes${params.size ? `?${params}` : ""}`);
  },
  stats: () => request("/disputes/stats"),
  detail: (caseId) => request(`/disputes/${encodeURIComponent(caseId)}`),
  policies: () => request("/policies"),
  create: (payload) => request("/disputes", { method: "POST", body: JSON.stringify(payload) }),
  investigate: (caseId) => request(`/disputes/${encodeURIComponent(caseId)}/investigate`, { method: "POST" }),
  decide: (caseId, payload) => request(`/disputes/${encodeURIComponent(caseId)}/decision`, { method: "POST", body: JSON.stringify(payload) }),
  health: () => request("/health"),
};
