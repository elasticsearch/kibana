/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  DETECTION_ACTIONABILITY_LEVELS,
  REPORT_SORT_OPTIONS,
  SEARCH_REPORTS_API_PATH,
  SEVERITY_LEVELS,
  SOURCE_TYPES,
  THREAT_CATEGORIES,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  THREAT_REGIONS,
  type DetectionActionability,
  type ReportSortBy,
  type SeverityLevel,
  type SourceType,
  type ThreatCategory,
  type ThreatRegion,
} from '../../../common/threat_intelligence/hub';
import { buildSearchReportsUiHints, withUiHints } from '../../../common/threat_intelligence/hub';
import { searchReports } from '../services';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import type { RouteRegistrationDeps } from '.';

const enumLiterals = <T extends string>(values: readonly T[]): string => values.join(', ');

const searchReportsBodySchema = schema.object({
  query: schema.string({ minLength: 1 }),
  size: schema.maybe(schema.number({ min: 1, max: 50 })),
  source_types: schema.maybe(
    schema.arrayOf(
      schema.string({
        validate: (value) =>
          (SOURCE_TYPES as readonly string[]).includes(value)
            ? undefined
            : `must be one of: ${enumLiterals(SOURCE_TYPES)}`,
      })
    )
  ),
  min_severity: schema.maybe(
    schema.string({
      validate: (value) =>
        (SEVERITY_LEVELS as readonly string[]).includes(value)
          ? undefined
          : `must be one of: ${enumLiterals(SEVERITY_LEVELS)}`,
    })
  ),
  time_range: schema.maybe(
    schema.object({
      from: schema.string(),
      to: schema.string(),
    })
  ),
  categories: schema.maybe(
    schema.arrayOf(
      schema.string({
        validate: (value) =>
          (THREAT_CATEGORIES as readonly string[]).includes(value)
            ? undefined
            : `must be one of: ${enumLiterals(THREAT_CATEGORIES)}`,
      })
    )
  ),
  regions: schema.maybe(
    schema.arrayOf(
      schema.string({
        validate: (value) =>
          (THREAT_REGIONS as readonly string[]).includes(value)
            ? undefined
            : `must be one of: ${enumLiterals(THREAT_REGIONS)}`,
      })
    )
  ),
  detection_actionability: schema.maybe(
    schema.arrayOf(
      schema.string({
        validate: (value) =>
          (DETECTION_ACTIONABILITY_LEVELS as readonly string[]).includes(value)
            ? undefined
            : `must be one of: ${enumLiterals(DETECTION_ACTIONABILITY_LEVELS)}`,
      })
    )
  ),
  sort_by: schema.maybe(
    schema.string({
      validate: (value) =>
        (REPORT_SORT_OPTIONS as readonly string[]).includes(value)
          ? undefined
          : `must be one of: ${enumLiterals(REPORT_SORT_OPTIONS)}`,
    })
  ),
});

/**
 * Public route exposing the `search_reports` domain action — hybrid
 * semantic + BM25 search over `.kibana-threat-reports-*`. This is the
 * canonical execution surface; the agent calls it via
 * `execute_workflow_step` with `kibana-request`. The Agent Builder tool
 * wrapper delegates to the same `searchReports` service.
 */
export const registerSearchReportsRoute = ({
  router,
  logger,
  getSpacesService,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: SEARCH_REPORTS_API_PATH,
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
        validate: { request: { body: searchReportsBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        try {
          const searchParams = {
            query: request.body.query,
            size: request.body.size,
            source_types: request.body.source_types as SourceType[] | undefined,
            min_severity: request.body.min_severity as SeverityLevel | undefined,
            time_range: request.body.time_range,
            categories: request.body.categories as ThreatCategory[] | undefined,
            regions: request.body.regions as ThreatRegion[] | undefined,
            detection_actionability: request.body.detection_actionability as
              | DetectionActionability[]
              | undefined,
            sort_by: request.body.sort_by as ReportSortBy | undefined,
          };
          const result = await searchReports(esClient, logger, spaceId, searchParams);
          const uiHints = buildSearchReportsUiHints({
            params: searchParams,
            reports: result.reports,
            total: result.total,
          });
          return response.ok({
            body: withUiHints({ body: result, uiHints }),
          });
        } catch (err) {
          logger.warn(`search_reports failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: {
              message:
                `Failed to search threat reports: ${(err as Error).message}. ` +
                `If the error mentions inference, the cluster may be missing a default ` +
                `text_embedding endpoint — see the plugin README for setup.`,
            },
          });
        }
      }
    );
};
