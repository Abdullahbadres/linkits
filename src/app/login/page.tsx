"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PasswordField } from "@/components/PasswordField";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("registered") === "1") {
      setInfo("Registration successful. Sign in with your new username and password.");
      const u = params.get("username");
      if (u) setUsername(u);
    }
    const reason = params.get("reason");
    if (reason === "required") {
      setInfo("Please sign in to open the dashboard.");
    }
    if (reason === "invalid") {
      setInfo("Your session expired or the link was invalid. Please sign in again.");
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Login failed");
        return;
      }
      localStorage.setItem("token", data.token);
      document.cookie = `token=${data.token}; path=/; max-age=28800`;
      router.push("/dashboard");
    } catch {
      setError("Unexpected error while logging in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-indigo-400/20 bg-slate-900/70 p-6 shadow-2xl backdrop-blur md:max-w-md">
        <h1 className="mb-2 text-2xl font-bold text-white md:text-3xl">Blu-ray Digital Copy Sales</h1>
        <p className="mb-6 text-sm text-slate-300">
          Manage digital copy fulfillment for Blu-ray purchases. Default login: admin / admin123
        </p>
        {info ? (
          <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">{info}</p>
        ) : null}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Username</label>
            <input
              suppressHydrationWarning
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none ring-indigo-400 transition focus:ring-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <PasswordField
            label="Password"
            id="login-password"
            value={password}
            onChange={setPassword}
            showPassword={showPassword}
            onToggleShow={() => setShowPassword((p) => !p)}
            autoComplete="current-password"
            suppressHydrationWarning
          />
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <button
            suppressHydrationWarning
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <p className="text-sm text-slate-300">
            No account yet?{" "}
            <Link href="/register" className="text-indigo-300 hover:text-indigo-200">
              Register
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
