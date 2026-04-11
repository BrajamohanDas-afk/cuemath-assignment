import { NextResponse, type NextRequest } from "next/server";

const AUTH_SESSION_COOKIE_NAME = "app_session";

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === "/account" ||
    pathname === "/upload" ||
    pathname === "/decks" ||
    pathname.startsWith("/decks/") ||
    pathname === "/review" ||
    pathname === "/progress"
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }
  if (!isGoogleAuthEnabled()) {
    return NextResponse.next();
  }

  const hasSession = Boolean(
    request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value?.trim(),
  );
  if (hasSession) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/account", "/upload", "/decks/:path*", "/review", "/progress"],
};

function isGoogleAuthEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
