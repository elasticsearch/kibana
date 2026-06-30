/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { ElasticsearchClient } from '@kbn/core/server';
import {
  DASHBOARD_OVERVIEW_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  THREAT_REPORTS_INDEX_PATTERN,
  type DashboardOverviewResponse,
  type SeverityLevel,
  type ThreatCategory,
  type ThreatRegion,
} from '../../../common/threat_intelligence/hub';
import { buildSpaceFilterTerms, resolveCurrentSpaceId } from '../lib/space_filter';
import {
  buildTechniqueCountsFromBehaviorsAgg,
  buildTechniqueCountsFromTtpsAgg,
  mergeTechniqueReportCounts,
  parseTechniqueCountsFromBehaviors,
  parseTechniqueCountsFromTtps,
  topTechniqueBuckets,
  type EsTechniqueBehaviorBucket,
  type EsTechniqueTtpBucket,
} from '../lib/technique_report_counts';
import {
  collectRuleCoverageByTechnique,
  coverageSummaryForTechniques,
  enrichTechniquesWithRuleCoverage,
} from '../services/coverage_gap';
import { fetchLatestAdvisoryForDashboard } from '../lib/fetch_latest_advisory';
import type { RouteRegistrationDeps } from '.';

const DEFAULT_LOOKBACK_DAYS = 7;
// Query strings serialize single-element arrays as a bare value (e.g.
// `?regions=south-asia`), so accept either a string or an array and normalize
// to an array in the handler.
const stringOrArraySchema = schema.maybe(
  schema.oneOf([schema.string(), schema.arrayOf(schema.string())])
);

const overviewQuerySchema = schema.object({
  from: schema.maybe(schema.string()),
  to: schema.maybe(schema.string()),
  regions: stringOrArraySchema,
  categories: stringOrArraySchema,
});

const toArray = (value: string | string[] | undefined): string[] => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

interface BucketCount<TKey = string> {
  key: TKey;
  doc_count: number;
}
interface SeverityBucket extends BucketCount<number> {
  key_as_string: string;
  by_severity?: { buckets: BucketCount[] };
}
interface ReportsAggregations {
  by_category?: { buckets: BucketCount[] };
  by_region?: { buckets: BucketCount[] };
  by_severity?: { buckets: BucketCount[] };
  by_time?: { buckets: SeverityBucket[] };
  top_techniques_from_behaviors?: {
    techniques: { buckets: EsTechniqueBehaviorBucket[] };
  };
  top_techniques_from_ttps?: { buckets: EsTechniqueTtpBucket[] };
  environment_hits_total?: { value: number };
  layer_1_total?: { value: number };
  layer_2_total?: { value: number };
  distinct_source_count?: { value: number };
  recent_articles?: {
    hits: {
      hits: Array<{
        _id: string;
        _source: {
          '@timestamp'?: string;
          source?: { name?: string; url?: string };
          content?: { title?: string };
          severity?: { level?: SeverityLevel };
          extracted?: { categories?: ThreatCategory[] };
          geography?: { regions?: ThreatRegion[] };
          provenance?: { environment_hits_total?: number };
        };
      }>;
    };
  };
  reports_with_hits_filter?: { doc_count: number };
  top_reports_with_hits?: {
    hits: {
      hits: Array<{
        _id: string;
        _source: {
          content?: { title?: string };
          provenance?: {
            environment_hits_total?: number;
            environment_hits?: {
              layer_1_ioc_match?: number;
              layer_2_behavioral?: number;
            };
          };
        };
      }>;
    };
  };
}

const fetchReportsOverview = async (
  esClient: ElasticsearchClient,
  from: string,
  to: string,
  filters: Array<Record<string, unknown>>
) => {
  return esClient.search({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size: 0,
    track_total_hits: true,
    query: {
      bool: {
        filter: [{ range: { '@timestamp': { gte: from, lte: to } } }, ...filters],
      },
    },
    aggs: {
      by_category: {
        terms: { field: 'extracted.categories', size: 20, missing: '<unknown>' },
      },
      by_region: {
        terms: { field: 'geography.regions', size: 12, missing: '<unknown>' },
      },
      by_severity: {
        terms: { field: 'severity.level', size: 4 },
      },
      by_time: {
        date_histogram: {
          field: '@timestamp',
          fixed_interval: '1d',
          format: 'yyyy-MM-dd',
        },
        aggs: {
          by_severity: { terms: { field: 'severity.level', size: 4 } },
        },
      },
      top_techniques_from_behaviors: buildTechniqueCountsFromBehaviorsAgg(15),
      top_techniques_from_ttps: buildTechniqueCountsFromTtpsAgg(15),
      environment_hits_total: {
        sum: { field: 'provenance.environment_hits_total' },
      },
      layer_1_total: {
        sum: { field: 'provenance.environment_hits.layer_1_ioc_match' },
      },
      layer_2_total: {
        sum: { field: 'provenance.environment_hits.layer_2_behavioral' },
      },
      distinct_source_count: {
        cardinality: { field: 'source.name' },
      },
      recent_articles: {
        top_hits: {
          size: 12,
          sort: [{ '@timestamp': { order: 'desc' } }],
          _source: [
            '@timestamp',
            'source.name',
            'source.url',
            'content.title',
            'severity.level',
            'extracted.categories',
            'geography.regions',
            'provenance.environment_hits_total',
          ],
        },
      },
      reports_with_hits_filter: {
        filter: { range: { 'provenance.environment_hits_total': { gt: 0 } } },
      },
      top_reports_with_hits: {
        top_hits: {
          size: 5,
          sort: [{ 'provenance.environment_hits_total': { order: 'desc', missing: '_last' } }],
          _source: [
            'content.title',
            'provenance.environment_hits_total',
            'provenance.environment_hits.layer_1_ioc_match',
            'provenance.environment_hits.layer_2_behavioral',
          ],
        },
      },
    },
  });
};

/**
 * Public route that powers the visual dashboard. Returns the aggregations
 * the UI panels need in a single response so the dashboard renders without
 * fanning out to multiple endpoints. Gated on the `read` tier of the
 * `threatIntelligence` Kibana feature.
 */
export const registerDashboardOverviewRoute = ({
  router,
  logger,
  getSpacesService,
}: RouteRegistrationDeps): void => {
  router.versioned
    .get({
      path: DASHBOARD_OVERVIEW_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.read],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: { query: overviewQuerySchema },
        },
      },
      async (context, request, response) => {
        const now = Date.now();
        const from =
          request.query.from ??
          new Date(now - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const to = request.query.to ?? new Date(now).toISOString();

        const currentSpaceId = resolveCurrentSpaceId(getSpacesService(), request);
        const filters: Array<Record<string, unknown>> = [buildSpaceFilterTerms(currentSpaceId)];
        const regions = toArray(request.query.regions);
        const categories = toArray(request.query.categories);
        if (regions.length) {
          filters.push({ terms: { 'geography.regions': regions } });
        }
        if (categories.length) {
          filters.push({ terms: { 'extracted.categories': categories } });
        }

        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const savedObjectsClient = core.savedObjects.client;

        try {
          const reportsResponse = await fetchReportsOverview(esClient, from, to, filters);

          const totalReports =
            typeof reportsResponse.hits.total === 'number'
              ? reportsResponse.hits.total
              : reportsResponse.hits.total?.value ?? 0;
          const aggs = reportsResponse.aggregations as ReportsAggregations | undefined;

          const severityCount = (level: SeverityLevel): number =>
            (aggs?.by_severity?.buckets ?? []).find((b) => b.key === level)?.doc_count ?? 0;

          const byCategory = (aggs?.by_category?.buckets ?? []).map((b) => ({
            category: b.key as ThreatCategory | '<unknown>',
            report_count: b.doc_count,
          }));
          const byRegion = (aggs?.by_region?.buckets ?? []).map((b) => ({
            region: b.key as ThreatRegion | '<unknown>',
            report_count: b.doc_count,
            // "Affects You" is a coarse heuristic for v1 — any region with at
            // least one environment hit is flagged red on the dashboard. The
            // PRD's richer location matcher is deferred to a follow-up.
            affects_you: b.doc_count > 0,
          }));

          const severityTimeline = (aggs?.by_time?.buckets ?? []).map((bucket) => {
            const counts: Record<SeverityLevel, number> = {
              low: 0,
              medium: 0,
              high: 0,
              critical: 0,
            };
            for (const sev of bucket.by_severity?.buckets ?? []) {
              if (
                sev.key === 'low' ||
                sev.key === 'medium' ||
                sev.key === 'high' ||
                sev.key === 'critical'
              ) {
                counts[sev.key] = sev.doc_count;
              }
            }
            return {
              bucket: bucket.key_as_string,
              low: counts.low,
              medium: counts.medium,
              high: counts.high,
              critical: counts.critical,
            };
          });

          const topTechniqueRows = topTechniqueBuckets(
            mergeTechniqueReportCounts(
              parseTechniqueCountsFromBehaviors(
                aggs?.top_techniques_from_behaviors?.techniques?.buckets ?? []
              ),
              parseTechniqueCountsFromTtps(aggs?.top_techniques_from_ttps?.buckets ?? [])
            ),
            15
          );

          let topTechniques = enrichTechniquesWithRuleCoverage(topTechniqueRows, new Map());
          try {
            const coverageByTechnique = await collectRuleCoverageByTechnique(savedObjectsClient);
            topTechniques = enrichTechniquesWithRuleCoverage(topTechniqueRows, coverageByTechnique);
          } catch (coverageErr) {
            logger.warn(
              `dashboard_overview rule coverage walk failed: ${(coverageErr as Error).message}`
            );
          }

          const coverageSummary = coverageSummaryForTechniques(topTechniques);

          const environmentHitsTotal = aggs?.environment_hits_total?.value ?? 0;
          const layer1Total = aggs?.layer_1_total?.value ?? 0;
          const layer2Total = aggs?.layer_2_total?.value ?? 0;
          const distinctSourceCount = Math.round(aggs?.distinct_source_count?.value ?? 0);

          const reportsWithHits = aggs?.reports_with_hits_filter?.doc_count ?? 0;
          const topReports = (aggs?.top_reports_with_hits?.hits.hits ?? [])
            .map((hit) => ({
              report_id: hit._id,
              title: hit._source.content?.title ?? '(untitled)',
              environment_hits_total: hit._source.provenance?.environment_hits_total ?? 0,
              layer_1_hits: hit._source.provenance?.environment_hits?.layer_1_ioc_match ?? 0,
              layer_2_hits: hit._source.provenance?.environment_hits?.layer_2_behavioral ?? 0,
            }))
            .filter((report) => report.environment_hits_total > 0);

          const recentArticles = (aggs?.recent_articles?.hits.hits ?? []).map((hit) => ({
            report_id: hit._id,
            title: hit._source.content?.title ?? '(untitled)',
            source_name: hit._source.source?.name ?? '<unknown>',
            ...(hit._source.source?.url ? { source_url: hit._source.source.url } : {}),
            severity: (hit._source.severity?.level ?? 'medium') as SeverityLevel,
            '@timestamp': hit._source['@timestamp'] ?? '',
            environment_hits_total: hit._source.provenance?.environment_hits_total ?? 0,
            categories: hit._source.extracted?.categories ?? [],
            regions: hit._source.geography?.regions ?? [],
          }));

          const reportIdsWithEnvHits = new Set<string>([
            ...topReports.map((report) => report.report_id),
            ...recentArticles
              .filter((article) => article.environment_hits_total > 0)
              .map((article) => article.report_id),
          ]);
          const scopedReportIds = [
            ...new Set([
              ...recentArticles.map((article) => article.report_id),
              ...topReports.map((report) => report.report_id),
            ]),
          ];

          const latestAdvisory = await fetchLatestAdvisoryForDashboard({
            esClient,
            spaceId: currentSpaceId,
            from,
            to,
            regions,
            categories,
            reportIdsWithEnvHits,
            scopedReportIds,
          });

          const body: DashboardOverviewResponse = {
            time_range_label: `${from} → ${to}`,
            stats_ribbon: {
              total_reports: totalReports,
              critical_reports: severityCount('critical'),
              high_reports: severityCount('high'),
              affects_you_total: environmentHitsTotal,
              distinct_source_count: distinctSourceCount,
            },
            by_category: byCategory,
            by_region: byRegion,
            severity_timeline: severityTimeline,
            top_techniques: topTechniques,
            coverage_summary: coverageSummary,
            recent_articles: recentArticles,
            environment_impact: {
              total_hits: environmentHitsTotal,
              layer_1_hits: layer1Total,
              layer_2_hits: layer2Total,
              reports_with_hits: reportsWithHits,
              top_reports: topReports,
            },
            ...(latestAdvisory ? { latest_advisory: latestAdvisory } : {}),
          };

          return response.ok({ body });
        } catch (err) {
          logger.warn(`dashboard_overview failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to compute dashboard overview: ${(err as Error).message}` },
          });
        }
      }
    );
};
