"use client";

import { getPasswordStrengthRules } from "@/lib/passwordStrength";

type Props = {
  password: string;
  /** Optional: show a fifth row when both strings are non-empty */
  confirmPassword?: string;
};

export function PasswordStrengthHints({ password, confirmPassword }: Props) {
  const rules = getPasswordStrengthRules(password);
  const matchMet =
    confirmPassword !== undefined &&
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  return (
    <ul className="space-y-1.5 text-xs" aria-live="polite">
      {rules.map((rule) => (
        <li key={rule.id}>
          <span
            className={`inline-block border-b-2 pb-0.5 transition-colors duration-200 ${
              rule.met
                ? "border-emerald-500 text-emerald-300"
                : "border-slate-600 text-slate-500"
            }`}
          >
            {rule.met ? "✓ " : "○ "}
            {rule.label}
          </span>
        </li>
      ))}
      {confirmPassword !== undefined ? (
        <li>
          <span
            className={`inline-block border-b-2 pb-0.5 transition-colors duration-200 ${
              matchMet ? "border-emerald-500 text-emerald-300" : "border-slate-600 text-slate-500"
            }`}
          >
            {matchMet ? "✓ " : "○ "}
            Passwords match
          </span>
        </li>
      ) : null}
    </ul>
  );
}
