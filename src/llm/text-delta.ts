/**
 * Merge a streamed text chunk. Some gateways resend the **cumulative** message
 * instead of a true delta — detect that and replace instead of appending.
 */
export function applyTextDelta(previous: string, chunk: string): string {
  if (!chunk) return previous;
  if (!previous) return chunk;
  if (chunk.startsWith(previous)) return chunk;
  if (previous.startsWith(chunk) && chunk.length <= previous.length) return previous;
  return previous + chunk;
}

/** True delta to emit after merging a (possibly cumulative) chunk. */
export function textDeltaPiece(previous: string, chunk: string): { next: string; piece: string } {
  const next = applyTextDelta(previous, chunk);
  return { next, piece: next.slice(previous.length) };
}
