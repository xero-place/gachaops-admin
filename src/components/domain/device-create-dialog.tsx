'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Check, Copy, AlertCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { Store, DeviceCreateResult } from '@/types/domain';

interface DeviceCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: Store[];
  /** 作成成功時、新規 device を一覧に反映するために呼ばれる */
  onCreated: (device: DeviceCreateResult) => void;
}

export function DeviceCreateDialog({
  open,
  onOpenChange,
  stores,
  onCreated,
}: DeviceCreateDialogProps) {
  const [name, setName] = useState('');
  const [storeId, setStoreId] = useState('');
  const [serial, setSerial] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 作成成功後、provisioning_code を表示するための結果
  const [result, setResult] = useState<DeviceCreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  const canSubmit =
    name.trim().length > 0 && storeId.length > 0 && serial.trim().length > 0;

  const resetForm = () => {
    setName('');
    setStoreId('');
    setSerial('');
    setError(null);
    setResult(null);
    setCopied(false);
    setSubmitting(false);
  };

  const handleClose = (next: boolean) => {
    if (submitting) return; // 送信中は閉じさせない
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<DeviceCreateResult>('/devices', {
        name: name.trim(),
        store_id: storeId,
        serial: serial.trim(),
      });
      setResult(created);
      onCreated(created);
    } catch (e) {
      if (e instanceof ApiError) {
        // 409 (シリアル重複) や 422 (バリデーション) の detail をそのまま表示
        const fieldMsg = e.problem.errors?.[0]?.message;
        setError(fieldMsg || e.problem.detail || e.problem.title);
      } else {
        setError(e instanceof Error ? e.message : '不明なエラーが発生しました');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCode = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.provisioning_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボード API 不可の環境では何もしない (コードは画面に表示済み)
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[440px]">
        {result ? (
          // ─── 作成成功: provisioning_code 表示 ───
          <>
            <DialogHeader>
              <DialogTitle>端末を作成しました</DialogTitle>
              <DialogDescription>
                下のプロビジョニングコードは<strong>この画面でのみ表示されます</strong>。
                現地で端末に入力するため、必ず控えてください。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="text-xs text-muted-foreground mb-1.5">
                  プロビジョニングコード
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-2xl font-mono font-semibold tracking-[0.2em] tabular-nums">
                    {result.provisioning_code}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={handleCopyCode}
                    aria-label="コードをコピー"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-ok" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between gap-3">
                  <span>端末名</span>
                  <span className="text-foreground">{result.name}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>シリアル</span>
                  <span className="font-mono text-foreground">{result.serial}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>店舗</span>
                  <span className="text-foreground">{result.store_name}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>ID</span>
                  <span className="font-mono text-foreground">{result.id}</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>閉じる</Button>
            </DialogFooter>
          </>
        ) : (
          // ─── 作成フォーム ───
          <>
            <DialogHeader>
              <DialogTitle>新規端末作成</DialogTitle>
              <DialogDescription>
                新しい端末の「枠」を登録します。作成後に表示される
                プロビジョニングコードを現地での登録に使用します。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="device-name">端末名</Label>
                <Input
                  id="device-name"
                  placeholder="例: 渋谷店 1F-A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="device-store">店舗</Label>
                <Select
                  value={storeId}
                  onValueChange={setStoreId}
                  disabled={submitting}
                >
                  <SelectTrigger id="device-store">
                    <SelectValue placeholder="店舗を選択..." />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="device-serial">シリアル</Label>
                <Input
                  id="device-serial"
                  placeholder="端末のハードウェアシリアル"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  disabled={submitting}
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  シリアルは作成後に変更できません。
                </p>
              </div>
              {error && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 p-2.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  <span>{error}</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={submitting}
              >
                キャンセル
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                作成
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
