const MISSING_RESPONSE_PATTERNS: readonly string[] = [
  'response.status',
  "undefined is not an object (evaluating 'G.response.status')",
];

export function normalizeTransmissionError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (MISSING_RESPONSE_PATTERNS.some((pattern) => message.includes(pattern))) {
    return new Error('Transmission request failed without an HTTP response');
  }

  return error instanceof Error ? error : new Error(message);
}
