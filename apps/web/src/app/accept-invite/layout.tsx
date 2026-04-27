import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AcceptInviteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/30 flex min-h-full flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span className="bg-primary text-primary-foreground inline-flex size-9 items-center justify-center rounded-md font-mono font-bold">
          C
        </span>
        <span className="text-xl font-semibold tracking-tight">Capiwise</span>
      </Link>
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
