'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save } from 'lucide-react';
import { tokenStore } from '@/lib/token-store';

export default function NewProgramPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      alert('プログラム名を入力してください');
      return;
    }
    setCreating(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';
      const token = tokenStore.getAccess();
      const res = await fetch(`${apiBase}/programs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (!res.ok) throw new Error(`作成失敗 (HTTP ${res.status})`);
      const data = await res.json();
      router.push(`/programs/${data.id}`);
    } catch (err) {
      alert(`作成失敗: ${err}`);
      setCreating(false);
    }
  };

  return (
    <AppShell title="新規プログラム" breadcrumb={['ホーム', 'プログラム', '新規']}>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/programs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            一覧へ戻る
          </Link>
        </Button>
      </div>

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>プログラムの基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">プログラム名 *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 夏キャンペーン動画"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="description">説明 (オプション)</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="このプログラムの内容や目的"
                rows={3}
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              作成後にシーン (動画 / 画像) を追加できます。
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" asChild>
                <Link href="/programs">キャンセル</Link>
              </Button>
              <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {creating ? '作成中...' : '作成して編集へ'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
