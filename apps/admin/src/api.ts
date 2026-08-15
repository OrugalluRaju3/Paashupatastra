const API = "/v1";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("paash_token") ?? localStorage.getItem("admin_token");
  const module = localStorage.getItem("paash_module");
  const intent = localStorage.getItem("paash_intent");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (module === "parking" || module === "tanker" || module === "seva") headers["x-auth-module"] = module;
  if (intent) headers["x-auth-intent"] = intent;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(authHeaders())) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  uploadFile: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<{
      url: string;
      fileName: string;
      mimeType: string;
      size: number;
    }>("/users/uploads", { method: "POST", body });
  },
};

export function qs(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : "";
}

export function formatInrFromPaise(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

/** Download an authenticated API response as a file (e.g. invoice HTML). */
export async function downloadAuthenticatedFile(path: string, fallbackFilename: string) {
  const headers = new Headers(authHeaders());
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? `Download failed (${res.status})`);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackFilename;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Open invoice HTML in a new tab for print / Save as PDF. */
export async function openAuthenticatedHtml(path: string) {
  const headers = new Headers(authHeaders());
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? `Open failed (${res.status})`);
  }
  const html = await res.text();
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
