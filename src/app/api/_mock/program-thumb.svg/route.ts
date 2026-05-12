import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '1', 10);
  const hue = (id * 53) % 360;
  const titles = ['キャンペーン', '新作告知', '夜間モード', 'コラボX', 'ロゴ', 'セール'];
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 70%, 45%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 40) % 360}, 80%, 25%)"/>
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#g)" rx="6"/>
  <text x="160" y="90" text-anchor="middle" fill="white" font-family="system-ui" font-size="22" font-weight="700">${titles[id - 1] ?? 'プログラム'}</text>
  <text x="160" y="118" text-anchor="middle" fill="white" font-family="system-ui" font-size="13" opacity="0.7">prg_${id}</text>
</svg>`;
  return new NextResponse(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
