'use client';

import { Play, Pause, Square, Film, Image as ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Playback {
  state: 'playing' | 'paused' | 'idle';
  position_ms: number;
  duration_ms: number;
  memory_mb: number;
  asset_url?: string;
  updated_at_ms: number;
}

interface Props {
  playback: Playback | null | undefined;
  compact?: boolean;
}

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getAssetType(url?: string): 'video' | 'image' | 'unknown' {
  if (!url) return 'unknown';
  const lower = url.toLowerCase();
  if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov')) return 'video';
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.webp')) return 'image';
  if (lower.includes('/videos/') && !lower.match(/\.(png|jpg|jpeg|gif|webp)$/)) return 'video';
  return 'unknown';
}

export function PlaybackStatus({ playback, compact = false }: Props) {
  if (!playback) {
    return (
      <div className="text-xs text-muted-foreground italic">
        再生状態なし
      </div>
    );
  }

  const { state, position_ms, duration_ms, asset_url, updated_at_ms } = playback;
  const progress = duration_ms > 0 ? Math.min(100, (position_ms / duration_ms) * 100) : 0;
  const assetType = getAssetType(asset_url);
  const isStale = Date.now() - updated_at_ms > 10000;

  const StateIcon = state === 'playing' ? Play : state === 'paused' ? Pause : Square;
  const stateColor =
    state === 'playing' ? 'text-green-500' :
    state === 'paused' ? 'text-yellow-500' :
    'text-muted-foreground';

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <StateIcon className={`h-3 w-3 ${stateColor}`} />
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
          {formatMs(position_ms)}/{formatMs(duration_ms)}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StateIcon className={`h-4 w-4 ${stateColor}`} />
          <span className="text-sm font-medium">
            {state === 'playing' ? '再生中' : state === 'paused' ? '一時停止' : '停止中'}
          </span>
          {assetType !== 'unknown' && (
            <Badge variant="muted" className="text-[10px] h-4 px-1.5 gap-1">
              {assetType === 'video' ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
              {assetType === 'video' ? '動画' : '画像'}
            </Badge>
          )}
          {isStale && (
            <Badge variant="warn" className="text-[10px] h-4 px-1.5">古い</Badge>
          )}
        </div>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatMs(position_ms)} / {formatMs(duration_ms)}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
