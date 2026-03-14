// In local dev, Vite proxies /api → localhost:5001 so no prefix is needed.
// In production on Vercel, the backend function is at /api.
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '';

export function apiFetch(path: string, options?: RequestInit): Promise<Response> {
    return fetch(`${API_BASE}${path}`, options);
}
