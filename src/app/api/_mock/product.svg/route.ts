import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '1', 10);
  const palettes: [string, string, string][] = [
    ['#fbbf24', '#dc2626', 'P'], // premium
    ['#34d399', '#0e7490', 'S'], // standard
    ['#f472b6', '#9d174d', 'M'], // mini
    ['#a78bfa', '#5b21b6', 'C'], // collab
    ['#fb923c', '#7c2d12', '?'], // omikuji
  ];
  const [c1, c2, l] = palettes[(id - 1) % palettes.length];
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
  <defs>
    <radialGradient id="g">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </radialGradient>
  </defs>
  <circle cx="40" cy="40" r="36" fill="url(#g)" stroke="white" stroke-width="2"/>
  <text x="40" y="52" text-anchor="middle" fill="white" font-family="ui-monospace, monospace" font-size="34" font-weight="900">${l}</text>
</svg>`;
  return new NextResponse(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
