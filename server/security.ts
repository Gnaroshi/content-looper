import { timingSafeEqual } from "node:crypto";

const allowedBrowserOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

export function isAllowedBrowserOrigin(origin: string | undefined, tokenRequired: boolean): boolean {
  if (!origin) return true;
  if (origin === "null") return tokenRequired;
  return allowedBrowserOrigins.has(origin);
}

export function isAuthorizedRequest(authorization: string | undefined, expectedToken: string): boolean {
  if (!expectedToken) return true;
  const suppliedToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const supplied = Buffer.from(suppliedToken);
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function safeHttpsUrl(value: string | undefined): string | null {
  if (!value || value.length > 8_192) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}
