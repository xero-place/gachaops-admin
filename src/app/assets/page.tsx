'use client';

// S262q: 「映像の素材」は「映像」(/programs) にまとめた。古いリンクから来たときは移動する。
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AssetsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/programs');
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
