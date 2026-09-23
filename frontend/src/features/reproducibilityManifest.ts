import type { ComparisonCandidate, ComparisonKind } from './comparisonWorkspace';

export const REPRODUCIBILITY_SCHEMA = 'finquant_reproducibility_manifest';
export const REPRODUCIBILITY_SCHEMA_VERSION = 1;

type ManifestValue = string | number | null;

export type ReproducibilityEntry = {
  record_id: string;
  record_type: ComparisonKind;
  title: string;
  object: string;
  record_as_of: string;
  source_page: string;
  methodology: string;
  period: string;
  parameters: string;
  costs: string;
  benchmark: string;
  provenance: {
    provider: string;
    quality: string;
  };
  metrics: Record<string, ManifestValue>;
  evidence_summary: string;
  missing_fields: string[];
  excluded_data: string[];
};

export type ReproducibilityManifest = {
  schema: typeof REPRODUCIBILITY_SCHEMA;
  schema_version: typeof REPRODUCIBILITY_SCHEMA_VERSION;
  generated_at: string;
  entry_count: number;
  scope: string;
  entries: ReproducibilityEntry[];
};

const methodologies: Record<ComparisonKind, string> = {
  research: 'saved_research_workspace_snapshot',
  strategy: 'ma_crossover_backtest_saved_run',
  portfolio: 'local_derived_portfolio_risk_review_summary',
};

function missingFor(candidate: ComparisonCandidate): string[] {
  if (candidate.kind === 'strategy') return candidate.missingFields ?? [];
  if (candidate.kind === 'research') return ['period', 'parameters', 'methodology_version'];
  return ['period', 'parameters', 'costs', 'benchmark', 'provenance.provider', 'methodology_version'];
}

function entry(candidate: ComparisonCandidate): ReproducibilityEntry {
  return {
    record_id: candidate.id,
    record_type: candidate.kind,
    title: candidate.title,
    object: candidate.object,
    record_as_of: candidate.asOf,
    source_page: candidate.href,
    methodology: methodologies[candidate.kind],
    period: candidate.contract?.period ?? 'UNKNOWN',
    parameters: candidate.contract?.parameters ?? 'UNKNOWN',
    costs: candidate.contract?.costs ?? (candidate.kind === 'research' ? 'NOT_APPLICABLE' : 'UNKNOWN'),
    benchmark: candidate.contract?.benchmark ?? (candidate.kind === 'research' ? 'NOT_APPLICABLE' : 'UNKNOWN'),
    provenance: { provider: candidate.source, quality: candidate.quality },
    metrics: candidate.metrics ? {
      total_return: candidate.metrics.totalReturn,
      excess_return: candidate.metrics.excessReturn,
      max_drawdown: candidate.metrics.maxDrawdown,
      annualized_volatility: candidate.metrics.annualizedVolatility ?? 'UNKNOWN',
      trade_count: candidate.metrics.tradeCount,
    } : { status: 'UNKNOWN' },
    evidence_summary: candidate.evidence,
    missing_fields: missingFor(candidate),
    excluded_data: ['credentials', 'raw_market_curves', 'raw_observation_input', 'trade_or_order_actions'],
  };
}

export function buildReproducibilityManifest(
  candidates: ComparisonCandidate[],
  generatedAt = new Date().toISOString(),
): ReproducibilityManifest {
  return {
    schema: REPRODUCIBILITY_SCHEMA,
    schema_version: REPRODUCIBILITY_SCHEMA_VERSION,
    generated_at: generatedAt,
    entry_count: candidates.length,
    scope: 'Only explicitly selected saved or locally derived records; UNKNOWN is never inferred.',
    entries: candidates.map(entry),
  };
}

export function serializeReproducibilityManifest(manifest: ReproducibilityManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function downloadReproducibilityManifest(manifest: ReproducibilityManifest): string {
  const filename = `finquant-reproducibility-${manifest.generated_at.slice(0, 10)}.json`;
  const blob = new Blob([serializeReproducibilityManifest(manifest)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return filename;
}
