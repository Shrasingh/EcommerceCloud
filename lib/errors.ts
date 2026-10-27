import axios from "axios";

/**
 * User-facing message for a failed request. 4xx responses from our API carry a
 * readable plain-text reason (validation, conflicts), so show it; anything
 * else falls back to a generic message.
 */
export function getErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const data = error.response?.data;
    if (status >= 400 && status < 500 && typeof data === "string" && data.trim() && data.length < 300) {
      return data;
    }
  }
  return fallback;
}
