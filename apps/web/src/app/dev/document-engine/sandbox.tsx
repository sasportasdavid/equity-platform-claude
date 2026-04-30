'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ExternalLink, FileText, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  generateAwardDocument,
  getDocumentPreviewUrl,
  voidDocument,
} from '@/server/actions/documents';

type AwardRow = {
  id: string;
  award_number: string | null;
  status: string;
  plan_id: string;
  beneficiary_id: string;
};
type TemplateRow = {
  id: string;
  code: string;
  name: string;
  applies_to_plan_types: string[] | null;
};
type DocRow = {
  id: string;
  document_number: string | null;
  status: string;
  generated_at: string | null;
  storage_path: string | null;
  related_entity_id: string | null;
};

export function Sandbox({
  awards,
  templates,
  recentDocs,
}: {
  awards: AwardRow[];
  templates: TemplateRow[];
  recentDocs: DocRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedAward, setSelectedAward] = useState<string>(awards[0]?.id ?? '');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleGenerate() {
    if (!selectedAward) {
      toast.error('Sélectionner un award');
      return;
    }
    startTransition(async () => {
      const res = await generateAwardDocument({
        awardId: selectedAward,
        templateCode: (selectedTemplate as never) || undefined,
      });
      if (res.ok) {
        toast.success(`PDF généré (${res.documentId.slice(0, 8)}…)`);
        if (res.warnings.length > 0) {
          toast.warning(`${res.warnings.length} warning(s) compliance`);
        }
        setPreviewUrl(res.previewUrl);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handlePreview(documentId: string) {
    startTransition(async () => {
      const res = await getDocumentPreviewUrl({ documentId });
      if (res.ok) {
        setPreviewUrl(res.signedUrl);
      } else toast.error(res.error);
    });
  }

  function handleVoid(documentId: string) {
    startTransition(async () => {
      const res = await voidDocument({
        documentId,
        reason: 'Test sandbox void',
      });
      if (res.ok) {
        toast.success('Document voidé');
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Dev Sandbox — Document Engine (Module 6 B2)</h1>
        <p className="text-muted-foreground text-sm">
          Test rendu PDF des 3 templates V1. Sélectionner un award → générer → preview iframe
          ci-dessous.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. Templates seedés</CardTitle>
          <CardDescription>{templates.length} template(s) actifs pour cette org.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {templates.map((t) => (
              <li key={t.id}>
                <code className="font-mono">{t.code}</code> — {t.name}{' '}
                {t.applies_to_plan_types ? (
                  <span className="text-muted-foreground">
                    ({t.applies_to_plan_types.join(', ')})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Générer un PDF</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="award" className="text-xs">
                Award
              </Label>
              <select
                id="award"
                value={selectedAward}
                onChange={(e) => setSelectedAward(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {awards.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.award_number ?? a.id.slice(0, 8)} — {a.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl" className="text-xs">
                Template (optionnel — auto si vide)
              </Label>
              <select
                id="tpl"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="">— Auto (depuis plan_type) —</option>
                <option value="BSPCE_GRANT_LETTER">BSPCE_GRANT_LETTER</option>
                <option value="AGA_GRANT_LETTER">AGA_GRANT_LETTER</option>
                <option value="SO_GRANT_LETTER">SO_GRANT_LETTER</option>
              </select>
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={pending || !selectedAward}>
            <FileText className="mr-2 size-4" /> Générer le PDF
          </Button>
        </CardContent>
      </Card>

      {previewUrl ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Preview PDF (signed URL 1h)</CardTitle>
            <CardDescription>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center hover:underline"
              >
                Ouvrir dans un nouvel onglet <ExternalLink className="ml-1 size-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <iframe
              src={previewUrl}
              title="PDF preview"
              className="h-[600px] w-full rounded-md border"
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>4. Documents récents (10 max)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentDocs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div className="flex-1">
                  <span className="font-mono">{d.document_number ?? '—'}</span>{' '}
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    {d.status}
                  </Badge>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {d.storage_path ?? '—'}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePreview(d.id)}
                    disabled={pending}
                  >
                    <FileText className="mr-1 size-3" /> Preview
                  </Button>
                  {d.status !== 'VOIDED' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleVoid(d.id)}
                      disabled={pending}
                      className="text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {recentDocs.length === 0 ? (
              <div className="text-muted-foreground text-sm italic">Aucun document.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
