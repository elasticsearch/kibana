/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import {
  SEVERITY_LEVELS,
  type CoverageRecommendation,
  type DashboardOverviewResponse,
  type SeverityLevel,
  type ThreatCategory,
  type ThreatRegion,
} from '../../../../../common/threat_intelligence/hub';
import {
  SEVERITY_HEX,
  ThreatReportFeed,
  fromDashboardArticle,
  type ReportFeedSort,
} from '../../../components/report_feed';
import { getMitreTechniqueMetadata } from '../mitre_technique_metadata';
import { ExecutiveAdvisoryPanel } from './executive_advisory_panel';

export interface IntelligenceHubChipFilters {
  regions: ThreatRegion[];
  categories: ThreatCategory[];
  severities: SeverityLevel[];
}

export const IntelligenceHubDashboardView: React.FC<{
  data: DashboardOverviewResponse;
  filters: IntelligenceHubChipFilters;
  sortBy: ReportFeedSort;
  onSortChange: (next: ReportFeedSort) => void;
  onToggleSeverity: (severity: SeverityLevel) => void;
  onToggleCategory: (category: ThreatCategory) => void;
  onClearChipFilters: () => void;
  highlightReportId?: string;
  onHighlightReport: (reportId: string) => void;
  isGeneratingAdvisory: boolean;
  onGenerateAdvisory: () => void;
  onFocusSourceReports: () => void;
}> = ({
  data,
  filters,
  sortBy,
  onSortChange,
  onToggleSeverity,
  onToggleCategory,
  onClearChipFilters,
  highlightReportId,
  onHighlightReport,
  isGeneratingAdvisory,
  onGenerateAdvisory,
  onFocusSourceReports,
}) => {
  const topCategory = data.by_category[0]?.category;

  const categoryCounts = useMemo(() => {
    const map = new Map<ThreatCategory, number>();
    for (const bucket of data.by_category) {
      if (bucket.category !== '<unknown>') {
        map.set(bucket.category as ThreatCategory, bucket.report_count);
      }
    }
    return map;
  }, [data.by_category]);

  const feedItems = useMemo(
    () => data.recent_articles.map(fromDashboardArticle),
    [data.recent_articles]
  );

  return (
    <>
      <StatsRibbon
        stats={data.stats_ribbon}
        topCategory={topCategory}
        recentArticles={data.recent_articles}
      />
      <EuiSpacer size="l" />
      <ExecutiveAdvisoryPanel
        advisory={data.latest_advisory}
        isGenerating={isGeneratingAdvisory}
        onGenerateSummary={onGenerateAdvisory}
        onHighlightReport={onHighlightReport}
        onFocusSourceReports={onFocusSourceReports}
      />
      <EuiSpacer size="l" />
      <EuiFlexGroup gutterSize="l" wrap alignItems="flexStart">
        <EuiFlexItem style={{ minWidth: 320 }}>
          <ThreatRadar buckets={data.by_category} />
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 320 }}>
          <ActivityTimeline buckets={data.severity_timeline} />
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 320 }}>
          <CategoryBreakdown buckets={data.by_category} />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />
      <div id="threat-intel-report-feed" data-test-subj="threatIntelReportFeedSection">
        <ThreatReportFeed
          items={feedItems}
          categoryCounts={categoryCounts}
          highlightReportId={highlightReportId}
          selectedSeverities={filters.severities}
          selectedCategories={filters.categories}
          onToggleSeverity={onToggleSeverity}
          onToggleCategory={onToggleCategory}
          onClearFilters={onClearChipFilters}
          sortBy={sortBy}
          onSortChange={onSortChange}
        />
      </div>
      <EuiSpacer size="l" />
      <RegionBreakdown buckets={data.by_region} />
      <EuiSpacer size="l" />
      <EuiFlexGroup gutterSize="l" wrap>
        <EuiFlexItem style={{ minWidth: 360 }}>
          <TopTechniques buckets={data.top_techniques} coverageSummary={data.coverage_summary} />
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 360 }}>
          <EnvironmentImpact
            impact={data.environment_impact}
            totalReports={data.stats_ribbon.total_reports}
            onHighlightReport={onHighlightReport}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};

const StatsRibbon: React.FC<{
  stats: DashboardOverviewResponse['stats_ribbon'];
  topCategory?: ThreatCategory | '<unknown>';
  recentArticles: DashboardOverviewResponse['recent_articles'];
}> = ({ stats, topCategory, recentArticles }) => {
  const severityTotals = useMemo(() => {
    const totals: Record<SeverityLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const article of recentArticles) {
      totals[article.severity] = (totals[article.severity] ?? 0) + 1;
    }
    return totals;
  }, [recentArticles]);

  return (
    <EuiFlexGroup gutterSize="m" wrap>
      <EuiFlexItem style={{ minWidth: 160 }}>
        <EuiPanel hasBorder paddingSize="m">
          <EuiStat
            title={stats.total_reports.toLocaleString()}
            description={i18n.translate('xpack.securitySolution.threatIntelligence.app.statTotal', {
              defaultMessage: 'Articles',
            })}
            titleColor="primary"
          />
        </EuiPanel>
      </EuiFlexItem>
      <EuiFlexItem style={{ minWidth: 160 }}>
        <EuiPanel hasBorder paddingSize="m">
          <EuiStat
            title={stats.critical_reports.toLocaleString()}
            description={i18n.translate(
              'xpack.securitySolution.threatIntelligence.app.statCritical',
              {
                defaultMessage: 'Critical',
              }
            )}
            titleColor="danger"
          />
        </EuiPanel>
      </EuiFlexItem>
      <EuiFlexItem style={{ minWidth: 160 }}>
        <EuiPanel hasBorder paddingSize="m">
          <EuiStat
            title={stats.distinct_source_count.toLocaleString()}
            description={i18n.translate(
              'xpack.securitySolution.threatIntelligence.app.statSources',
              {
                defaultMessage: 'Sources',
              }
            )}
            titleColor="accent"
          />
        </EuiPanel>
      </EuiFlexItem>
      <EuiFlexItem style={{ minWidth: 280 }}>
        <SeverityDistributionPanel totals={severityTotals} />
      </EuiFlexItem>
      <EuiFlexItem style={{ minWidth: 200 }}>
        <TopThreatPanel topCategory={topCategory} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const SeverityDistributionPanel: React.FC<{ totals: Record<SeverityLevel, number> }> = ({
  totals,
}) => {
  const { euiTheme } = useEuiTheme();
  const sum = SEVERITY_LEVELS.reduce((acc, s) => acc + totals[s], 0) || 1;
  const segments = SEVERITY_LEVELS.filter((s) => totals[s] > 0)
    .reverse()
    .map((severity) => ({
      severity,
      count: totals[severity],
      widthPct: (totals[severity] / sum) * 100,
    }));

  return (
    <EuiPanel hasBorder paddingSize="m">
      <EuiText size="xs" color="subdued">
        {i18n.translate('xpack.securitySolution.threatIntelligence.app.severityDistributionLabel', {
          defaultMessage: 'Severity distribution',
        })}
      </EuiText>
      <EuiSpacer size="xs" />
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 22,
          borderRadius: 4,
          overflow: 'hidden',
          background: euiTheme.colors.emptyShade,
        }}
        role="img"
        aria-label={segments
          .map((s) =>
            i18n.translate(
              'xpack.securitySolution.threatIntelligence.app.severityDistributionAriaSegment',
              {
                defaultMessage: '{severity}: {count}',
                values: { severity: s.severity, count: s.count },
              }
            )
          )
          .join(', ')}
      >
        {segments.map((segment) => (
          <div
            key={segment.severity}
            title={`${segment.severity}: ${segment.count}`}
            style={{
              width: `${segment.widthPct}%`,
              background: SEVERITY_HEX[segment.severity],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: euiTheme.colors.plainLight,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {segment.count}
          </div>
        ))}
      </div>
      <EuiSpacer size="xs" />
      <EuiFlexGroup gutterSize="s" wrap responsive={false}>
        {SEVERITY_LEVELS.slice()
          .reverse()
          .filter((s) => totals[s] > 0)
          .map((s) => (
            <EuiFlexItem key={s} grow={false}>
              <EuiText size="xs">
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    marginRight: 6,
                    background: SEVERITY_HEX[s],
                  }}
                />
                {`${totals[s]} ${s}`}
              </EuiText>
            </EuiFlexItem>
          ))}
      </EuiFlexGroup>
    </EuiPanel>
  );
};

const TopThreatPanel: React.FC<{ topCategory?: ThreatCategory | '<unknown>' }> = ({
  topCategory,
}) => (
  <EuiPanel hasBorder paddingSize="m">
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiIcon type="securityApp" size="l" color="danger" aria-hidden={true} />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiText size="xs" color="subdued">
          {i18n.translate('xpack.securitySolution.threatIntelligence.app.topThreatLabel', {
            defaultMessage: 'Top threat',
          })}
        </EuiText>
        <EuiTitle size="xs">
          <h3>
            {topCategory && topCategory !== '<unknown>'
              ? topCategory
              : i18n.translate('xpack.securitySolution.threatIntelligence.app.topThreatUnknown', {
                  defaultMessage: 'No clear leader',
                })}
          </h3>
        </EuiTitle>
      </EuiFlexItem>
    </EuiFlexGroup>
  </EuiPanel>
);

/** Matches ThreatRadar SVG height so the three overview panels align. */
const OVERVIEW_PANEL_CONTENT_HEIGHT = 260;

const PanelHeader: React.FC<{ title: string; description?: string }> = ({ title, description }) => (
  <>
    <EuiTitle size="xs">
      <h3>{title}</h3>
    </EuiTitle>
    {description ? (
      <EuiText size="xs" color="subdued">
        {description}
      </EuiText>
    ) : null}
    <EuiHorizontalRule margin="s" />
  </>
);

const CategoryBreakdown: React.FC<{ buckets: DashboardOverviewResponse['by_category'] }> = ({
  buckets,
}) => {
  const max = buckets[0]?.report_count ?? 0;
  return (
    <EuiPanel hasBorder paddingSize="m">
      <PanelHeader
        title={i18n.translate('xpack.securitySolution.threatIntelligence.app.categoryTitle', {
          defaultMessage: 'Categories',
        })}
        description={i18n.translate(
          'xpack.securitySolution.threatIntelligence.app.categoryDescription',
          {
            defaultMessage: 'Top reported threat categories',
          }
        )}
      />
      {buckets.length === 0 ? (
        <EuiText size="s" color="subdued">
          {i18n.translate('xpack.securitySolution.threatIntelligence.app.emptyState', {
            defaultMessage: 'No data',
          })}
        </EuiText>
      ) : (
        <div
          style={{
            maxHeight: OVERVIEW_PANEL_CONTENT_HEIGHT,
            overflowY: 'auto',
          }}
        >
          {buckets.map((bucket) => (
            <div key={bucket.category} style={{ marginBottom: 8 }}>
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem>
                  <EuiText size="s">{bucket.category}</EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="s" color="subdued">
                    {bucket.report_count}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiProgress value={bucket.report_count} max={max || 1} size="xs" color="primary" />
            </div>
          ))}
        </div>
      )}
    </EuiPanel>
  );
};

const RegionBreakdown: React.FC<{ buckets: DashboardOverviewResponse['by_region'] }> = ({
  buckets,
}) => (
  <EuiPanel hasBorder paddingSize="m">
    <PanelHeader
      title={i18n.translate('xpack.securitySolution.threatIntelligence.app.regionTitle', {
        defaultMessage: 'Geographic regions',
      })}
      description={i18n.translate(
        'xpack.securitySolution.threatIntelligence.app.regionDescription',
        {
          defaultMessage: 'Regions mentioned in reports',
        }
      )}
    />
    {buckets.length === 0 ? (
      <EuiText size="s" color="subdued">
        {i18n.translate('xpack.securitySolution.threatIntelligence.app.emptyState', {
          defaultMessage: 'No data',
        })}
      </EuiText>
    ) : (
      <EuiFlexGroup gutterSize="s" wrap responsive={false}>
        {buckets.map((bucket) => (
          <EuiFlexItem key={bucket.region} grow={false}>
            <EuiPanel hasBorder paddingSize="s">
              <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiText size="s">{bucket.region}</EuiText>
                </EuiFlexItem>
                {bucket.affects_you ? (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="danger">
                      {i18n.translate(
                        'xpack.securitySolution.threatIntelligence.app.affectsYouBadge',
                        {
                          defaultMessage: 'Affects you',
                        }
                      )}
                    </EuiBadge>
                  </EuiFlexItem>
                ) : null}
                <EuiFlexItem grow={false}>
                  <EuiText size="s" color="subdued">
                    {bucket.report_count}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    )}
  </EuiPanel>
);

const COVERAGE_BADGE_COLOR = (
  recommendation: CoverageRecommendation
): 'success' | 'warning' | 'danger' => {
  if (recommendation === 'covered') {
    return 'success';
  }
  if (recommendation === 'enable_existing') {
    return 'warning';
  }
  return 'danger';
};

const TopTechniques: React.FC<{
  buckets: DashboardOverviewResponse['top_techniques'];
  coverageSummary: DashboardOverviewResponse['coverage_summary'];
}> = ({ buckets, coverageSummary }) => {
  const max = buckets[0]?.report_count ?? 0;
  const enrichedBuckets = useMemo(
    () =>
      buckets.map((bucket) => ({
        ...bucket,
        metadata: getMitreTechniqueMetadata(bucket.technique_id),
      })),
    [buckets]
  );

  const coverageDescription =
    buckets.length === 0
      ? undefined
      : i18n.translate(
          'xpack.securitySolution.threatIntelligence.app.techniquesCoverageDescription',
          {
            defaultMessage:
              '{uncovered} uncovered, {enableExisting} with disabled rules to enable, {covered} covered',
            values: {
              uncovered: coverageSummary.uncovered,
              enableExisting: coverageSummary.enable_existing,
              covered: coverageSummary.covered,
            },
          }
        );

  return (
    <EuiPanel hasBorder paddingSize="m">
      <PanelHeader
        title={i18n.translate('xpack.securitySolution.threatIntelligence.app.techniquesTitle', {
          defaultMessage: 'Top ATT&CK techniques',
        })}
        description={
          coverageDescription ??
          i18n.translate('xpack.securitySolution.threatIntelligence.app.techniquesDescription', {
            defaultMessage: 'Most frequent techniques extracted from reports',
          })
        }
      />
      {buckets.length === 0 ? (
        <EuiText size="s" color="subdued">
          {i18n.translate('xpack.securitySolution.threatIntelligence.app.emptyState', {
            defaultMessage: 'No data',
          })}
        </EuiText>
      ) : (
        <div
          style={{
            maxHeight: OVERVIEW_PANEL_CONTENT_HEIGHT,
            overflowY: 'auto',
          }}
        >
          {enrichedBuckets.map((bucket) => (
            <div key={bucket.technique_id} style={{ marginBottom: 10 }}>
              <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
                <EuiFlexItem>
                  <EuiToolTip content={bucket.metadata.name}>
                    <EuiText size="s">
                      <strong>{bucket.metadata.name}</strong>
                    </EuiText>
                  </EuiToolTip>
                  <EuiSpacer size="xs" />
                  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
                    <EuiFlexItem grow={false}>
                      {bucket.metadata.reference ? (
                        <EuiBadge color="hollow">
                          <EuiLink
                            href={bucket.metadata.reference}
                            target="_blank"
                            external
                            color="text"
                          >
                            {bucket.technique_id}
                          </EuiLink>
                        </EuiBadge>
                      ) : (
                        <EuiBadge color="hollow">{bucket.technique_id}</EuiBadge>
                      )}
                    </EuiFlexItem>
                    {bucket.metadata.tactic_name ? (
                      <EuiFlexItem grow={false}>
                        <EuiBadge color="default">{bucket.metadata.tactic_name}</EuiBadge>
                      </EuiFlexItem>
                    ) : null}
                    <EuiFlexItem grow={false}>
                      <EuiToolTip
                        content={
                          bucket.coverage_recommendation === 'enable_existing' &&
                          bucket.matching_disabled_rule_ids?.length
                            ? i18n.translate(
                                'xpack.securitySolution.threatIntelligence.app.techniqueEnableExistingTooltip',
                                {
                                  defaultMessage:
                                    'Enable existing rule(s): {ruleIds}. Do not create a duplicate.',
                                  values: {
                                    ruleIds: bucket.matching_disabled_rule_ids.join(', '),
                                  },
                                }
                              )
                            : bucket.coverage_recommendation === 'covered'
                            ? i18n.translate(
                                'xpack.securitySolution.threatIntelligence.app.techniqueCoveredTooltip',
                                {
                                  defaultMessage:
                                    'Covered by {count, plural, one {# enabled rule} other {# enabled rules}}',
                                  values: { count: bucket.matching_rule_count },
                                }
                              )
                            : i18n.translate(
                                'xpack.securitySolution.threatIntelligence.app.techniqueUncoveredTooltip',
                                {
                                  defaultMessage:
                                    'No matching Detection Engine rule — consider creating coverage',
                                }
                              )
                        }
                      >
                        <EuiBadge color={COVERAGE_BADGE_COLOR(bucket.coverage_recommendation)}>
                          {bucket.coverage_recommendation === 'enable_existing'
                            ? i18n.translate(
                                'xpack.securitySolution.threatIntelligence.app.techniqueEnableExistingBadge',
                                {
                                  defaultMessage: 'Enable existing ({count})',
                                  values: { count: bucket.matching_disabled_rule_count },
                                }
                              )
                            : bucket.coverage_recommendation === 'covered'
                            ? i18n.translate(
                                'xpack.securitySolution.threatIntelligence.app.techniqueCoveredBadge',
                                {
                                  defaultMessage: 'Covered ({count})',
                                  values: { count: bucket.matching_rule_count },
                                }
                              )
                            : i18n.translate(
                                'xpack.securitySolution.threatIntelligence.app.techniqueUncoveredBadge',
                                {
                                  defaultMessage: 'Uncovered',
                                }
                              )}
                        </EuiBadge>
                      </EuiToolTip>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="s" color="subdued" textAlign="right">
                    <FormattedMessage
                      id="xpack.securitySolution.threatIntelligence.app.techniqueReportCount"
                      defaultMessage="{count, plural, one {# report} other {# reports}}"
                      values={{ count: bucket.report_count }}
                    />
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiProgress value={bucket.report_count} max={max || 1} size="xs" color="primary" />
            </div>
          ))}
        </div>
      )}
    </EuiPanel>
  );
};

/**
 * Lightweight SVG radar of the top threat categories. The previous bar
 * chart implementation lives below as `CategoryBreakdown`; this radar
 * complements it (categories as axes, magnitude as polygon distance) to
 * give the dashboard the "Threat Radar" panel the bespoke prototype had.
 */
const ThreatRadar: React.FC<{ buckets: DashboardOverviewResponse['by_category'] }> = ({
  buckets,
}) => {
  const radarBuckets = useMemo(
    () => buckets.filter((b) => b.category !== '<unknown>').slice(0, 8),
    [buckets]
  );
  const max = radarBuckets[0]?.report_count ?? 0;
  const size = OVERVIEW_PANEL_CONTENT_HEIGHT;
  const center = size / 2;
  const radius = size / 2 - 36;
  const ringCount = 4;

  const points = radarBuckets.map((bucket, idx) => {
    const angle = (Math.PI * 2 * idx) / radarBuckets.length - Math.PI / 2;
    const magnitude = max > 0 ? bucket.report_count / max : 0;
    const x = center + Math.cos(angle) * radius * magnitude;
    const y = center + Math.sin(angle) * radius * magnitude;
    const labelX = center + Math.cos(angle) * (radius + 18);
    const labelY = center + Math.sin(angle) * (radius + 18);
    return {
      category: bucket.category,
      count: bucket.report_count,
      angle,
      x,
      y,
      labelX,
      labelY,
    };
  });

  return (
    <EuiPanel hasBorder paddingSize="m">
      <PanelHeader
        title={i18n.translate('xpack.securitySolution.threatIntelligence.app.threatRadarTitle', {
          defaultMessage: 'Threat radar',
        })}
        description={i18n.translate(
          'xpack.securitySolution.threatIntelligence.app.threatRadarDescription',
          {
            defaultMessage: 'Category magnitude across the current filter set',
          }
        )}
      />
      {radarBuckets.length === 0 ? (
        <EuiText size="s" color="subdued">
          {i18n.translate('xpack.securitySolution.threatIntelligence.app.emptyState', {
            defaultMessage: 'No data',
          })}
        </EuiText>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={i18n.translate(
              'xpack.securitySolution.threatIntelligence.app.threatRadarAriaLabel',
              {
                defaultMessage: 'Threat radar chart',
              }
            )}
          >
            {Array.from({ length: ringCount }, (_, ringIdx) => {
              const r = (radius * (ringIdx + 1)) / ringCount;
              return (
                <circle
                  key={`ring-${ringIdx}`}
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  stroke="var(--eui-color-lightShade, #404040)"
                  strokeWidth={1}
                />
              );
            })}
            {points.map((point) => {
              const axisX = center + Math.cos(point.angle) * radius;
              const axisY = center + Math.sin(point.angle) * radius;
              return (
                <line
                  key={`axis-${point.category}`}
                  x1={center}
                  y1={center}
                  x2={axisX}
                  y2={axisY}
                  stroke="var(--eui-color-lightShade, #404040)"
                  strokeWidth={1}
                />
              );
            })}
            <polygon
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(0, 119, 204, 0.25)"
              stroke="var(--eui-color-primary, #0077CC)"
              strokeWidth={2}
            />
            {points.map((point) => (
              <circle
                key={`dot-${point.category}`}
                cx={point.x}
                cy={point.y}
                r={3}
                fill="var(--eui-color-primary, #0077CC)"
              >
                <title>{`${point.category}: ${point.count}`}</title>
              </circle>
            ))}
            {points.map((point) => (
              <text
                key={`label-${point.category}`}
                x={point.labelX}
                y={point.labelY}
                fontSize={10}
                fill="var(--eui-color-darkShade, #98a2b3)"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {point.category}
              </text>
            ))}
          </svg>
        </div>
      )}
    </EuiPanel>
  );
};

/**
 * Scatter-style activity timeline. Each timeline bucket gets a column;
 * within the column each severity row gets a single dot sized
 * proportionally to that severity's article count for the bucket. Keeps
 * the temporal-density-by-severity story the bespoke prototype's
 * scatter view conveys without bringing in a charting dependency.
 */
const ActivityTimeline: React.FC<{
  buckets: DashboardOverviewResponse['severity_timeline'];
}> = ({ buckets }) => {
  const { euiTheme } = useEuiTheme();
  const rowOrder: SeverityLevel[] = ['critical', 'high', 'medium', 'low'];
  const maxCount = useMemo(() => {
    let max = 0;
    for (const bucket of buckets) {
      for (const severity of rowOrder) {
        if (bucket[severity] > max) max = bucket[severity];
      }
    }
    return max;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets]);

  return (
    <EuiPanel hasBorder paddingSize="m">
      <PanelHeader
        title={i18n.translate('xpack.securitySolution.threatIntelligence.app.timelineTitle', {
          defaultMessage: 'Activity timeline',
        })}
        description={i18n.translate(
          'xpack.securitySolution.threatIntelligence.app.timelineDescription',
          {
            defaultMessage: 'Articles per bucket, plotted by severity',
          }
        )}
      />
      {buckets.length === 0 ? (
        <EuiText size="s" color="subdued">
          {i18n.translate('xpack.securitySolution.threatIntelligence.app.emptyState', {
            defaultMessage: 'No data',
          })}
        </EuiText>
      ) : (
        <div style={{ display: 'flex', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontSize: 10,
              color: euiTheme.colors.darkShade,
              height: 140,
              paddingTop: 4,
              paddingBottom: 4,
            }}
          >
            {rowOrder.map((severity) => (
              <span key={`label-${severity}`}>{severity.toUpperCase()}</span>
            ))}
          </div>
          <div style={{ flex: 1, position: 'relative', height: 140 }}>
            <EuiFlexGroup gutterSize="xs" responsive={false} style={{ height: '100%' }}>
              {buckets.map((bucket) => (
                <EuiFlexItem key={bucket.bucket}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateRows: `repeat(${rowOrder.length}, 1fr)`,
                      height: '100%',
                      position: 'relative',
                    }}
                    title={`${bucket.bucket}\nCritical: ${bucket.critical}\nHigh: ${bucket.high}\nMedium: ${bucket.medium}\nLow: ${bucket.low}`}
                  >
                    {rowOrder.map((severity) => {
                      const count = bucket[severity];
                      if (count === 0) {
                        return <div key={`${bucket.bucket}-${severity}`} />;
                      }
                      const ratio = maxCount === 0 ? 0 : count / maxCount;
                      const diameter = 4 + Math.round(ratio * 10);
                      return (
                        <div
                          key={`${bucket.bucket}-${severity}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <span
                            style={{
                              width: diameter,
                              height: diameter,
                              borderRadius: '50%',
                              background: SEVERITY_HEX[severity],
                              boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
            <EuiFlexGroup
              gutterSize="xs"
              responsive={false}
              style={{ marginTop: 6, fontSize: 10, color: euiTheme.colors.darkShade }}
            >
              {buckets.map((bucket, idx) => (
                <EuiFlexItem key={`xlabel-${bucket.bucket}`}>
                  <span style={{ textAlign: 'center' }}>
                    {idx === 0
                      ? i18n.translate(
                          'xpack.securitySolution.threatIntelligence.app.timelineFirstBucket',
                          { defaultMessage: 'Oldest' }
                        )
                      : idx === buckets.length - 1
                      ? i18n.translate(
                          'xpack.securitySolution.threatIntelligence.app.timelineLastBucket',
                          { defaultMessage: 'Now' }
                        )
                      : ''}
                  </span>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </div>
        </div>
      )}
    </EuiPanel>
  );
};

const EnvironmentImpact: React.FC<{
  impact: DashboardOverviewResponse['environment_impact'];
  totalReports: number;
  onHighlightReport: (reportId: string) => void;
}> = ({ impact, totalReports, onHighlightReport }) => {
  const { euiTheme } = useEuiTheme();
  const { total_hits, layer_1_hits, layer_2_hits, reports_with_hits, top_reports } = impact;
  const layer1Share = total_hits > 0 ? layer_1_hits / total_hits : 0;
  const layer2Share = total_hits > 0 ? layer_2_hits / total_hits : 0;

  return (
    <EuiPanel hasBorder paddingSize="m">
      <PanelHeader
        title={i18n.translate('xpack.securitySolution.threatIntelligence.app.envImpactTitle', {
          defaultMessage: 'Environment impact',
        })}
        description={i18n.translate(
          'xpack.securitySolution.threatIntelligence.app.envImpactDescription',
          {
            defaultMessage:
              'Detection Engine alerts attributed to ingested reports via IOC indicator match (Layer 1) or overlapping ATT&CK techniques (Layer 2). Counts refresh hourly.',
          }
        )}
      />
      {total_hits === 0 ? (
        <EuiText size="s" color="subdued">
          {i18n.translate('xpack.securitySolution.threatIntelligence.app.envImpactEmpty', {
            defaultMessage:
              'No correlated alerts in the selected time range. Reports need extracted IOCs or behaviors before the hourly provenance backfill can attribute hits.',
          })}
        </EuiText>
      ) : (
        <>
          <EuiFlexGroup gutterSize="m" responsive={false} alignItems="flexEnd">
            <EuiFlexItem grow={2}>
              <EuiStat
                title={total_hits.toLocaleString()}
                titleSize="m"
                description={i18n.translate(
                  'xpack.securitySolution.threatIntelligence.app.envHits',
                  {
                    defaultMessage: 'Correlated alert hits',
                  }
                )}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={3}>
              <EuiText size="xs" color="subdued">
                <FormattedMessage
                  id="xpack.securitySolution.threatIntelligence.app.envReportsWithHits"
                  defaultMessage="{reportsWithHits, plural, one {# report} other {# reports}} with hits of {totalReports, plural, one {# report} other {# reports}} in scope"
                  values={{ reportsWithHits: reports_with_hits, totalReports }}
                />
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="m" />
          <EuiText size="xs">
            <strong>
              {i18n.translate('xpack.securitySolution.threatIntelligence.app.envLayerBreakdown', {
                defaultMessage: 'Hit mix by detection layer',
              })}
            </strong>
          </EuiText>
          <EuiSpacer size="xs" />
          <div
            aria-hidden
            style={{
              display: 'flex',
              height: 10,
              borderRadius: euiTheme.size.xs,
              overflow: 'hidden',
              background: euiTheme.colors.lightestShade,
            }}
          >
            {layer_1_hits > 0 ? (
              <div
                style={{
                  width: `${layer1Share * 100}%`,
                  background: euiTheme.colors.primary,
                }}
              />
            ) : null}
            {layer_2_hits > 0 ? (
              <div
                style={{
                  width: `${layer2Share * 100}%`,
                  background: euiTheme.colors.accent,
                }}
              />
            ) : null}
          </div>
          <EuiSpacer size="xs" />
          <EuiFlexGroup gutterSize="m" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center">
                <EuiFlexItem grow={false}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: euiTheme.colors.primary,
                      display: 'inline-block',
                    }}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued">
                    {i18n.translate('xpack.securitySolution.threatIntelligence.app.envL1Legend', {
                      defaultMessage: 'Layer 1 — IOC match ({count, number})',
                      values: { count: layer_1_hits },
                    })}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center">
                <EuiFlexItem grow={false}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: euiTheme.colors.accent,
                      display: 'inline-block',
                    }}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued">
                    {i18n.translate('xpack.securitySolution.threatIntelligence.app.envL2Legend', {
                      defaultMessage: 'Layer 2 — ATT&CK overlap ({count, number})',
                      values: { count: layer_2_hits },
                    })}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
          {top_reports.length > 0 ? (
            <>
              <EuiHorizontalRule margin="m" />
              <EuiTitle size="xxs">
                <h4>
                  {i18n.translate('xpack.securitySolution.threatIntelligence.app.envTopReports', {
                    defaultMessage: 'Top reports by environment hits',
                  })}
                </h4>
              </EuiTitle>
              <EuiSpacer size="s" />
              <div
                style={{
                  maxHeight: OVERVIEW_PANEL_CONTENT_HEIGHT - 120,
                  overflowY: 'auto',
                }}
              >
                {top_reports.map((report) => (
                  <div key={report.report_id} style={{ marginBottom: 10 }}>
                    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                      <EuiFlexItem>
                        <EuiLink
                          onClick={() => onHighlightReport(report.report_id)}
                          data-test-subj={`threatIntelEnvImpactReport-${report.report_id}`}
                        >
                          <span
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {report.title}
                          </span>
                        </EuiLink>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiBadge color="hollow">
                          {report.environment_hits_total.toLocaleString()}
                        </EuiBadge>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    {(report.layer_1_hits > 0 || report.layer_2_hits > 0) && (
                      <EuiText size="xs" color="subdued">
                        {i18n.translate(
                          'xpack.securitySolution.threatIntelligence.app.envReportLayerSplit',
                          {
                            defaultMessage: 'L1 {layer1} · L2 {layer2}',
                            values: {
                              layer1: report.layer_1_hits.toLocaleString(),
                              layer2: report.layer_2_hits.toLocaleString(),
                            },
                          }
                        )}
                      </EuiText>
                    )}
                  </div>
                ))}
              </div>
              <EuiText size="xs" color="subdued">
                {i18n.translate('xpack.securitySolution.threatIntelligence.app.envTopReportsHint', {
                  defaultMessage: 'Select a report to highlight it in the article feed above.',
                })}
              </EuiText>
            </>
          ) : null}
        </>
      )}
    </EuiPanel>
  );
};
