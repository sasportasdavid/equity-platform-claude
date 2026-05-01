'use client';

import { useState } from 'react';
import { Eye, FileText, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type RenderResult =
  | { code: string; ok: true; subject: string; html: string; text: string }
  | { code: string; ok: false; error: string };

export function Sandbox({ renders }: { renders: RenderResult[] }) {
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [view, setView] = useState<'html' | 'text'>('html');
  const open = renders.find((r) => r.code === openCode);

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Dev Sandbox — Notifications (Module 7 B2)</h1>
        <p className="text-muted-foreground text-sm">
          6 templates V1 react-email rendered avec SAMPLE_VARS factices. Click ”Preview” pour voir
          le HTML rendu en iframe.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Templates Module 7</CardTitle>
          <CardDescription>{renders.length} templates disponibles.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {renders.map((r) => (
              <div
                key={r.code}
                className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-slate-500" />
                    <code className="font-mono text-sm font-medium">{r.code}</code>
                    {r.ok ? (
                      <Badge variant="outline" className="text-[10px]">
                        OK
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">
                        ERROR
                      </Badge>
                    )}
                  </div>
                  {r.ok ? (
                    <div className="text-muted-foreground text-xs italic">Subject: {r.subject}</div>
                  ) : (
                    <div className="text-destructive text-xs">{r.error}</div>
                  )}
                </div>
                {r.ok ? (
                  <Button size="sm" variant="outline" onClick={() => setOpenCode(r.code)}>
                    <Eye className="mr-1 size-3" /> Preview
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {open && open.ok ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-4" />
              Preview — <code className="font-mono text-sm">{open.code}</code>
            </CardTitle>
            <CardDescription>
              <strong>Subject :</strong> {open.subject}
            </CardDescription>
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                variant={view === 'html' ? 'default' : 'outline'}
                onClick={() => setView('html')}
              >
                <Eye className="mr-1 size-3" /> HTML
              </Button>
              <Button
                size="sm"
                variant={view === 'text' ? 'default' : 'outline'}
                onClick={() => setView('text')}
              >
                <FileText className="mr-1 size-3" /> Plain text
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpenCode(null)}>
                Fermer
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {view === 'html' ? (
              <iframe
                srcDoc={open.html}
                title={`Preview ${open.code}`}
                className="h-[700px] w-full rounded-md border bg-white"
              />
            ) : (
              <pre className="max-h-[700px] overflow-auto whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
                {open.text}
              </pre>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
