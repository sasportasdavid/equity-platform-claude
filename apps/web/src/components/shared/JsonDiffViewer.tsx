'use client';

import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeLineDiff, isEmptyDiff, stringifySnapshot } from './json-diff-helpers';

/**
 * Affichage diff JSON 2 colonnes (avant / après) — Module 3b B6.
 *
 * Pour les snapshots `award_modifications.before_snapshot` /
 * `after_snapshot`, et pour le récap step 3 de la modale création de
 * modification.
 *
 * Stratégie de diff naïve : on stringify chaque snapshot avec un indent
 * de 2 espaces, puis ligne-par-ligne on highlight celles qui diffèrent.
 * Pas besoin de react-diff-viewer en V1 (overkill, +50 KB pour de la
 * comparaison JSON brute).
 *
 * Usage :
 *   <JsonDiffViewer before={beforeJson} after={afterJson} />
 *   <JsonDiffViewer before={a} after={b} maxHeight="320px" />
 */
export function JsonDiffViewer({
  before,
  after,
  maxHeight = '24rem',
  className,
}: {
  before: unknown;
  after: unknown;
  maxHeight?: string;
  className?: string;
}) {
  const beforeStr = useMemo(() => stringifySnapshot(before), [before]);
  const afterStr = useMemo(() => stringifySnapshot(after), [after]);
  const diffSet = useMemo(() => computeLineDiff(beforeStr, afterStr), [beforeStr, afterStr]);
  const beforeLines = beforeStr.split('\n');
  const afterLines = afterStr.split('\n');

  if (isEmptyDiff(before, after)) {
    return (
      <div
        className={cn(
          'text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs',
          className,
        )}
        data-testid="json-diff-empty"
      >
        Aucun snapshot à afficher
      </div>
    );
  }

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)} data-testid="json-diff-viewer">
      <SnapshotPane
        label="Avant"
        lines={beforeLines}
        diffSet={diffSet}
        diffTone="before"
        rawJson={beforeStr}
        maxHeight={maxHeight}
      />
      <SnapshotPane
        label="Après"
        lines={afterLines}
        diffSet={diffSet}
        diffTone="after"
        rawJson={afterStr}
        maxHeight={maxHeight}
      />
    </div>
  );
}

function SnapshotPane({
  label,
  lines,
  diffSet,
  diffTone,
  rawJson,
  maxHeight,
}: {
  label: string;
  lines: string[];
  diffSet: Set<number>;
  diffTone: 'before' | 'after';
  rawJson: string;
  maxHeight: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(rawJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="border-border bg-muted/40 flex flex-col rounded-md border">
      <div className="border-border flex items-center justify-between border-b px-2 py-1">
        <span className="text-muted-foreground text-[10px] font-medium uppercase">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="hover:bg-muted text-muted-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition"
          data-testid={`json-diff-copy-${diffTone}`}
        >
          {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <pre className="overflow-auto p-2 font-mono text-[10px] leading-snug" style={{ maxHeight }}>
        {lines.map((line, i) => {
          const isDiff = diffSet.has(i);
          return (
            <span
              key={i}
              className={cn(
                'block whitespace-pre',
                isDiff &&
                  (diffTone === 'before'
                    ? 'bg-amber-200/40 dark:bg-amber-500/15'
                    : 'bg-emerald-200/40 dark:bg-emerald-500/15'),
              )}
            >
              {line || ' '}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
