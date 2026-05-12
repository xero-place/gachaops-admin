import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns a deterministic SVG "screenshot" of a fake gacha device. The image
 * varies by query params so the UI can show different thumbnails per device.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get('d') ?? 'unknown';
  const t = url.searchParams.get('t') ?? '1';
  const seed = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + parseInt(t, 10);

  const hue = (seed * 37) % 360;
  const hue2 = (hue + 60) % 360;
  const programIdx = seed % 4;
  const titles = ['SPRING CAMPAIGN', 'NEW PRODUCT', 'COLLAB X', 'NIGHT MODE'];
  const subtitles = ['¥500 ガチャ', '本日限定', 'コラボ実施中', '¥300 - ¥800'];

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 960" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 65%, 30%)"/>
      <stop offset="100%" stop-color="hsl(${hue2}, 75%, 18%)"/>
    </linearGradient>
    <radialGradient id="r" cx="0.5" cy="0.4" r="0.7">
      <stop offset="0%" stop-color="hsl(${hue}, 100%, 75%)" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="hsl(${hue}, 100%, 30%)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="540" height="960" fill="url(#g)"/>
  <rect width="540" height="960" fill="url(#r)"/>
  <g font-family="system-ui, -apple-system, sans-serif" fill="white">
    <text x="270" y="350" text-anchor="middle" font-size="56" font-weight="900" letter-spacing="-2">${titles[programIdx]}</text>
    <text x="270" y="420" text-anchor="middle" font-size="32" font-weight="500" opacity="0.9">${subtitles[programIdx]}</text>
    <circle cx="270" cy="600" r="100" fill="white" opacity="0.15"/>
    <circle cx="270" cy="600" r="80" fill="white" opacity="0.25"/>
    <text x="270" y="618" text-anchor="middle" font-size="80" font-weight="900">G</text>
    <text x="270" y="780" text-anchor="middle" font-size="22" opacity="0.7">${id}</text>
    <text x="270" y="820" text-anchor="middle" font-size="18" opacity="0.5">screenshot @ now</text>
  </g>
</svg>`;
  return new NextResponse(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
