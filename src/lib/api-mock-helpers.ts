/**
 * Helpers for Next.js route handlers serving mock data. We keep this in /lib
 * (not in /app/api) so it can be shared across multiple route files.
 */
import { NextResponse } from 'next/server';

export function json<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(data, init);
}

export function paginate<T>(
  items: T[],
  cursor: string | null,
  limit: number,
): { items: T[]; pagination: { next_cursor: string | null; prev_cursor: string | null; has_more: boolean } } {
  const start = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;
  const slice = items.slice(start, start + limit);
  const nextStart = start + limit;
  return {
    items: slice,
    pagination: {
      next_cursor: nextStart < items.length ? String(nextStart) : null,
      prev_cursor: start > 0 ? String(Math.max(0, start - limit)) : null,
      has_more: nextStart < items.length,
    },
  };
}

export function problem(status: number, title: string, detail?: string) {
  return NextResponse.json(
    { type: 'about:blank', title, status, detail },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

export async function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
