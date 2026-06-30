/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiLink,
  EuiListGroup,
  EuiListGroupItem,
  EuiLoadingSpinner,
  EuiPageTemplate,
  EuiPanel,
  EuiPopover,
  EuiRadioGroup,
  EuiSelectable,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import type { EuiBasicTableColumn, EuiRadioGroupOption } from '@elastic/eui';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import { useKibana } from '../../../../common/lib/kibana';
import { CorrelationReport, DiamondSvg } from '../components/correlation_report';
import { useCorrelationRuns } from '../hooks/use_correlation_findings';
import type { StartRunInput } from '../hooks/use_correlation_findings';
import type {
  CorrelationDepth,
  CorrelationRun,
  ExtractDepthResult,
  FullDepthResult,
  KnnDepthResult,
  TriageDepthResult,
} from '../../../../../common/threat_intelligence/correlation_runs';
import {
  KNN_STRONG_FLOOR,
  KNN_MID_FLOOR,
  KNN_BASE_FLOOR,
  SEARCH_REPORTS_API_PATH,
} from '../../../../../common/threat_intelligence/hub';
import type {
  CorrelationFindingsLead,
  CostTrace,
} from '../../../../../common/threat_intelligence/correlation';
import { i18nText } from '../components/translations';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Matches long single-token IDs like T_glmZ4BBTbfD_VQrqq7 (base64url-ish, ≥16 chars)
const REPORT_ID_RE = /^[A-Za-z0-9_-]{16,}$/;
const SHORT_PHRASE_MAX_WORDS = 12;
const SHORT_PHRASE_MAX_CHARS = 120;

type InputIntent = 'report_id' | 'raw_text' | 'pointer';

const classifyInput = (text: string): InputIntent => {
  const t = text.trim();
  if (REPORT_ID_RE.test(t)) return 'report_id';
  const wordCount = t.split(/\s+/).length;
  if (wordCount <= SHORT_PHRASE_MAX_WORDS && t.length <= SHORT_PHRASE_MAX_CHARS) return 'pointer';
  return 'raw_text';
};

interface SearchReportHit {
  report_id: string;
  title: string;
  source?: string;
}

const extractHit = (raw: Record<string, unknown> & { report_id?: string }): SearchReportHit => {
  const reportId = raw.report_id ?? '';
  const contentTitle = (raw['content.title'] as string | undefined) ?? '';
  // content may arrive nested as { title: string } or flattened as content.title
  const nested = raw.content as Record<string, unknown> | undefined;
  const title = contentTitle || (nested?.title as string | undefined) || reportId;
  const src = raw.source as Record<string, unknown> | undefined;
  const sourceLabel = (src?.name as string | undefined) ?? (src?.type as string | undefined) ?? '';
  return { report_id: reportId, title, source: sourceLabel || undefined };
};

interface DepthOption {
  readonly depth: CorrelationDepth;
  readonly label: string;
  readonly hint: string;
}

const DEPTH_OPTIONS: readonly DepthOption[] = [
  {
    depth: 'full',
    label: i18nText.depthFullLabel(),
    hint: i18nText.depthFullHint(),
  },
  {
    depth: 'triage',
    label: i18nText.depthTriageLabel(),
    hint: i18nText.depthTriageHint(),
  },
  {
    depth: 'knn',
    label: i18nText.depthKnnLabel(),
    hint: i18nText.depthKnnHint(),
  },
  {
    depth: 'extract',
    label: i18nText.depthExtractLabel(),
    hint: i18nText.depthExtractHint(),
  },
];

const STAGE_LABEL_MAP: Readonly<Record<string, () => string>> = {
  extract: i18nText.stageExtract,
  search: i18nText.stageSearch,
  gap_fill: i18nText.stageGapFill,
  dedup: i18nText.stageDedup,
  triage: i18nText.stageTriage,
  synthesize: i18nText.stageSynthesize,
};

const getStageLabel = (stage: string | undefined): string =>
  stage !== undefined && stage in STAGE_LABEL_MAP
    ? STAGE_LABEL_MAP[stage]()
    : i18nText.stagePending();

const STATUS_BADGE_COLOR: Readonly<Record<string, string>> = {
  pending: 'default',
  running: 'primary',
  succeeded: 'success',
  failed: 'danger',
};

const STATUS_LABEL_FNS: Readonly<Record<string, () => string>> = {
  pending: i18nText.statusPending,
  running: i18nText.statusRunning,
  succeeded: i18nText.statusSucceeded,
  failed: i18nText.statusFailed,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type VertexKey = 'adversary' | 'capability' | 'infrastructure' | 'victim';
const VERTEX_KEYS: readonly VertexKey[] = ['adversary', 'capability', 'infrastructure', 'victim'];

const VERTEX_LABEL_FNS: Readonly<Record<VertexKey, () => string>> = {
  adversary: i18nText.vertexAdversary,
  capability: i18nText.vertexCapability,
  infrastructure: i18nText.vertexInfrastructure,
  victim: i18nText.vertexVictim,
};

const normalizeSignal = (s: string): 'high' | 'partial' | 'none' => {
  const lower = s.toLowerCase();
  return lower === 'high' || lower === 'partial' ? lower : 'none';
};

const toVertexSignal = (
  diamond: ExtractDepthResult['diamond']
): CorrelationFindingsLead['vertex_signal'] => ({
  adversary: normalizeSignal(diamond.adversary.signal),
  capability: normalizeSignal(diamond.capability.signal),
  infrastructure: normalizeSignal(diamond.infrastructure.signal),
  victim: normalizeSignal(diamond.victim.signal),
});

// ---------------------------------------------------------------------------
// ColMustardPawnIcon — brand mark; decorative (aria-hidden)
// Inline SVG: sphere head atop a flared rounded base, fixed mustard yellow
// so it reads as a brand colour in both light and dark themes.
// ---------------------------------------------------------------------------

const ColMustardPawnIcon: FC = () => (
  <svg
    width="26"
    height="29"
    viewBox="0 0 24 27"
    aria-hidden="true"
    focusable="false"
    style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '8px' }}
  >
    <circle cx="12" cy="5.2" r="3.9" fill="#D8A200" />
    <path
      d="M10.6 8.8 C10.4 11 10.1 12.6 9.6 14.4 C9 16.6 8 18.2 6.4 19.6 C5.4 20.4 4.4 20.9 4.4 21.8 C4.4 23.4 5.6 24 8 24 L16 24 C18.4 24 19.6 23.4 19.6 21.8 C19.6 20.9 18.6 20.4 17.6 19.6 C16 18.2 15 16.6 14.4 14.4 C13.9 12.6 13.6 11 13.4 8.8 Z"
      fill="#D8A200"
    />
    <ellipse cx="12" cy="24" rx="8" ry="1.5" fill="#B5870A" />
  </svg>
);

// ---------------------------------------------------------------------------
// ExtractResultView
// ---------------------------------------------------------------------------

const ExtractResultView: FC<{ result: ExtractDepthResult }> = ({ result }) => {
  const { euiTheme } = useEuiTheme();
  const vertexSignal = useMemo(() => toVertexSignal(result.diamond), [result.diamond]);

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="correlationExtractResult">
      <EuiTitle size="s">
        <h2>{i18nText.extractResultTitle()}</h2>
      </EuiTitle>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="l" alignItems="flexStart" wrap>
        <EuiFlexItem grow={false}>
          <DiamondSvg vertexSignal={vertexSignal} euiColors={euiTheme.colors} size={160} />
        </EuiFlexItem>
        <EuiFlexItem>
          {VERTEX_KEYS.map((v) => (
            <div key={v}>
              <EuiText size="s">
                <strong>{VERTEX_LABEL_FNS[v]()}</strong>
                {' — '}
                <span>{result.diamond[v].signal}</span>
              </EuiText>
              {result.diamond[v].summary ? (
                <EuiText size="xs" color="subdued">
                  {result.diamond[v].summary}
                </EuiText>
              ) : null}
              <EuiSpacer size="s" />
            </div>
          ))}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

// ---------------------------------------------------------------------------
// VertexScoresBadges — shared between KnnResultView and TriageResultView
// ---------------------------------------------------------------------------

interface AnchorMatchBreakdownDisplay {
  ioc_hash_hits?: string[];
  ioc_set_hash_match?: boolean;
  actor_hits?: string[];
}

type RetrievalSourceDisplay = 'anchor' | 'diamond' | 'gap_fill' | undefined;

const knnScoreBadgeColor = (score: number): string => {
  if (score >= KNN_STRONG_FLOOR) return 'success';
  if (score >= KNN_MID_FLOOR) return 'warning';
  if (score >= KNN_BASE_FLOOR) return 'default';
  return 'subdued';
};

const VertexScoresBadges: FC<{
  vertexScores: Record<string, number> | undefined;
  matchBreakdown?: Record<string, unknown>;
  retrievalSource?: RetrievalSourceDisplay;
}> = ({ vertexScores, matchBreakdown, retrievalSource }) => {
  const entries = Object.entries(vertexScores ?? {});
  if (entries.length === 0) {
    if (retrievalSource === 'gap_fill') {
      return (
        <EuiText size="xs" color="subdued">
          {i18nText.knnKeywordMatch()}
        </EuiText>
      );
    }

    const bd = matchBreakdown as AnchorMatchBreakdownDisplay | undefined;
    const hashHits = bd?.ioc_hash_hits ?? [];
    const actorHits = bd?.actor_hits ?? [];
    const iocSetMatch = bd?.ioc_set_hash_match ?? false;
    const hasAnchorSignals = hashHits.length > 0 || actorHits.length > 0 || iocSetMatch;
    return (
      <div>
        <EuiText size="xs" color="subdued">
          {i18nText.knnAnchorOnly()}
        </EuiText>
        {hasAnchorSignals ? (
          <>
            {hashHits.map((h) => (
              <EuiText key={h} size="xs" color="subdued">
                {`${i18nText.anchorSignalHash()}: ${h}`}
              </EuiText>
            ))}
            {actorHits.map((a) => (
              <EuiText key={a} size="xs" color="subdued">
                {`${i18nText.anchorSignalActor()}: ${a}`}
              </EuiText>
            ))}
            {iocSetMatch ? (
              <EuiText size="xs" color="subdued">
                {i18nText.anchorSignalIdenticalIocSet()}
              </EuiText>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }
  return (
    <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
      {entries.map(([k, v]) => (
        <EuiFlexItem key={k} grow={false}>
          <EuiBadge color={knnScoreBadgeColor(v)}>
            {`${k.slice(0, 3).toUpperCase()}: ${v.toFixed(2)}`}
          </EuiBadge>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};

// ---------------------------------------------------------------------------
// KnnResultView
// ---------------------------------------------------------------------------

type MergedCandidate = KnnDepthResult['merged'][number];
type AnchorHit = KnnDepthResult['anchor_hits'][number];

const KnnResultView: FC<{ result: KnnDepthResult }> = ({ result }) => {
  const { candidate_meta } = result;

  const mergedColumns: Array<EuiBasicTableColumn<MergedCandidate>> = useMemo(
    (): Array<EuiBasicTableColumn<MergedCandidate>> => [
      {
        name: i18nText.knnColTitle(),
        render: (item: MergedCandidate) => {
          const meta = candidate_meta?.[item.report_id];
          const title = meta?.title ?? item.title;
          return (
            <div>
              {meta?.url ? (
                <EuiLink href={meta.url} target="_blank" external>
                  {title}
                </EuiLink>
              ) : (
                <span>{title}</span>
              )}
              {meta?.vendor ? (
                <EuiText size="xs" color="subdued">
                  {meta.vendor}
                </EuiText>
              ) : null}
            </div>
          );
        },
      },
      {
        field: 'overlap',
        name: i18nText.knnColOverlap(),
        width: '80px',
        render: (value: MergedCandidate['overlap']) => (value ?? 0).toFixed(2),
      },
      {
        field: 'score',
        name: i18nText.knnColScore(),
        width: '80px',
        render: (value: MergedCandidate['score']) => (value ?? 0).toFixed(3),
      },
      {
        name: i18nText.knnColVertexScores(),
        render: (item: MergedCandidate) => (
          <VertexScoresBadges
            vertexScores={item.vertex_scores}
            matchBreakdown={item.match_breakdown}
          />
        ),
      },
    ],
    [candidate_meta]
  );

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="correlationKnnResult">
      <EuiTitle size="s">
        <h2>{i18nText.knnResultTitle()}</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      <EuiTitle size="xs">
        <h3>{i18nText.knnMergedTitle()}</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      {result.merged.length === 0 ? (
        <EuiText size="s" color="subdued">
          {i18nText.knnNoMerged()}
        </EuiText>
      ) : (
        <EuiBasicTable<MergedCandidate>
          items={result.merged}
          columns={mergedColumns}
          rowProps={(item: MergedCandidate) => ({
            'data-test-subj': `knnMergedRow-${item.report_id}`,
          })}
        />
      )}

      {result.anchor_hits.length > 0 ? (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xs">
            <h3>{i18nText.knnAnchorHitsTitle()}</h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          {result.anchor_hits.map((hit: AnchorHit) => {
            const meta = candidate_meta?.[hit.report_id];
            const title = meta?.title ?? hit.title;
            return (
              <div key={hit.report_id}>
                {meta?.url ? (
                  <EuiLink href={meta.url} target="_blank" external>
                    <EuiText size="s" component="span">
                      {title}
                    </EuiText>
                  </EuiLink>
                ) : (
                  <EuiText size="s">{title}</EuiText>
                )}
                {meta?.vendor ? (
                  <EuiText size="xs" color="subdued">
                    {meta.vendor}
                  </EuiText>
                ) : null}
              </div>
            );
          })}
        </>
      ) : null}
    </EuiPanel>
  );
};

// ---------------------------------------------------------------------------
// TriageResultView
// ---------------------------------------------------------------------------

type TriagePick = TriageDepthResult['picks'][number];
type TriagedOut = NonNullable<TriageDepthResult['triaged_out']>[number];

const TriageResultView: FC<{ result: TriageDepthResult }> = ({ result }) => {
  const { candidate_meta } = result;

  const renderCandidateCell = (candidateId: string): React.ReactNode => {
    const meta = candidate_meta?.[candidateId];
    const title = meta?.title ?? candidateId;
    return (
      <div>
        {meta?.url ? (
          <EuiLink href={meta.url} target="_blank" external>
            {title}
          </EuiLink>
        ) : (
          <span>{title}</span>
        )}
        {meta?.vendor ? (
          <EuiText size="xs" color="subdued">
            {meta.vendor}
          </EuiText>
        ) : null}
      </div>
    );
  };

  const picksColumns: Array<EuiBasicTableColumn<TriagePick>> = useMemo(
    (): Array<EuiBasicTableColumn<TriagePick>> => [
      {
        name: i18nText.triageColCandidate(),
        render: (item: TriagePick) => renderCandidateCell(item.candidate_id),
      },
      {
        field: 'confidence',
        name: i18nText.triageColConfidence(),
        width: '80px',
        render: (value: TriagePick['confidence']) => value.toFixed(2),
      },
      {
        name: i18nText.knnColVertexScores(),
        render: (item: TriagePick) => (
          <VertexScoresBadges
            vertexScores={item.vertex_scores}
            matchBreakdown={item.match_breakdown}
            retrievalSource={item.retrieval_source as RetrievalSourceDisplay}
          />
        ),
      },
      {
        field: 'justification',
        name: i18nText.triageColJustification(),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidate_meta]
  );

  const triagedOutColumns: Array<EuiBasicTableColumn<TriagedOut>> = useMemo(
    (): Array<EuiBasicTableColumn<TriagedOut>> => [
      {
        name: i18nText.triageColCandidate(),
        render: (item: TriagedOut) => renderCandidateCell(item.candidate_id),
      },
      {
        field: 'confidence',
        name: i18nText.triageColConfidenceOut(),
        width: '90px',
        render: (value: number | undefined) => (value !== undefined ? value.toFixed(2) : '—'),
      },
      {
        name: i18nText.knnColVertexScores(),
        render: (item: TriagedOut) => (
          <VertexScoresBadges
            vertexScores={item.vertex_scores}
            matchBreakdown={item.match_breakdown}
            retrievalSource={item.retrieval_source as RetrievalSourceDisplay}
          />
        ),
      },
      {
        field: 'justification',
        name: i18nText.triageColJustificationOut(),
        render: (value: string | undefined) => value ?? '—',
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidate_meta]
  );

  const triagedOut = result.triaged_out ?? [];

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="correlationTriageResult">
      <EuiTitle size="s">
        <h2>{i18nText.triageResultTitle()}</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="l" wrap>
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <strong>
              {i18nText.triageCandidatesFed()}
              {': '}
            </strong>
            {result.candidates_fed}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <strong>
              {i18nText.triageFallbackUsed()}
              {': '}
            </strong>
            {result.fallback_used ? i18nText.triageYes() : i18nText.triageNo()}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiTitle size="xs">
        <h3>
          {i18nText.triagePicksTitle()}
          {` (${result.picks.length})`}
        </h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      {result.picks.length === 0 ? (
        <EuiText size="s" color="subdued">
          {i18nText.triageNoPicks()}
        </EuiText>
      ) : (
        <EuiBasicTable<TriagePick>
          items={result.picks}
          columns={picksColumns}
          rowProps={(item: TriagePick) => ({
            'data-test-subj': `triagePickRow-${item.candidate_id}`,
          })}
        />
      )}

      {triagedOut.length > 0 ? (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xs">
            <h3>
              {i18nText.triageTriagedOutTitle()}
              {` (${triagedOut.length})`}
            </h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiBasicTable<TriagedOut>
            items={triagedOut}
            columns={triagedOutColumns}
            rowProps={(item: TriagedOut) => ({
              'data-test-subj': `triageTriagedOutRow-${item.candidate_id}`,
            })}
          />
        </>
      ) : null}

      {result.groups.length > 0 ? (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xs">
            <h3>{i18nText.triageGroupsTitle()}</h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          {result.groups.map((group, idx) => (
            <EuiPanel key={idx} hasBorder paddingSize="s" data-test-subj={`triageGroup-${idx}`}>
              <EuiText size="s">
                <strong>
                  {i18nText.triageGroupHypothesis()}
                  {': '}
                </strong>
                {group.hypothesis}
              </EuiText>
              <EuiSpacer size="xs" />
              {group.candidates.map((c) => {
                const meta = candidate_meta?.[c.candidate_id];
                const title = meta?.title ?? c.candidate_id;
                return (
                  <EuiText key={c.candidate_id} size="xs" color="subdued">
                    {`${title} — ${c.confidence.toFixed(2)}`}
                  </EuiText>
                );
              })}
            </EuiPanel>
          ))}
        </>
      ) : null}
    </EuiPanel>
  );
};

// ---------------------------------------------------------------------------
// CostTracePanel — compact per-stage token + cost breakdown
// ---------------------------------------------------------------------------

const formatCost = (usd: number): string => {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
};

const CostTracePanel: FC<{ trace: CostTrace }> = ({ trace }) => {
  if (trace.total_cost_usd === 0 && trace.stages.length === 0) return null;

  const columns: Array<EuiBasicTableColumn<CostTrace['stages'][number]>> = [
    {
      field: 'stage',
      name: i18nText.costTraceStageCol(),
      truncateText: true,
    },
    {
      field: 'model_name',
      name: i18nText.costTraceModelCol(),
      truncateText: true,
      render: (v: string | undefined) => v ?? '—',
    },
    {
      name: i18nText.costTraceTokensCol(),
      render: (row: CostTrace['stages'][number]) =>
        `${row.input_tokens.toLocaleString()} / ${row.output_tokens.toLocaleString()}`,
    },
    {
      field: 'cost_usd',
      name: i18nText.costTraceCostCol(),
      width: '100px',
      render: (v: number) => formatCost(v),
    },
  ];

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="correlationCostTrace">
      <EuiFlexGroup
        gutterSize="s"
        alignItems="center"
        justifyContent="spaceBetween"
        responsive={false}
      >
        <EuiFlexItem grow={false}>
          <EuiTitle size="xxs">
            <h3>{i18nText.costTraceSectionTitle()}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {`${i18nText.costTraceTotal()}: ${trace.total_input_tokens.toLocaleString()} / ${trace.total_output_tokens.toLocaleString()} tokens · ${formatCost(
              trace.total_cost_usd
            )}`}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiBasicTable<CostTrace['stages'][number]>
        items={trace.stages}
        columns={columns}
        compressed
      />
    </EuiPanel>
  );
};

// ---------------------------------------------------------------------------
// ResultDispatch — routes to the correct result view by depth
// ---------------------------------------------------------------------------

const ResultDispatch: FC<{
  run: CorrelationRun;
  onTitleSave: (title: string) => Promise<void>;
}> = ({ run, onTitleSave }) => {
  const { result } = run;
  if (result === undefined) return null;

  const runTitle = run.title ?? run.input_summary ?? run.runId;

  if (result.depth === 'full') {
    const fullResult = result as FullDepthResult;
    const trace = fullResult.findings.trace;
    return (
      <>
        <CorrelationReport
          findings={fullResult.findings}
          candidateMeta={fullResult.findings.candidate_meta}
          title={runTitle}
          runId={run.runId}
          onTitleSave={onTitleSave}
        />
        {trace !== undefined ? (
          <>
            <EuiSpacer size="m" />
            <EuiAccordion
              id="cost-trace-full"
              buttonContent={i18nText.costTraceSectionTitle()}
              initialIsOpen={false}
            >
              <EuiSpacer size="s" />
              <CostTracePanel trace={trace} />
            </EuiAccordion>
          </>
        ) : null}
      </>
    );
  }

  const traceForDepth = (result as ExtractDepthResult | KnnDepthResult | TriageDepthResult).trace;

  if (result.depth === 'extract') {
    return (
      <>
        <ExtractResultView result={result as ExtractDepthResult} />
        {traceForDepth !== undefined ? (
          <>
            <EuiSpacer size="m" />
            <EuiAccordion
              id="cost-trace-extract"
              buttonContent={i18nText.costTraceSectionTitle()}
              initialIsOpen={false}
            >
              <EuiSpacer size="s" />
              <CostTracePanel trace={traceForDepth} />
            </EuiAccordion>
          </>
        ) : null}
      </>
    );
  }

  if (result.depth === 'knn') {
    return (
      <>
        <KnnResultView result={result as KnnDepthResult} />
        {traceForDepth !== undefined ? (
          <>
            <EuiSpacer size="m" />
            <EuiAccordion
              id="cost-trace-knn"
              buttonContent={i18nText.costTraceSectionTitle()}
              initialIsOpen={false}
            >
              <EuiSpacer size="s" />
              <CostTracePanel trace={traceForDepth} />
            </EuiAccordion>
          </>
        ) : null}
      </>
    );
  }

  if (result.depth === 'triage') {
    return (
      <>
        <TriageResultView result={result as TriageDepthResult} />
        {traceForDepth !== undefined ? (
          <>
            <EuiSpacer size="m" />
            <EuiAccordion
              id="cost-trace-triage"
              buttonContent={i18nText.costTraceSectionTitle()}
              initialIsOpen={false}
            >
              <EuiSpacer size="s" />
              <CostTracePanel trace={traceForDepth} />
            </EuiAccordion>
          </>
        ) : null}
      </>
    );
  }

  return null;
};

// ---------------------------------------------------------------------------
// RecentsPanel
// ---------------------------------------------------------------------------

const RecentsPanel: FC<{
  recents: readonly CorrelationRun[];
  loading: boolean;
  activeRunId: string | undefined;
  onLoadRun: (runId: string) => void;
}> = ({ recents, loading, activeRunId, onLoadRun }) => {
  const sorted = useMemo(
    () => [...recents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [recents]
  );

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="correlationReportRecents">
      <EuiTitle size="s">
        <h2>{i18nText.recentsTitle()}</h2>
      </EuiTitle>
      <EuiSpacer size="s" />
      {loading ? (
        <EuiLoadingSpinner size="s" />
      ) : sorted.length === 0 ? (
        <EuiText size="s" color="subdued">
          {i18nText.recentsEmpty()}
        </EuiText>
      ) : (
        <EuiListGroup bordered maxWidth={false}>
          {sorted.map((run) => (
            <EuiListGroupItem
              key={run.runId}
              isActive={run.runId === activeRunId}
              wrapText
              onClick={() => onLoadRun(run.runId)}
              data-test-subj={`correlationRecentRun-${run.runId}`}
              label={
                <EuiFlexGroup
                  gutterSize="s"
                  alignItems="center"
                  justifyContent="spaceBetween"
                  responsive={false}
                  wrap
                >
                  <EuiFlexItem>
                    <EuiText size="xs">
                      {run.title ?? run.input_summary ?? run.runId.slice(0, 16)}
                    </EuiText>
                    <EuiText size="xs" color="subdued">
                      {new Date(run.createdAt).toLocaleString()}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center">
                      <EuiFlexItem grow={false}>
                        <EuiBadge color="hollow">{run.depth}</EuiBadge>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiBadge color={STATUS_BADGE_COLOR[run.status] ?? 'default'}>
                          {STATUS_LABEL_FNS[run.status]?.() ?? run.status}
                        </EuiBadge>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                </EuiFlexGroup>
              }
            />
          ))}
        </EuiListGroup>
      )}
    </EuiPanel>
  );
};

// ---------------------------------------------------------------------------
// CorrelationReportPage
// ---------------------------------------------------------------------------

export const CorrelationReportPage: FC = () => {
  const skillEnabled = useIsExperimentalFeatureEnabled('threatIntelligenceSkillEnabled');
  const { http } = useKibana().services;

  const [inputText, setInputText] = useState('');
  const [depth, setDepth] = useState<CorrelationDepth>('full');
  const [depthPopoverOpen, setDepthPopoverOpen] = useState(false);

  // Disambiguation state
  const [disambigCandidates, setDisambigCandidates] = useState<SearchReportHit[] | null>(null);
  const [disambigLoading, setDisambigLoading] = useState(false);
  const [disambigError, setDisambigError] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  // The original phrase preserved for the "treat as raw text" escape hatch
  const disambigPhraseRef = useRef<string>('');

  const lastInputRef = useRef<StartRunInput | null>(null);

  const {
    activeRun,
    polling,
    error,
    recents,
    recentsLoading,
    startRun,
    loadRun,
    refreshRecents,
    updateRunTitle,
  } = useCorrelationRuns();

  const isInputValid = inputText.trim().length > 0;

  const depthRadioOptions: EuiRadioGroupOption[] = useMemo(
    () =>
      DEPTH_OPTIONS.map(({ depth: d, label, hint }) => ({
        id: d,
        label: (
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem>{label}</EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {hint}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
      })),
    []
  );

  const runWithInput = useCallback(
    (input: StartRunInput) => {
      lastInputRef.current = input;
      void startRun(input);
    },
    [startRun]
  );

  const handleRun = useCallback(() => {
    const text = inputText.trim();
    const intent = classifyInput(text);

    if (intent === 'report_id') {
      runWithInput({ input_type: 'report_id', report_id: text, depth });
      return;
    }

    if (intent === 'raw_text') {
      runWithInput({ input_type: 'raw_text', raw_text: text, depth });
      return;
    }

    // pointer — search for matching reports
    disambigPhraseRef.current = text;
    setDisambigCandidates(null);
    setDisambigError(null);
    setSelectedCandidateId(null);
    setDisambigLoading(true);

    http
      .post<{ total: number; reports: Array<Record<string, unknown> & { report_id?: string }> }>(
        SEARCH_REPORTS_API_PATH,
        { version: '2023-10-31', body: JSON.stringify({ query: text, size: 5 }) }
      )
      .then((res) => {
        setDisambigCandidates(res.reports.map(extractHit));
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setDisambigError(msg);
        setDisambigCandidates([]);
      })
      .finally(() => {
        setDisambigLoading(false);
      });
  }, [depth, http, inputText, runWithInput]);

  const handleDisambigConfirm = useCallback(() => {
    if (!selectedCandidateId) return;
    setDisambigCandidates(null);
    runWithInput({ input_type: 'report_id', report_id: selectedCandidateId, depth });
  }, [depth, runWithInput, selectedCandidateId]);

  const handleDisambigTreatAsRaw = useCallback(() => {
    const phrase = disambigPhraseRef.current;
    setDisambigCandidates(null);
    runWithInput({ input_type: 'raw_text', raw_text: phrase, depth });
  }, [depth, runWithInput]);

  const handleRetry = useCallback(() => {
    if (lastInputRef.current) {
      void startRun(lastInputRef.current);
    }
  }, [startRun]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isInputValid && !polling) handleRun();
    },
    [handleRun, isInputValid, polling]
  );

  const handleLoadRun = useCallback(
    (runId: string) => {
      void loadRun(runId);
    },
    [loadRun]
  );

  // Refresh recents when a run completes
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (activeRun?.status === 'succeeded' && prevStatusRef.current !== 'succeeded') {
      void refreshRecents();
    }
    prevStatusRef.current = activeRun?.status;
  }, [activeRun?.status, refreshRecents]);

  const stageLabel = getStageLabel(activeRun?.stage);

  if (!skillEnabled) {
    return (
      <EuiPageTemplate restrictWidth={false} grow>
        <EuiPageTemplate.Header
          pageTitle={
            <>
              {i18n.translate(
                'xpack.securitySolution.threatIntelligence.correlationReport.pageTitle',
                { defaultMessage: 'Col Mustard — Threat Correlation' }
              )}
              <ColMustardPawnIcon />
            </>
          }
        />
        <EuiPageTemplate.Section>
          <EuiCallOut
            title={i18n.translate(
              'xpack.securitySolution.threatIntelligence.correlationReport.featureDisabledTitle',
              { defaultMessage: 'Feature not enabled' }
            )}
            color="warning"
            iconType="lock"
            data-test-subj="correlationReportFeatureDisabled"
          >
            <EuiText size="s">
              {i18n.translate(
                'xpack.securitySolution.threatIntelligence.correlationReport.featureDisabledBody',
                {
                  defaultMessage:
                    'The Threat Intelligence Skill feature must be enabled to use this page. Add `threatIntelligenceSkillEnabled` to `xpack.securitySolution.enableExperimental` in your Kibana configuration.',
                }
              )}
            </EuiText>
          </EuiCallOut>
        </EuiPageTemplate.Section>
      </EuiPageTemplate>
    );
  }

  return (
    <EuiPageTemplate restrictWidth={false} grow>
      <EuiPageTemplate.Header
        pageTitle={
          <>
            {i18n.translate(
              'xpack.securitySolution.threatIntelligence.correlationReport.pageTitle',
              { defaultMessage: 'Col Mustard — Threat Correlation' }
            )}
            <ColMustardPawnIcon />
          </>
        }
        description={i18n.translate(
          'xpack.securitySolution.threatIntelligence.correlationReport.pageDescription',
          {
            defaultMessage:
              'Correlate a report ID or free-text incident against the knowledge base.',
          }
        )}
      />
      <EuiPageTemplate.Section>
        {/* ---- Input panel ---- */}
        <EuiPanel hasBorder paddingSize="m" data-test-subj="correlationReportInputPanel">
          <EuiFormRow label={i18nText.smartInputLabel()} helpText={i18nText.smartInputHelp()}>
            <EuiTextArea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={i18nText.smartInputPlaceholder()}
              disabled={polling || disambigLoading}
              rows={4}
              resize="vertical"
              data-test-subj="correlationReportSmartInput"
            />
          </EuiFormRow>

          <EuiSpacer size="m" />

          {/* Action row: options gear + run button */}
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiPopover
                isOpen={depthPopoverOpen}
                closePopover={() => setDepthPopoverOpen(false)}
                button={
                  <EuiButtonIcon
                    iconType="gear"
                    aria-label={i18nText.executionOptionsAriaLabel()}
                    onClick={() => setDepthPopoverOpen((v) => !v)}
                    disabled={polling}
                    data-test-subj="correlationReportOptionsBtn"
                  />
                }
                panelPaddingSize="m"
              >
                <EuiTitle size="xs">
                  <h3>{i18nText.executionOptionsTitle()}</h3>
                </EuiTitle>
                <EuiSpacer size="s" />
                <EuiRadioGroup
                  options={depthRadioOptions}
                  idSelected={depth}
                  onChange={(id) => {
                    setDepth(id as CorrelationDepth);
                    setDepthPopoverOpen(false);
                  }}
                  name="correlation-depth-selector"
                  data-test-subj="correlationReportDepthSelector"
                />
              </EuiPopover>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                fill
                isDisabled={!isInputValid || polling || disambigLoading}
                isLoading={polling || disambigLoading}
                onClick={handleRun}
                data-test-subj="correlationReportRunBtn"
              >
                {i18nText.runBtn()}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>

          {/* ---- Disambiguation panel ---- */}
          {disambigLoading ? (
            <>
              <EuiSpacer size="m" />
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiLoadingSpinner size="m" />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText size="s" color="subdued">
                    {i18nText.disambigSearching()}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </>
          ) : disambigCandidates !== null ? (
            <>
              <EuiSpacer size="m" />
              <EuiTitle size="xs">
                <h3>{i18nText.disambigHeader()}</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              {disambigError ? (
                <EuiCallOut
                  title={i18nText.errorTitle()}
                  color="danger"
                  iconType="alert"
                  size="s"
                  data-test-subj="correlationReportDisambigError"
                >
                  <EuiText size="s">{disambigError}</EuiText>
                </EuiCallOut>
              ) : disambigCandidates.length === 0 ? (
                <EuiText size="s" color="subdued" data-test-subj="correlationReportDisambigEmpty">
                  {i18nText.disambigNoMatches()}
                </EuiText>
              ) : (
                <EuiSelectable<{ report_id: string }>
                  options={disambigCandidates.map((c) => ({
                    label: c.title,
                    append: c.source ? (
                      <EuiText size="xs" color="subdued">
                        {c.source}
                      </EuiText>
                    ) : undefined,
                    report_id: c.report_id,
                    checked: selectedCandidateId === c.report_id ? ('on' as const) : undefined,
                  }))}
                  onChange={(opts) => {
                    const chosen = opts.find((o) => o.checked === 'on');
                    setSelectedCandidateId(chosen?.report_id ?? null);
                  }}
                  singleSelection
                  data-test-subj="correlationReportDisambigSelectable"
                >
                  {(list) => list}
                </EuiSelectable>
              )}
              <EuiSpacer size="s" />
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                {disambigCandidates.length > 0 && !disambigError ? (
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      fill
                      size="s"
                      isDisabled={!selectedCandidateId}
                      onClick={handleDisambigConfirm}
                      data-test-subj="correlationReportDisambigConfirmBtn"
                    >
                      {i18nText.runBtn()}
                    </EuiButton>
                  </EuiFlexItem>
                ) : null}
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    size="s"
                    onClick={handleDisambigTreatAsRaw}
                    data-test-subj="correlationReportDisambigRawBtn"
                  >
                    {i18nText.disambigTreatAsRaw()}
                  </EuiButtonEmpty>
                </EuiFlexItem>
              </EuiFlexGroup>
            </>
          ) : null}
        </EuiPanel>

        <EuiSpacer size="l" />

        {/* ---- Progress ---- */}
        {polling ? (
          <EuiEmptyPrompt
            icon={<EuiLoadingSpinner size="xl" />}
            title={<h2>{i18nText.progressTitle()}</h2>}
            body={
              <EuiText size="s" color="subdued">
                {stageLabel}
              </EuiText>
            }
            data-test-subj="correlationReportProgress"
          />
        ) : null}

        {/* ---- Error ---- */}
        {!polling && error ? (
          <EuiCallOut
            title={i18nText.errorTitle()}
            color="danger"
            iconType="alert"
            data-test-subj="correlationReportError"
          >
            <EuiText size="s">{error}</EuiText>
            <EuiSpacer size="s" />
            <EuiButton
              size="s"
              color="danger"
              onClick={handleRetry}
              data-test-subj="correlationReportRetryBtn"
            >
              {i18nText.retryBtn()}
            </EuiButton>
          </EuiCallOut>
        ) : null}

        {/* ---- Result dispatch ---- */}
        {!polling && !error && activeRun?.status === 'succeeded' ? (
          <ResultDispatch
            run={activeRun}
            onTitleSave={(title) => updateRunTitle(activeRun.runId, title)}
          />
        ) : null}

        <EuiSpacer size="xl" />

        {/* ---- Recents ---- */}
        <EuiAccordion
          id="correlation-recents"
          buttonContent={i18nText.recentsTitle()}
          initialIsOpen={false}
        >
          <EuiSpacer size="s" />
          <RecentsPanel
            recents={recents}
            loading={recentsLoading}
            activeRunId={activeRun?.runId}
            onLoadRun={handleLoadRun}
          />
        </EuiAccordion>
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
};
