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
import { usePageT } from '@/i18n/usePageT';
import { programNewDict } from '@/i18n/ns/programNew';

export default function NewProgramPage() {
  const t = usePageT(programNewDict);
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      alert(t.enterName);
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
      if (!res.ok) throw new Error(t.createFailedHttp(res.status));
      const data = await res.json();
      router.push(`/programs/${data.id}`);
    } catch (err) {
      alert(t.createFailed(String(err)));
      setCreating(false);
    }
  };

  return (
    <AppShell title={t.title} breadcrumb={[t.home, t.bcPrograms, t.bcNew]}>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/programs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            {t.backToList}
          </Link>
        </Button>
      </div>

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{t.basicInfo}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">{t.nameLabel}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.namePlaceholder}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="description">{t.descLabel}</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.descPlaceholder}
                rows={3}
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t.afterCreateNote}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" asChild>
                <Link href="/programs">{t.cancel}</Link>
              </Button>
              <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {creating ? t.creating : t.createAndEdit}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
