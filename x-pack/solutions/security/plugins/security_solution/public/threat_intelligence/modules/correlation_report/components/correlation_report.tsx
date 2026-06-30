/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiInlineEditTitle,
  EuiLink,
  EuiMarkdownFormat,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import type { EuiThemeComputed } from '@elastic/eui';
import type {
  CorrelationFindings,
  CorrelationFindingsLead,
  CorrelationFindingsNoMatch,
  CorrelationFindingsSynthesis,
  EvidenceItem,
  EvidenceWeight,
} from '../../../../../common/threat_intelligence/correlation';
import {
  accordionButtonCss,
  blufDotWrapperCss,
  consolidatedListCss,
  counterSubBlockCss,
  diamondCenterCss,
  dotBaseCss,
  dotPairCss,
  evidenceColumnCss,
  evidenceGutterCss,
  evidenceItemRowCss,
  evidenceVertexBodyCss,
  leadButtonContentCss,
  leadHeaderCss,
  leadListCss,
  markdownBodyCss,
  markdownInlineCss,
  nextStepsListCss,
  noMatchListCss,
  sourceChipListCss,
  statRowCss,
} from './styles';
import { i18nText } from './translations';

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface CorrelationReportProps {
  findings: CorrelationFindings;
  candidateMeta?: Record<string, { title?: string; vendor?: string; url?: string }>;
  title?: string;
  runId?: string;
  onTitleSave?: (title: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal types & constants
// ---------------------------------------------------------------------------

type VertexSignalLevel = CorrelationFindingsLead['vertex_signal']['adversary'];
type CorrelationSignalLevel = CorrelationFindingsSynthesis['correlation_signal'];
type ConfidenceLevel = CorrelationFindingsLead['confidence'];
type RelationshipType = CorrelationFindingsLead['relationship'];
type CorrelationVertex = keyof CorrelationFindingsLead['vertex_signal'];
type CaseVertexSignal = NonNullable<CorrelationFindings['case_vertex_signal']>;

// ADV / INF / CAP / VIC order used for display and tiebreak sorting
const VERTICES: ReadonlyArray<CorrelationVertex> = [
  'adversary',
  'infrastructure',
  'capability',
  'victim',
];

const VERTEX_ABBREV: Record<CorrelationVertex, string> = {
  adversary: 'ADV',
  capability: 'CAP',
  infrastructure: 'INF',
  victim: 'VIC',
};

const VERTEX_LABEL: Record<CorrelationVertex, () => string> = {
  adversary: i18nText.vertexAdversary,
  capability: i18nText.vertexCapability,
  infrastructure: i18nText.vertexInfrastructure,
  victim: i18nText.vertexVictim,
};

const RELATIONSHIP_LABEL: Record<RelationshipType, () => string> = {
  same_campaign: i18nText.relationshipSameCampaign,
  same_actor: i18nText.relationshipSameActor,
  shared_tradecraft: i18nText.relationshipSharedTradecraft,
};

const WEIGHT_LABEL: Record<EvidenceWeight, () => string> = {
  smoking_gun: i18nText.weightSmokingGun,
  supporting: i18nText.weightSupporting,
  non_discriminatory: i18nText.weightNonDiscriminatory,
  counter: i18nText.weightCounter,
  decisive_counter: i18nText.weightDecisiveCounter,
};

const VERTEX_SIGNAL_ORDER: Record<VertexSignalLevel, number> = { high: 2, partial: 1, none: 0 };

// ---------------------------------------------------------------------------
// emphasizeRelationships — pre-processor applied before markdown rendering
// Wraps same_campaign / same_actor / shared_tradecraft in bold + UPPERCASE.
// Safe: underscores inside **...** are flanked by alphanumerics and cannot
// open emphasis per CommonMark §6.2, so no italic bleed.
// ---------------------------------------------------------------------------

const RELATIONSHIP_BOLD_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bsame_campaign\b/gi, '**SAME_CAMPAIGN**'],
  [/\bsame_actor\b/gi, '**SAME_ACTOR**'],
  [/\bshared_tradecraft\b/gi, '**SHARED_TRADECRAFT**'],
];

const emphasizeRelationships = (text: string): string =>
  RELATIONSHIP_BOLD_PATTERNS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text
  );

// ---------------------------------------------------------------------------
// Color helpers — pure functions; callers pass euiTheme.colors
// ---------------------------------------------------------------------------

const vertexSignalColor = (signal: VertexSignalLevel, c: EuiThemeComputed['colors']): string => {
  if (signal === 'high') return c.success;
  if (signal === 'partial') return c.warning;
  return c.subduedText;
};

const correlationSignalColor = (
  signal: CorrelationSignalLevel,
  c: EuiThemeComputed['colors']
): string => {
  if (signal === 'high') return c.success;
  if (signal === 'moderate') return c.warning;
  if (signal === 'low') return c.danger;
  return c.subduedText;
};

const confidenceColor = (confidence: ConfidenceLevel, c: EuiThemeComputed['colors']): string => {
  if (confidence === 'high') return c.success;
  if (confidence === 'moderate') return c.warning;
  return c.danger;
};

const weightColor = (weight: EvidenceWeight, c: EuiThemeComputed['colors']): string => {
  if (weight === 'smoking_gun' || weight === 'supporting') return c.success;
  if (weight === 'non_discriminatory') return c.warning;
  return c.danger;
};

const vertexSignalLabel = (signal: VertexSignalLevel): string => {
  if (signal === 'high') return i18nText.signalHigh();
  if (signal === 'partial') return i18nText.signalPartial();
  return i18nText.signalNone();
};

const correlationSignalLabel = (signal: CorrelationSignalLevel): string => {
  if (signal === 'high') return i18nText.signalHigh();
  if (signal === 'moderate') return i18nText.signalModerate();
  if (signal === 'low') return i18nText.signalLow();
  return i18nText.signalNone();
};

// ---------------------------------------------------------------------------
// Dot — themed colored circle with accessibility label
// ---------------------------------------------------------------------------

interface DotProps {
  color: string;
  ariaLabel?: string;
  ariaHidden?: true;
  size?: number;
}

const Dot: React.FC<DotProps> = ({ color, ariaLabel, ariaHidden, size = 10 }) => (
  <span
    role={ariaLabel ? 'img' : undefined}
    aria-label={ariaLabel}
    aria-hidden={ariaHidden ? true : undefined}
    css={dotBaseCss}
    style={{ width: size, height: size, backgroundColor: color }}
  />
);

// ---------------------------------------------------------------------------
// WeightDots — 1 or 2 dots for evidence weight
// ---------------------------------------------------------------------------

const WeightDots: React.FC<{ weight: EvidenceWeight; euiColors: EuiThemeComputed['colors'] }> = ({
  weight,
  euiColors,
}) => {
  const isDouble = weight === 'smoking_gun' || weight === 'decisive_counter';
  const color = weightColor(weight, euiColors);
  const label = WEIGHT_LABEL[weight]();

  if (isDouble) {
    return (
      <span role="img" aria-label={label} css={dotPairCss}>
        <Dot color={color} ariaHidden />
        <Dot color={color} ariaHidden />
      </span>
    );
  }
  return <Dot color={color} ariaLabel={label} />;
};

// ---------------------------------------------------------------------------
// DiamondSvg — inline SVG with four nodes + four edges forming the diamond
// ---------------------------------------------------------------------------

type EdgeCoords = [number, number, number, number];

const DIAMOND_NODES: ReadonlyArray<{ vertex: CorrelationVertex; cx: number; cy: number }> = [
  { vertex: 'adversary', cx: 80, cy: 18 },
  { vertex: 'infrastructure', cx: 18, cy: 80 },
  { vertex: 'capability', cx: 142, cy: 80 },
  { vertex: 'victim', cx: 80, cy: 142 },
];

const DIAMOND_EDGES: ReadonlyArray<EdgeCoords> = [
  [80, 18, 18, 80],
  [80, 18, 142, 80],
  [18, 80, 80, 142],
  [142, 80, 80, 142],
];

export interface DiamondSvgProps {
  vertexSignal: CorrelationFindingsLead['vertex_signal'];
  euiColors: EuiThemeComputed['colors'];
  /** Rendered px size; viewBox stays 0 0 160 160. Default 160. Labels hidden below 100px. */
  size?: number;
}

export const DiamondSvg: React.FC<DiamondSvgProps> = ({ vertexSignal, euiColors, size = 160 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    role="img"
    aria-label={i18nText.diamondLabel()}
    data-test-subj="correlationReportDiamond"
  >
    {DIAMOND_EDGES.map(([x1, y1, x2, y2], i) => (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={euiColors.borderBasePlain}
        strokeWidth={1.5}
      />
    ))}
    {DIAMOND_NODES.map(({ vertex, cx, cy }) => {
      const signal = vertexSignal[vertex];
      const fillColor = vertexSignalColor(signal, euiColors);
      // Warning (yellow) circles need dark label text for contrast
      const textFill = signal === 'partial' ? euiColors.darkShade : '#ffffff';
      return (
        <g key={vertex}>
          <circle cx={cx} cy={cy} r={16} fill={fillColor} />
          {size >= 100 ? (
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontWeight={700}
              fill={textFill}
              aria-hidden="true"
            >
              {VERTEX_ABBREV[vertex]}
            </text>
          ) : null}
        </g>
      );
    })}
  </svg>
);

// ---------------------------------------------------------------------------
// CaseSignalProfile — per-vertex signal for the case under analysis
// ---------------------------------------------------------------------------

const CaseSignalProfile: React.FC<{
  caseVertexSignal: CaseVertexSignal;
  euiColors: EuiThemeComputed['colors'];
}> = ({ caseVertexSignal, euiColors }) => (
  <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false} wrap>
    {VERTICES.map((vertex) => {
      const signal = caseVertexSignal[vertex];
      const color = vertexSignalColor(signal, euiColors);
      return (
        <EuiFlexItem key={vertex} grow={false}>
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <Dot
                color={color}
                ariaLabel={`${VERTEX_LABEL[vertex]()}: ${vertexSignalLabel(signal)}`}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs">
                <strong>{VERTEX_ABBREV[vertex]}</strong>
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      );
    })}
  </EuiFlexGroup>
);

// ---------------------------------------------------------------------------
// EvidenceSection — grouped by vertex, ordered by signal strength desc
// ---------------------------------------------------------------------------

const SUPPORTING_WEIGHTS: ReadonlyArray<EvidenceWeight> = [
  'smoking_gun',
  'supporting',
  'non_discriminatory',
];
const COUNTER_WEIGHTS: ReadonlyArray<EvidenceWeight> = ['counter', 'decisive_counter'];

const EvidenceSection: React.FC<{
  evidence: EvidenceItem[];
  vertexSignal: CorrelationFindingsLead['vertex_signal'];
  euiColors: EuiThemeComputed['colors'];
}> = ({ evidence, vertexSignal, euiColors }) => {
  const vertexGroups = useMemo(() => {
    const groups: Partial<Record<CorrelationVertex, EvidenceItem[]>> = {};
    for (const item of evidence) {
      const v = item.vertex as CorrelationVertex;
      const existing = groups[v];
      if (existing !== undefined) {
        existing.push(item);
      } else {
        groups[v] = [item];
      }
    }
    const populated = (Object.keys(groups) as CorrelationVertex[]).sort((a, b) => {
      const diff = VERTEX_SIGNAL_ORDER[vertexSignal[b]] - VERTEX_SIGNAL_ORDER[vertexSignal[a]];
      return diff !== 0 ? diff : VERTICES.indexOf(a) - VERTICES.indexOf(b);
    });
    return populated.map((v) => ({ vertex: v, items: groups[v] as EvidenceItem[] }));
  }, [evidence, vertexSignal]);

  return (
    <>
      {vertexGroups.map(({ vertex, items }, groupIdx) => {
        const supporting = items.filter((e) =>
          (SUPPORTING_WEIGHTS as ReadonlyArray<string>).includes(e.weight)
        );
        const counter = items.filter((e) =>
          (COUNTER_WEIGHTS as ReadonlyArray<string>).includes(e.weight)
        );

        return (
          <React.Fragment key={vertex}>
            {groupIdx > 0 ? <EuiSpacer size="s" /> : null}
            <EuiTitle size="xxs">
              <h4>{VERTEX_LABEL[vertex]()}</h4>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <div css={evidenceVertexBodyCss}>
              {supporting.length > 0 ? (
                <div css={evidenceColumnCss}>
                  {supporting.map((item) => (
                    <div key={`${item.weight}-${item.text.slice(0, 20)}`} css={evidenceItemRowCss}>
                      <span css={evidenceGutterCss}>
                        <WeightDots weight={item.weight} euiColors={euiColors} />
                      </span>
                      <div css={markdownInlineCss}>
                        <EuiMarkdownFormat textSize="s">{item.text}</EuiMarkdownFormat>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {counter.length > 0 ? (
                <>
                  {supporting.length > 0 ? <EuiSpacer size="xs" /> : null}
                  <div css={counterSubBlockCss}>
                    <EuiText size="xs">
                      <strong>{i18nText.counterEvidenceLabel()}</strong>
                    </EuiText>
                    <EuiSpacer size="xs" />
                    <div css={evidenceColumnCss}>
                      {counter.map((item) => (
                        <div
                          key={`${item.weight}-${item.text.slice(0, 20)}`}
                          css={evidenceItemRowCss}
                        >
                          <span css={evidenceGutterCss}>
                            <WeightDots weight={item.weight} euiColors={euiColors} />
                          </span>
                          <div css={markdownInlineCss}>
                            <EuiMarkdownFormat textSize="s">{item.text}</EuiMarkdownFormat>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------------------
// LeadCard — EuiAccordion per lead
// ---------------------------------------------------------------------------

const LeadCard: React.FC<{
  lead: CorrelationFindingsLead;
  index: number;
  candidateMeta?: CorrelationReportProps['candidateMeta'];
  candidateLabels?: CorrelationFindings['candidate_labels'];
  euiColors: EuiThemeComputed['colors'];
}> = ({ lead, index, candidateMeta, candidateLabels, euiColors }) => {
  const [isOpen, setIsOpen] = useState(false);

  const confidenceDotColor = confidenceColor(lead.confidence, euiColors);
  const confidenceLabel =
    lead.confidence === 'high'
      ? i18nText.signalHigh()
      : lead.confidence === 'moderate'
      ? i18nText.signalModerate()
      : i18nText.signalLow();

  const emDashIdx = lead.title.indexOf(' — ');
  const leadTitleMain = emDashIdx >= 0 ? lead.title.slice(0, emDashIdx) : lead.title;
  const leadTitleSub = emDashIdx >= 0 ? lead.title.slice(emDashIdx + 3) : undefined;

  const sources = useMemo(() => {
    const seen = new Set<string>();
    return lead.candidate_ids.flatMap((id) => {
      const meta = candidateMeta?.[id];
      const key = meta?.url ?? meta?.vendor ?? id;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ id, vendor: meta?.vendor, url: meta?.url }];
    });
  }, [lead.candidate_ids, candidateMeta]);

  const headerBlock = (
    <div css={leadHeaderCss}>
      <div>
        <EuiBadge color="hollow">
          {RELATIONSHIP_LABEL[lead.relationship]()}
          {' · '}
          {confidenceLabel} <Dot color={confidenceDotColor} ariaLabel={confidenceLabel} size={8} />
        </EuiBadge>
      </div>
      <div>
        <EuiText size="s">
          <strong>{leadTitleMain}</strong>
        </EuiText>
        {leadTitleSub !== undefined ? (
          <EuiText size="xs" color="subdued">
            {leadTitleSub}
          </EuiText>
        ) : null}
      </div>
    </div>
  );

  const buttonContent = (
    <div css={leadButtonContentCss}>
      {!isOpen ? (
        <DiamondSvg vertexSignal={lead.vertex_signal} euiColors={euiColors} size={80} />
      ) : null}
      {headerBlock}
    </div>
  );

  return (
    <EuiPanel hasBorder paddingSize="none" data-test-subj={`correlationReportLead-${index}`}>
      <EuiAccordion
        id={`lead-${lead.candidate_ids[0]}-${index}`}
        buttonContent={buttonContent}
        paddingSize="m"
        buttonProps={{ css: accordionButtonCss }}
        forceState={isOpen ? 'open' : 'closed'}
        onToggle={setIsOpen}
      >
        {/* BLUF */}
        <div css={markdownBodyCss}>
          <EuiMarkdownFormat textSize="s">{emphasizeRelationships(lead.bluf)}</EuiMarkdownFormat>
        </div>

        <EuiSpacer size="m" />

        {/* Sources — all candidate IDs, deduped by URL */}
        {sources.length > 0 ? (
          <>
            <EuiText size="xs">
              <strong>
                {i18nText.sourcesLabel()}
                {` (${sources.length})`}
              </strong>
            </EuiText>
            <EuiSpacer size="xs" />
            <div css={sourceChipListCss}>
              {sources.map(({ id, vendor, url }) => {
                const label = candidateLabels?.[id];
                const chipText = label !== undefined ? `${label} ${vendor ?? id}` : vendor ?? id;
                return url ? (
                  <EuiBadge key={id} href={url} target="_blank" color="hollow">
                    {chipText}
                  </EuiBadge>
                ) : (
                  <EuiBadge key={id} color="hollow">
                    {chipText}
                  </EuiBadge>
                );
              })}
            </div>
            <EuiSpacer size="s" />
          </>
        ) : null}

        {/* Diamond — center-aligned own section */}
        <div css={diamondCenterCss}>
          <DiamondSvg vertexSignal={lead.vertex_signal} euiColors={euiColors} />
        </div>

        <EuiSpacer size="m" />

        {/* Evidence — full-width, grouped by vertex */}
        <EvidenceSection
          evidence={lead.evidence}
          vertexSignal={lead.vertex_signal}
          euiColors={euiColors}
        />

        {/* Gaps */}
        {lead.gaps ? (
          <>
            <EuiSpacer size="s" />
            <EuiText size="xs" color="subdued">
              <strong>
                {i18nText.gapsLabel()}
                {': '}
              </strong>
            </EuiText>
            <div css={markdownBodyCss}>
              <EuiMarkdownFormat textSize="s">
                {emphasizeRelationships(lead.gaps)}
              </EuiMarkdownFormat>
            </div>
          </>
        ) : null}

        {/* Consolidated reports list */}
        {lead.consolidated_candidates.length > 0 ? (
          <>
            <EuiSpacer size="s" />
            <EuiText size="xs">
              <strong>{i18nText.consolidatedReportsLabel()}</strong>
            </EuiText>
            <EuiSpacer size="xs" />
            <div css={consolidatedListCss}>
              {lead.consolidated_candidates.map((c) => {
                const candidateUrl = candidateMeta?.[c.id]?.url;
                return (
                  <div key={c.id}>
                    {candidateUrl ? (
                      <EuiLink href={candidateUrl} target="_blank" external>
                        <EuiText size="xs" component="span">
                          {c.title}
                        </EuiText>
                      </EuiLink>
                    ) : (
                      <EuiText size="xs">{c.title}</EuiText>
                    )}
                    <EuiText size="xs" color="subdued">
                      {c.reason}
                    </EuiText>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </EuiAccordion>
    </EuiPanel>
  );
};

// ---------------------------------------------------------------------------
// NoMatchesCard
// ---------------------------------------------------------------------------

const NoMatchesCard: React.FC<{ noMatch: CorrelationFindingsNoMatch[] }> = ({ noMatch }) => (
  <EuiPanel hasBorder paddingSize="m" data-test-subj="correlationReportNoMatches">
    <EuiTitle size="xs">
      <h3>{i18nText.noMatchesSectionTitle()}</h3>
    </EuiTitle>
    <EuiSpacer size="s" />
    {noMatch.length === 0 ? (
      <EuiText size="s" color="subdued">
        {i18nText.noMatchesEmpty()}
      </EuiText>
    ) : (
      <div css={noMatchListCss}>
        {noMatch.map((item) => (
          <EuiText key={item.id} size="s">
            {item.title}
            {item.vendor ? (
              <EuiText size="xs" color="subdued" component="span">
                {' — '}
                {item.vendor}
              </EuiText>
            ) : null}
          </EuiText>
        ))}
      </div>
    )}
  </EuiPanel>
);

// ---------------------------------------------------------------------------
// SynthesisCard — collapsible, default collapsed; no bluf (shown in top panel)
// ---------------------------------------------------------------------------

const SynthesisCard: React.FC<{
  synthesis: CorrelationFindingsSynthesis;
  euiColors: EuiThemeComputed['colors'];
}> = ({ synthesis, euiColors }) => {
  const signalColor = correlationSignalColor(synthesis.correlation_signal, euiColors);
  const signalLabel = correlationSignalLabel(synthesis.correlation_signal);

  const buttonContent = (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <Dot color={signalColor} ariaLabel={signalLabel} size={12} />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiTitle size="xs">
          <h3>{i18nText.synthesisSectionTitle()}</h3>
        </EuiTitle>
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  return (
    <EuiPanel hasBorder paddingSize="none" data-test-subj="correlationReportSynthesis">
      <EuiAccordion
        id="synthesis-accordion"
        buttonContent={buttonContent}
        paddingSize="m"
        buttonProps={{ css: accordionButtonCss }}
      >
        <EuiTitle size="xs">
          <h4>{i18nText.reasoningLabel()}</h4>
        </EuiTitle>
        <EuiSpacer size="s" />
        <div css={markdownBodyCss}>
          <EuiMarkdownFormat textSize="s">
            {emphasizeRelationships(synthesis.reasoning)}
          </EuiMarkdownFormat>
        </div>

        {synthesis.gaps ? (
          <>
            <EuiSpacer size="m" />
            <EuiTitle size="xs">
              <h4>{i18nText.synthesisGapsLabel()}</h4>
            </EuiTitle>
            <EuiSpacer size="s" />
            <div css={markdownBodyCss}>
              <EuiMarkdownFormat textSize="s">
                {emphasizeRelationships(synthesis.gaps)}
              </EuiMarkdownFormat>
            </div>
          </>
        ) : null}

        {synthesis.inferential_hops !== undefined ? (
          <>
            <EuiSpacer size="m" />
            <div css={statRowCss}>
              <EuiText size="s">
                <strong>{i18nText.inferentialHopsLabel()}</strong>
              </EuiText>
              <EuiText size="s">{synthesis.inferential_hops}</EuiText>
            </div>
          </>
        ) : null}

        {synthesis.atomic_ioc_overlap !== undefined ? (
          <>
            <EuiSpacer size="s" />
            <div css={statRowCss}>
              <EuiText size="s">
                <strong>{i18nText.atomicIocOverlapLabel()}</strong>
              </EuiText>
              <EuiText size="s">
                {synthesis.atomic_ioc_overlap.assessed
                  ? i18nText.atomicIocAssessed()
                  : i18nText.atomicIocNotAssessed()}
                {synthesis.atomic_ioc_overlap.note
                  ? ` — ${synthesis.atomic_ioc_overlap.note}`
                  : null}
              </EuiText>
            </div>
          </>
        ) : null}
      </EuiAccordion>
    </EuiPanel>
  );
};

// ---------------------------------------------------------------------------
// NextStepsCard — collapsible, default collapsed
// ---------------------------------------------------------------------------

const NextStepsCard: React.FC<{
  nextSteps: CorrelationFindingsSynthesis['next_steps'];
  euiColors: EuiThemeComputed['colors'];
}> = ({ nextSteps, euiColors }) => (
  <EuiPanel hasBorder paddingSize="none" data-test-subj="correlationReportNextSteps">
    <EuiAccordion
      id="next-steps-accordion"
      buttonContent={
        <EuiTitle size="xs">
          <h3>{i18nText.nextStepsSectionTitle()}</h3>
        </EuiTitle>
      }
      paddingSize="m"
      buttonProps={{ css: accordionButtonCss }}
    >
      <div css={nextStepsListCss}>
        {nextSteps.map((step, i) => {
          const priorityColor = step.priority === 'high' ? euiColors.success : euiColors.warning;
          const priorityLabel =
            step.priority === 'high' ? i18nText.signalHigh() : i18nText.signalModerate();
          return (
            <div key={i} css={evidenceItemRowCss}>
              <span css={evidenceGutterCss}>
                <Dot color={priorityColor} ariaLabel={priorityLabel} />
              </span>
              <div css={markdownInlineCss}>
                <EuiMarkdownFormat textSize="s">{step.text}</EuiMarkdownFormat>
              </div>
            </div>
          );
        })}
      </div>
    </EuiAccordion>
  </EuiPanel>
);

// ---------------------------------------------------------------------------
// CorrelationReport — main export
// ---------------------------------------------------------------------------

export const CorrelationReport: React.FC<CorrelationReportProps> = ({
  findings,
  candidateMeta,
  title,
  runId,
  onTitleSave,
}) => {
  const { euiTheme } = useEuiTheme();
  const { colors } = euiTheme;

  const [localTitle, setLocalTitle] = useState(title ?? i18nText.defaultTitle());

  const caseSignalColor = correlationSignalColor(findings.synthesis.correlation_signal, colors);
  const caseSignalLabel = correlationSignalLabel(findings.synthesis.correlation_signal);

  return (
    <div data-test-subj="correlationReport">
      {/* Header */}
      <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false} wrap>
        <EuiFlexItem>
          {onTitleSave !== undefined ? (
            <EuiInlineEditTitle
              heading="h1"
              size="m"
              inputAriaLabel={i18nText.editTitleAriaLabel()}
              value={localTitle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalTitle(e.target.value)}
              onSave={(value) => {
                void onTitleSave(value);
              }}
              onCancel={(prev) => setLocalTitle(prev)}
            />
          ) : (
            <EuiTitle size="m">
              <h1>{localTitle}</h1>
            </EuiTitle>
          )}
        </EuiFlexItem>
        {runId ? (
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {i18nText.runIdLabel()}
              {': '}
              <code>{runId}</code>
            </EuiText>
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* BLUF */}
      <EuiPanel hasBorder paddingSize="m" data-test-subj="correlationReportBluf">
        <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
          <EuiFlexItem grow={false}>
            <span css={blufDotWrapperCss}>
              <Dot color={caseSignalColor} ariaLabel={caseSignalLabel} size={12} />
            </span>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="xs">
              <h2>{i18nText.blufSectionTitle()}</h2>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <div css={markdownBodyCss}>
              <EuiMarkdownFormat textSize="s">
                {emphasizeRelationships(findings.synthesis.bluf)}
              </EuiMarkdownFormat>
            </div>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Case Signal — only when case_vertex_signal is present */}
      {findings.case_vertex_signal !== undefined ? (
        <>
          <EuiPanel hasBorder paddingSize="m" data-test-subj="correlationReportCaseSignal">
            <EuiTitle size="xs">
              <h2>{i18nText.caseSignalSectionTitle()}</h2>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              {i18nText.caseSignalDescription()}
            </EuiText>
            <EuiSpacer size="s" />
            <CaseSignalProfile caseVertexSignal={findings.case_vertex_signal} euiColors={colors} />
          </EuiPanel>
          <EuiSpacer size="m" />
        </>
      ) : null}

      {/* Lead cards */}
      <EuiTitle size="xs">
        <h2>{i18nText.leadsSectionTitle()}</h2>
      </EuiTitle>
      <EuiSpacer size="s" />
      <div css={leadListCss}>
        {findings.leads.map((lead, i) => (
          <LeadCard
            key={lead.candidate_ids[0]}
            lead={lead}
            index={i}
            candidateMeta={candidateMeta}
            candidateLabels={findings.candidate_labels}
            euiColors={colors}
          />
        ))}
      </div>

      <EuiSpacer size="m" />

      {/* No Matches */}
      <NoMatchesCard noMatch={findings.no_match} />

      <EuiSpacer size="m" />

      {/* Synthesis */}
      <SynthesisCard synthesis={findings.synthesis} euiColors={colors} />

      <EuiSpacer size="m" />

      {/* Next Steps */}
      {findings.synthesis.next_steps.length > 0 ? (
        <NextStepsCard nextSteps={findings.synthesis.next_steps} euiColors={colors} />
      ) : null}
    </div>
  );
};
