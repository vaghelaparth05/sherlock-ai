import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route gate for the two-role demo.
 * Dashboard + investigator tools (Import, Scan, Review, Sources, Results) are
 * information-manager only — normal users never see the investigation itself.
 * Normal users get their own /upload (public, so they can upload before signing
 * up) and /status (any logged-in session) pages instead.
 */

const COOKIE_NAME = "sherlock_session";
const MANAGER_ONLY = ["/dashboard", "/import", "/scan", "/review", "/sources", "/results"];
const AUTH_REQUIRED = ["/status"];

function readRole(request: NextRequest): "user" | "manager" | null {
  const raw = request.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { role?: string };
    return parsed.role === "manager" || parsed.role === "user" ? parsed.role : null;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = readRole(request);

  if (MANAGER_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (role !== "manager") {
      const url = new URL(role === "user" ? "/status" : "/login", request.url);
      if (role !== "user") url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (AUTH_REQUIRED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!role) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
