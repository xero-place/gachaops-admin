import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GTCHAXAPP 管理画面',
  description: 'GTCHAXAPP - サイネージ統合管理プラットフォーム',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body className="min-h-screen bg-background font-sans">{children}</body>
    </html>
  );
}
