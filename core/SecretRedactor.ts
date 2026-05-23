const SECRET_PATTERNS = [
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
  /(api[_-]?key|token|password|secret|credential|authorization)(["']?\s*[:=]\s*["']?)[^"',\s}\n]+/gi,
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, (_match, prefix: string, separator?: string) => {
      if (separator === undefined) return `${prefix}[REDACTED]`;
      return `${prefix}${separator}[REDACTED]`;
    }),
    value,
  );
}

export function truncateAndRedact(value: string, maxLength: number): string {
  const redacted = redactSecrets(value);
  if (redacted.length <= maxLength) return redacted;
  return `${redacted.slice(0, maxLength)}... [truncated ${redacted.length - maxLength} chars]`;
}
