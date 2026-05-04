'use client';

/**
 * Module 10 B4 — Form minimal création share class (V5 — V2 fera un wizard).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { SHARE_CLASS_TYPES, type ShareClassType } from '@equity/shared';
import { createShareClass } from '@/server/actions/cap-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CLASS_LABELS: Record<ShareClassType, string> = {
  COMMON: 'Common Stock (founders, exercices)',
  PREFERRED: 'Preferred (investisseurs, liquidation pref)',
  ESOP: 'Pool ESOP (réservation, non émis)',
  WARRANT: 'Warrant / BSA (V2)',
  BSPCE: 'BSPCE classe dédiée',
  OTHER: 'Autre',
};

export function ShareClassForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [classType, setClassType] = useState<ShareClassType>('COMMON');
  const [parValue, setParValue] = useState('0.01');
  const [poolTotalUnits, setPoolTotalUnits] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createShareClass({
        code: code.toUpperCase(),
        name,
        classType,
        parValue: parValue ? Number(parValue) : undefined,
        poolTotalUnits: classType === 'ESOP' && poolTotalUnits ? Number(poolTotalUnits) : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/dashboard/captable');
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Type de classe</CardTitle>
          <CardDescription>{CLASS_LABELS[classType]}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {SHARE_CLASS_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setClassType(t)}
              data-active={classType === t}
              className={`rounded-md border p-3 text-left text-sm transition-colors ${
                classType === t
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-primary/40 hover:bg-muted/30'
              }`}
            >
              <div className="font-medium">{t}</div>
              <div className="text-muted-foreground mt-1 text-xs">{CLASS_LABELS[t]}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code (uppercase) *</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="COMMON, PREF_A, ESOP"
                required
                pattern="[A-Z0-9_]+"
                minLength={2}
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nom *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Actions ordinaires"
                required
                minLength={2}
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parValue">Par value (€)</Label>
              <Input
                id="parValue"
                type="number"
                step="0.00001"
                min={0}
                value={parValue}
                onChange={(e) => setParValue(e.target.value)}
                placeholder="0.01"
              />
            </div>
            {classType === 'ESOP' ? (
              <div className="space-y-1.5">
                <Label htmlFor="poolTotalUnits">Taille du pool (units) *</Label>
                <Input
                  id="poolTotalUnits"
                  type="number"
                  min={1}
                  value={poolTotalUnits}
                  onChange={(e) => setPoolTotalUnits(e.target.value)}
                  placeholder="100000"
                  required
                />
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={pending || !code || !name}>
          {pending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
          Créer la classe
        </Button>
      </div>
    </form>
  );
}
