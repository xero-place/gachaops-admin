import { NextRequest, NextResponse } from 'next/server';

/** Generates type-specific asset thumbnail icons */
export async function GET(req: NextRequest) {
  const type = new URL(req.url).searchParams.get('type') ?? 'image';
  const colors: Record<string, [string, string]> = {
    image: ['#0ea5e9', '#0369a1'],
    video: ['#8b5cf6', '#5b21b6'],
    gif: ['#ec4899', '#9d174d'],
    audio: ['#f59e0b', '#92400e'],
    html: ['#10b981', '#065f46'],
  };
  const [c1, c2] = colors[type] ?? colors.image;
  const labels: Record<string, string> = {
    image: 'IMG',
    video: 'VID',
    gif: 'GIF',
    audio: 'AUD',
    html: '</>',
  };
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" fill="url(#g)" rx="8"/>
  <text x="100" y="115" text-anchor="middle" fill="white" font-family="ui-monospace, monospace" font-size="42" font-weight="700">${labels[type]}</text>
</svg>`;
  return new NextResponse(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
