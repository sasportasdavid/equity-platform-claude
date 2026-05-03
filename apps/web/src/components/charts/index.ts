/**
 * Editorial Finance chart family — Étape 11 Design System V1.
 *
 * 5 wrappers Recharts pré-stylés cohérents :
 * - EditorialAreaChart    (sparklines, valorisation IFRS 2 cumulée)
 * - EditorialLineChart    (vesting chart, tendances)
 * - EditorialPieChart     (donut répartition cap table)
 * - EditorialBarChart     (comparaisons par catégorie)
 * - EditorialWaterfall    (cascade — préparé Module 10, non branché V1)
 *
 * Tous partagent : Tooltip + Legend + grid props depuis `./shared`.
 */

export { EditorialAreaChart } from './editorial-area-chart';
export type { EditorialAreaChartProps, EditorialAreaSeries } from './editorial-area-chart';

export { EditorialLineChart } from './editorial-line-chart';
export type { EditorialLineChartProps, EditorialLineSeries } from './editorial-line-chart';

export { EditorialPieChart } from './editorial-pie-chart';
export type { EditorialPieChartProps, EditorialPieDatum } from './editorial-pie-chart';

export { EditorialBarChart } from './editorial-bar-chart';
export type { EditorialBarChartProps, EditorialBarSeries } from './editorial-bar-chart';

export { EditorialWaterfall } from './editorial-waterfall';
export type { EditorialWaterfallDatum, EditorialWaterfallProps } from './editorial-waterfall';

export { EDITORIAL_COLORS, EditorialTooltip, EditorialLegend, formatTabular } from './shared';
export type {
  EditorialTooltipProps,
  EditorialLegendProps,
  EditorialTooltipPayloadItem,
  EditorialLegendPayloadItem,
} from './shared';
