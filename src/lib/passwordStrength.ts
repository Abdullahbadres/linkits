export type PasswordRule = {
  id: string;
  label: string;
  met: boolean;
};

/**
 * True if password contains at least one symbol/punctuation: anything that is not
 * a letter, digit, or whitespace (so . , ; : ! " etc. all count).
 */
export function hasPasswordSymbolCharacter(password: string): boolean {
  return /[^a-zA-Z0-9\s]/.test(password);
}

/**
 * Live checklist for UI (same rules as validatePasswordStrength).
 */
export function getPasswordStrengthRules(password: string): PasswordRule[] {
  return [
    { id: "length", label: "At least 6 characters", met: password.length >= 6 },
    { id: "upper", label: "One uppercase letter (A–Z)", met: /[A-Z]/.test(password) },
    { id: "digit", label: "One number (0–9)", met: /[0-9]/.test(password) },
    {
      id: "special",
      label: "One symbol or punctuation (e.g. . , ; : ! @ # $ …)",
      met: hasPasswordSymbolCharacter(password),
    },
  ];
}

const RULE_ERRORS: Record<string, string> = {
  length: "Password must be at least 6 characters long",
  upper: "Password must contain at least one uppercase letter",
  digit: "Password must contain at least one number",
  special:
    "Password must contain at least one symbol or punctuation (for example . , ; : ! @ #), not only letters and numbers",
};

/**
 * Validates password against product rules. Returns a list of human-readable errors (empty if valid).
 */
export function validatePasswordStrength(password: string): string[] {
  return getPasswordStrengthRules(password)
    .filter((rule) => !rule.met)
    .map((rule) => RULE_ERRORS[rule.id] ?? rule.label);
}
