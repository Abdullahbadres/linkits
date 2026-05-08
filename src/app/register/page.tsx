"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordField } from "@/components/PasswordField";
import { PasswordStrengthHints } from "@/components/PasswordStrengthHints";
import { validatePasswordStrength } from "@/lib/passwordStrength";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const strengthErrors = validatePasswordStrength(password);
    if (strengthErrors.length > 0) {
      setError(strengthErrors.join(". "));
      setLoading(false);
      return;
    }

    if (password !== passwordConfirm) {
      setError("Passwords do not match. Please re-type your password to match.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.message ?? "Registration failed";
        const extra = Array.isArray(data.errors) ? data.errors.join(". ") : "";
        setError(extra ? `${msg}: ${extra}` : msg);
        return;
      }
      localStorage.removeItem("token");
      document.cookie = "token=; path=/; max-age=0";
      router.replace(`/login?registered=1&username=${encodeURIComponent(username.trim())}`);
    } catch {
      setError("Unexpected error while registering");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-indigo-400/20 bg-slate-900/70 p-6 shadow-2xl backdrop-blur md:max-w-md">
        <h1 className="mb-2 text-2xl font-bold text-white md:text-3xl">Create Account</h1>
        <p className="mb-6 text-sm text-slate-300">
          Register to access the Blu-ray digital copy sales dashboard.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Username</label>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none ring-indigo-400 transition focus:ring-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
            />
          </div>
          <PasswordField
            label="Password"
            id="register-password"
            value={password}
            onChange={setPassword}
            showPassword={showPassword}
            onToggleShow={() => setShowPassword((p) => !p)}
            autoComplete="new-password"
          />
          <PasswordField
            label="Re-Type your Password"
            id="register-password-confirm"
            value={passwordConfirm}
            onChange={setPasswordConfirm}
            showPassword={showPasswordConfirm}
            onToggleShow={() => setShowPasswordConfirm((p) => !p)}
            autoComplete="new-password"
          />
          <div className="rounded-lg border border-slate-700/80 bg-slate-800/50 px-3 py-2">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Password requirements</p>
            <PasswordStrengthHints password={password} confirmPassword={passwordConfirm} />
          </div>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Register"}
          </button>
          <p className="text-sm text-slate-300">
            Already have account?{" "}
            <Link href="/login" className="text-indigo-300 hover:text-indigo-200">
              Login
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
