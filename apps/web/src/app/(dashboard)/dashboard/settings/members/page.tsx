import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { listMembersForOrg, listPendingInvitationsForOrg } from '@/server/queries/members';
import { InvitationsTable } from './invitations-table';
import { InviteMemberDialog } from './invite-member-dialog';
import { MembersTable } from './members-table';

export const metadata: Metadata = {
  title: 'Membres',
};

export default async function MembersPage() {
  const user = await requireUser();
  if (!user.activeOrgId) redirect('/onboarding/create-org');

  const canManage = await hasPermission('org.manage_members');
  if (!canManage) redirect('/unauthorized');

  const [members, invitations] = await Promise.all([
    listMembersForOrg(user.activeOrgId),
    listPendingInvitationsForOrg(user.activeOrgId),
  ]);

  return (
    <div className="space-y-6" data-testid="members-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Membres</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Gérez qui a accès à votre organisation et avec quel niveau de droit.
          </p>
        </div>
        <InviteMemberDialog />
      </header>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Actifs ({members.length})</TabsTrigger>
          <TabsTrigger value="pending">En attente ({invitations.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <MembersTable members={members} currentUserId={user.id} />
        </TabsContent>
        <TabsContent value="pending" className="mt-4">
          <InvitationsTable invitations={invitations} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
