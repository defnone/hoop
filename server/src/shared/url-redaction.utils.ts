const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_QUERY_KEYS = new Set<string>([
  'access_token',
  'api-key',
  'api_key',
  'apikey',
  'authorization',
  'client_secret',
  'key',
  'password',
  'secret',
  'token',
]);
const SENSITIVE_PARAMETER_PATTERN =
  /(^|[?&#\s])((?:access_token|api[-_]?key|apikey|authorization|client_secret|key|password|secret|token)=)[^&#\s]*/gi;

export function redactSensitiveUrl(value: string): string {
  if (!isAbsoluteHttpUrl(value)) {
    return redactSensitiveParameters(value);
  }

  try {
    const redactedUrl = new URL(value);
    redactedUrl.username = '';
    redactedUrl.password = '';

    for (const key of [...redactedUrl.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        redactedUrl.searchParams.set(key, REDACTED_VALUE);
      }
    }

    return redactSensitiveParameters(redactedUrl.href);
  } catch {
    return redactSensitiveParameters(value);
  }
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function redactSensitiveParameters(value: string): string {
  return value.replace(
    SENSITIVE_PARAMETER_PATTERN,
    (_match: string, prefix: string, key: string) =>
      `${prefix}${key}${REDACTED_VALUE}`,
  );
}
