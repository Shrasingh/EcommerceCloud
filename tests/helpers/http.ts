/** Builds a Request like Next.js passes to route handlers. */
export function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Route handler context with async params (Next.js 15+). */
export const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
