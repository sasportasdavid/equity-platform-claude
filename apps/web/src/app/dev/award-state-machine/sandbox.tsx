'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  cancelAward,
  createAwardDraft,
  forfeitAward,
  transitionAward,
} from '@/server/actions/awards';
import {
  getAllowedTransitions,
  isCancellable,
  type AwardStatus,
} from '@/lib/stateMachines/awardStateMachine';
import { devUpsertBeneficiary } from './dev-actions';

type AwardRow = {
  id: string;
  award_number: string | null;
  status: string;
  units_granted: number | string;
  units_vested: number | string | null;
  grant_date: string;
  created_at: string;
  plan: { id: string; name: string; plan_type: string; is_locked: boolean } | null;
  beneficiary: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
};

type PlanRow = {
  id: string;
  name: string;
  plan_type: string;
  status: string;
  is_locked: boolean;
  pool_size: number | string;
  pool_allocated: number | string;
};

type AuditRow = {
  id: string;
  event_type: string;
  resource_id: string | null;
  metadata: unknown;
  occurred_at: string;
  user_email: string | null;
};

export function Sandbox({
  awards,
  plans,
  audits,
}: {
  awards: AwardRow[];
  plans: PlanRow[];
  audits: AuditRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [log, setLog] = useState<string[]>([]);

  function pushLog(msg: string) {
    setLog((prev) => [`[${new Date().toLocaleTimeString('fr-FR')}] ${msg}`, ...prev].slice(0, 30));
  }

  // -------------------------------------------------------------------------
  // Form create DRAFT
  // -------------------------------------------------------------------------
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  const [units, setUnits] = useState(100);
  const [grantDate, setGrantDate] = useState(new Date().toISOString().slice(0, 10));
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');

  function handleCreate() {
    if (!planId || !email || !fullName || units <= 0) {
      pushLog('Form incomplet');
      return;
    }
    startTransition(async () => {
      const benRes = await devUpsertBeneficiary({ email, fullName });
      if (!benRes.ok) {
        pushLog(`devUpsertBeneficiary KO : ${benRes.error}`);
        return;
      }
      const res = await createAwardDraft({
        planId,
        beneficiaryId: benRes.id,
        unitsGranted: units,
        grantDate,
        initialStatus: 'DRAFT',
      });
      if (res.ok) {
        pushLog(`createAwardDraft OK : ${res.awardNumber} (${res.id.slice(0, 8)})`);
        router.refresh();
      } else {
        pushLog(`createAwardDraft KO : ${res.error}`);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Transitions / cancel / forfeit
  // -------------------------------------------------------------------------
  function handleTransition(awardId: string, toStatus: AwardStatus) {
    startTransition(async () => {
      const res = await transitionAward({ awardId, toStatus });
      if (res.ok) {
        pushLog(`transitionAward → ${toStatus} OK (${awardId.slice(0, 8)})`);
        router.refresh();
      } else {
        pushLog(`transitionAward → ${toStatus} KO : ${res.error}`);
      }
    });
  }

  function handleCancel(awardId: string) {
    const reason = window.prompt('Raison du cancel ?', 'Test sandbox cancel');
    if (!reason) return;
    startTransition(async () => {
      const res = await cancelAward({ awardId, reason });
      if (res.ok) {
        pushLog(`cancelAward OK (${awardId.slice(0, 8)})`);
        router.refresh();
      } else {
        pushLog(`cancelAward KO : ${res.error}`);
      }
    });
  }

  function handleForfeit(awardId: string) {
    const leaverType = window.prompt(
      'Leaver type ? (resignation / termination_cause / death / etc.)',
      'resignation',
    );
    if (!leaverType) return;
    const eventDate = window.prompt(
      'Event date YYYY-MM-DD ?',
      new Date().toISOString().slice(0, 10),
    );
    if (!eventDate) return;
    startTransition(async () => {
      const res = await forfeitAward({
        awardId,
        leaverType: leaverType as never,
        eventDate,
        reason: 'Test sandbox forfeit',
      });
      if (res.ok) {
        pushLog(`forfeitAward OK (${awardId.slice(0, 8)})`);
        router.refresh();
      } else {
        pushLog(`forfeitAward KO : ${res.error}`);
      }
    });
  }

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Award State Machine — Sandbox</h1>
        <p className="text-sm text-gray-500">
          Module 3b B2 — test toutes les transitions sans passer par /dashboard/awards.
          {pending ? ' [pending…]' : ''}
        </p>
      </header>

      {/* Form create DRAFT */}
      <section className="space-y-3 rounded border p-4">
        <h2 className="font-medium">Créer un award DRAFT pour test</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col text-xs">
            Plan
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="rounded border px-2 py-1"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.plan_type}) — pool {Number(p.pool_size) - Number(p.pool_allocated)}/
                  {p.pool_size}
                  {p.is_locked ? ' 🔒' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs">
            Units
            <input
              type="number"
              value={units}
              onChange={(e) => setUnits(Number(e.target.value))}
              min={1}
              className="rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-xs">
            Grant date
            <input
              type="date"
              value={grantDate}
              onChange={(e) => setGrantDate(e.target.value)}
              className="rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-xs">
            Email beneficiary
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alice@example.com"
              className="rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-xs">
            Nom complet
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Alice Dupont"
              className="rounded border px-2 py-1"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={pending}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Créer DRAFT
        </button>
      </section>

      {/* Awards table */}
      <section className="space-y-3 rounded border p-4">
        <h2 className="font-medium">Awards récents ({awards.length})</h2>
        {awards.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun award. Créez-en un ci-dessus.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b text-left">
                <tr>
                  <th className="px-2 py-1">#</th>
                  <th className="px-2 py-1">Plan</th>
                  <th className="px-2 py-1">Bénéficiaire</th>
                  <th className="px-2 py-1 text-right">Units</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {awards.map((a) => {
                  const status = a.status as AwardStatus;
                  const allowed = getAllowedTransitions(status);
                  return (
                    <tr key={a.id}>
                      <td className="px-2 py-1 font-mono">{a.award_number ?? a.id.slice(0, 8)}</td>
                      <td className="px-2 py-1">
                        {a.plan?.name ?? '—'}
                        {a.plan?.is_locked ? ' 🔒' : ''}
                      </td>
                      <td className="px-2 py-1">
                        {a.beneficiary
                          ? `${a.beneficiary.first_name ?? ''} ${a.beneficiary.last_name ?? ''}`.trim() ||
                            a.beneficiary.email
                          : '—'}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {a.units_granted}
                        {a.units_vested != null && Number(a.units_vested) > 0
                          ? ` (${a.units_vested}v)`
                          : ''}
                      </td>
                      <td className="px-2 py-1 font-mono">{a.status}</td>
                      <td className="space-x-1 px-2 py-1">
                        {allowed.map((to) => (
                          <button
                            key={to}
                            type="button"
                            onClick={() => handleTransition(a.id, to)}
                            disabled={pending}
                            className="rounded bg-gray-200 px-2 py-0.5 hover:bg-gray-300 disabled:opacity-50"
                            title={`Transitionner ${status} → ${to}`}
                          >
                            → {to}
                          </button>
                        ))}
                        {isCancellable(status) ? (
                          <button
                            type="button"
                            onClick={() => handleCancel(a.id)}
                            disabled={pending}
                            className="rounded bg-red-100 px-2 py-0.5 text-red-700 hover:bg-red-200 disabled:opacity-50"
                          >
                            Cancel (reason)
                          </button>
                        ) : null}
                        {(['GRANTED', 'VESTING', 'PARTIALLY_VESTED'] as AwardStatus[]).includes(
                          status,
                        ) ? (
                          <button
                            type="button"
                            onClick={() => handleForfeit(a.id)}
                            disabled={pending}
                            className="rounded bg-orange-100 px-2 py-0.5 text-orange-700 hover:bg-orange-200 disabled:opacity-50"
                          >
                            Forfeit (leaver)
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Live log */}
      <section className="space-y-2 rounded border p-4">
        <h2 className="font-medium">Log session</h2>
        {log.length === 0 ? (
          <p className="text-xs text-gray-500">Aucune action encore.</p>
        ) : (
          <ul className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-xs">
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Audit events */}
      <section className="space-y-2 rounded border p-4">
        <h2 className="font-medium">Audit events award.* ({audits.length} derniers)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b text-left">
              <tr>
                <th className="px-2 py-1">When</th>
                <th className="px-2 py-1">Event</th>
                <th className="px-2 py-1">Resource</th>
                <th className="px-2 py-1">Actor</th>
                <th className="px-2 py-1">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {audits.map((e) => (
                <tr key={e.id}>
                  <td className="px-2 py-1 font-mono">
                    {new Date(e.occurred_at).toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })}
                  </td>
                  <td className="px-2 py-1 font-mono">{e.event_type}</td>
                  <td className="px-2 py-1 font-mono">{e.resource_id?.slice(0, 8) ?? '—'}</td>
                  <td className="px-2 py-1">{e.user_email ?? '—'}</td>
                  <td className="max-w-[400px] truncate px-2 py-1 font-mono text-[10px]">
                    {JSON.stringify(e.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
