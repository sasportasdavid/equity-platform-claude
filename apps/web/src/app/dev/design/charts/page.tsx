import {
  EditorialAreaChart,
  EditorialBarChart,
  EditorialLineChart,
  EditorialPieChart,
  EditorialWaterfall,
} from '@/components/charts';
import { Card, CardContent } from '@/components/ui/card';

export const metadata = { title: 'Dev — Editorial Charts' };

/**
 * Sandbox /dev/design/charts — Module Design System V1, Étape 11.
 *
 * 5 wrappers Recharts pré-stylés Editorial Finance V1. Tous partagent
 * Tooltip custom (paper-50 + shadow-md + bordure subtle), Legend
 * `text-overline text-ink-700`, grille pointillée paper-300, animation
 * 600ms ease-out au mount, et 5 séries via tokens `--chart-1..5`.
 *
 * Layout : stack vertical pour montrer chaque chart en pleine largeur
 * — plus lisible qu'une grille 2x3 où les cas conteneurs étroits
 * masquent les détails du tooltip et de la grille.
 */

// ============================================================================
// 1) AreaChart — courbe valorisation IFRS 2 cumulée sur 12 mois
// ============================================================================
const valuationSeries = [
  { month: 'Mai 2025', valuation: 8.45, ifrs2: 1240 },
  { month: 'Juin', valuation: 9.12, ifrs2: 1380 },
  { month: 'Juil', valuation: 9.78, ifrs2: 1530 },
  { month: 'Août', valuation: 10.23, ifrs2: 1670 },
  { month: 'Sept', valuation: 10.55, ifrs2: 1820 },
  { month: 'Oct', valuation: 10.67, ifrs2: 1980 },
  { month: 'Nov', valuation: 11.12, ifrs2: 2150 },
  { month: 'Déc', valuation: 11.48, ifrs2: 2330 },
  { month: 'Jan 2026', valuation: 11.92, ifrs2: 2510 },
  { month: 'Fév', valuation: 12.18, ifrs2: 2700 },
  { month: 'Mar', valuation: 12.65, ifrs2: 2890 },
  { month: 'Avr', valuation: 13.02, ifrs2: 3080 },
];

// ============================================================================
// 2) LineChart — vesting cumul Programmé vs Acquis sur 4 ans
// ============================================================================
const vestingSeries = [
  { date: 'Sept 2024', programmé: 250, acquis: 250 },
  { date: 'Sept 2025', programmé: 500, acquis: 500 },
  { date: 'Sept 2026', programmé: 750, acquis: 0 },
  { date: 'Sept 2027', programmé: 1000, acquis: 0 },
];

// ============================================================================
// 3) PieChart (donut) — répartition cap table
// ============================================================================
const capTable = [
  { name: 'Founders', value: 65 },
  { name: 'ESOP (BSPCE/AGA)', value: 12 },
  { name: 'Investors Series A', value: 18 },
  { name: 'Trésorerie', value: 5 },
];

// ============================================================================
// 4) BarChart — comparaison par type de plan : Attribués vs Acquis
// ============================================================================
const planTypes = [
  { type: 'BSPCE', granted: 4200, vested: 1850 },
  { type: 'AGA', granted: 2400, vested: 600 },
  { type: 'STOCK_OPTION', granted: 8000, vested: 5200 },
  { type: 'PHANTOM', granted: 1200, vested: 400 },
];

// ============================================================================
// 5) Waterfall — cascade cap table (préparé Module 10, non branché V1)
// ============================================================================
const capTableEvolution = [
  { label: 'Cap initial', value: 1000, type: 'total' as const },
  { label: '+ Round A', value: 300, type: 'positive' as const },
  { label: '- Pool ESOP', value: -150, type: 'negative' as const },
  { label: '+ Round B', value: 500, type: 'positive' as const },
  { label: '- Buyback', value: -80, type: 'negative' as const },
  { label: 'Cap final', value: 1570, type: 'total' as const },
];

export default function ChartsSandboxPage() {
  return (
    <div className="bg-background mx-auto min-h-screen max-w-6xl space-y-12 p-8">
      <header className="space-y-2">
        <p className="text-overline text-brass-500">DESIGN SYSTEM V1 · SANDBOX</p>
        <h1 className="text-h1 text-ink-900">
          5 charts <span className="serif-italic text-brass-500">éditoriaux</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 text-sm">
          Wrappers Recharts pré-stylés — tooltip paper-50 + shadow-md, légende{' '}
          <code className="bg-paper-200 rounded px-1 font-mono text-xs">
            text-overline text-ink-700
          </code>
          , grille pointillée paper-300, animation 600ms ease-out, séries via tokens{' '}
          <code className="bg-paper-200 rounded px-1 font-mono text-xs">--chart-1..5</code>.
        </p>
      </header>

      {/* 1 — AreaChart */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          1 · <span className="serif-italic text-brass-500">AreaChart</span> — valorisation IFRS 2
        </h2>
        <p className="text-ink-500 text-sm">
          Courbe gradient brass-500 → transparent. Tooltip avec label mois en serif italic
          (`italicTooltipLabel`), 2 séries sur le même Y (€/unité + charge IFRS 2 €).
        </p>
        <Card>
          <CardContent className="p-6">
            <EditorialAreaChart
              data={valuationSeries}
              xKey="month"
              series={[
                { key: 'valuation', label: 'Fair Value (€/unité)', colorIndex: 0, unit: ' €' },
              ]}
              height={260}
              italicTooltipLabel
              showLegend
            />
          </CardContent>
        </Card>
      </section>

      {/* 2 — LineChart */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          2 · <span className="serif-italic text-brass-500">LineChart</span> — vesting cumul
        </h2>
        <p className="text-ink-500 text-sm">
          2 séries : « Programmé » en pointillés brass-500 (projection), « Acquis » en bond-500
          plein (réalisé).
        </p>
        <Card>
          <CardContent className="p-6">
            <EditorialLineChart
              data={vestingSeries}
              xKey="date"
              series={[
                { key: 'programmé', label: 'Programmé', colorIndex: 0, dashed: true, unit: ' u.' },
                { key: 'acquis', label: 'Acquis', colorIndex: 1, unit: ' u.' },
              ]}
              height={260}
              showLegend
              showDots
            />
          </CardContent>
        </Card>
      </section>

      {/* 3 — PieChart (donut) */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          3 · <span className="serif-italic text-brass-500">PieChart</span> — donut cap table
        </h2>
        <p className="text-ink-500 text-sm">
          Donut avec label central{' '}
          <code className="bg-paper-200 rounded px-1 font-mono">100 %</code> (total). 4 séries
          auto-coloriées via tokens chart-1..4.
        </p>
        <Card>
          <CardContent className="p-6">
            <EditorialPieChart
              data={capTable}
              height={320}
              centerLabel={{ primary: '100 %', secondary: 'CAP TABLE' }}
              unit="%"
              showLegend
            />
          </CardContent>
        </Card>
      </section>

      {/* 4 — BarChart */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          4 · <span className="serif-italic text-brass-500">BarChart</span> — comparaison par type
          de plan
        </h2>
        <p className="text-ink-500 text-sm">
          2 séries side-by-side sur 4 catégories (BSPCE / AGA / STOCK_OPTION / PHANTOM). Hover
          révèle un fond brass-100 subtle sur la catégorie pointée.
        </p>
        <Card>
          <CardContent className="p-6">
            <EditorialBarChart
              data={planTypes}
              xKey="type"
              series={[
                { key: 'granted', label: 'Attribués', colorIndex: 0, unit: ' u.' },
                { key: 'vested', label: 'Acquis', colorIndex: 1, unit: ' u.' },
              ]}
              height={260}
              showLegend
            />
          </CardContent>
        </Card>
      </section>

      {/* 5 — Waterfall */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          5 · <span className="serif-italic text-brass-500">Waterfall</span> — cascade cap table
          <span className="text-overline text-ink-400 ml-3">PRÉPARÉ MODULE 10</span>
        </h2>
        <p className="text-ink-500 text-sm">
          Cascade 6 points : 2 totaux ink-700 (encadrants) + 3 deltas positifs bond-500 + 2 deltas
          négatifs title-500. Labels valeur tabular en haut de chaque barre. Composant{' '}
          <strong>non branché V1</strong> — sera consommé par le futur dashboard cap table dynamique
          (Module 10).
        </p>
        <Card>
          <CardContent className="p-6">
            <EditorialWaterfall data={capTableEvolution} unit="K€" height={300} />
          </CardContent>
        </Card>
      </section>

      <footer className="text-ink-400 border-paper-300 mt-16 border-t pt-6 font-mono text-xs">
        <p>
          Editorial Charts · Editorial Finance V1 · spec 5.9 · sandbox{' '}
          <code className="bg-paper-200 rounded px-1">/dev/design/charts</code>
        </p>
        <p className="text-ink-500 mt-2">
          ⚠ <strong>Aucun hex en dur</strong> : toutes les couleurs des séries passent par les
          tokens CSS <code className="bg-paper-200 rounded px-1 font-mono">--chart-1..5</code> (qui
          résolvent vers brass / bond / saffron / ink-700 / slate). Le composant{' '}
          <code className="bg-paper-200 rounded px-1 font-mono">EditorialWaterfall</code> est
          préparé pour Module 10 mais non câblé en V1 — il vit dans cette sandbox uniquement.
        </p>
      </footer>
    </div>
  );
}
