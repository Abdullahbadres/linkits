import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-super-secret-change-me");

const PUBLIC_PATHS = ["/api/auth/login", "/api/auth/register", "/api/health", "/login", "/register"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  if (!pathname.startsWith("/api") && !pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }
  if (isPublic) return NextResponse.next();

  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isApi = pathname.startsWith("/api");

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : request.cookies.get("token")?.value;

  function redirectToLogin(reason: "required" | "invalid") {
    const login = new URL("/login", request.url);
    login.searchParams.set("reason", reason);
    return NextResponse.redirect(login);
  }

  if (!token) {
    if (isDashboard) return redirectToLogin("required");
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    if (isDashboard) return redirectToLogin("invalid");
    return NextResponse.json({ message: "Invalid token" }, { status: 401 });
  }
}

export const config = {
  matcher: ["/api/:path*", "/dashboard", "/dashboard/:path*"],
};
