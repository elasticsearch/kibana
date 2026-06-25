/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, KibanaResponseFactory } from '@kbn/core/server';
import type { DataRequestHandlerContext } from '@kbn/data-plugin/server';
import type { RequestHandlerContext } from '@kbn/core-http-request-handler-context-server';
import type { ECSMapping } from '@kbn/osquery-io-ts-types';
import type { AuditEvent } from '@kbn/core-security-server';

import type { Filter } from '@kbn/es-query';
import { buildQueryFromFilters, isFilters } from '@kbn/es-query';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { OSQUERY_INTEGRATION_NAME } from '../../../common';
import { getQueryFilter } from '../../utils/build_query';
import { createInternalSavedObjectsClientForSpaceId } from '../../utils/get_internal_saved_object_client';
import { exportResultsToStream } from '../../lib/export_results_to_stream';
import { createFormatter } from '../../lib/format_results';
import type { ExportFormat, ExportMetadata } from '../../lib/format_results';
import { getUserInfo } from '../../lib/get_user_info';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { OsqueryQueries } from '../../../common/search_strategy/osquery';
import { composeExportKuery } from '../../lib/compose_export_kuery';
import type { ExportRequestBody } from './export_request_body_schema';

export interface ExportRouteParams {
  /** KQL base filter (e.g. `action_id: "abc"` or `schedule_id: "x" AND ...`) */
  baseFilter: string;
  /** Metadata fields specific to this export type */
  metadata: Pick<ExportMetadata, 'action_id' | 'query' | 'execution_count'>;
  /** Filename prefix (e.g. `osquery-results-{id}` or `osquery-scheduled-results-{id}-{count}`) */
  fileNamePrefix: string;
  /**
   * ECS mapping from the originating action/saved query. Plumbed into the
   * row-flattener so the export surfaces the same ECS-mapped columns users
   * see in the UI.
   */
  ecsMapping?: ECSMapping;
}

export const createExportRouteHandler =
  (osqueryContext: OsqueryAppContext) =>
  async (
    context: RequestHandlerContext & DataRequestHandlerContext,
    request: KibanaRequest<unknown, { format: ExportFormat }, ExportRequestBody | null>,
    response: KibanaResponseFactory,
    params: ExportRouteParams
  ) => {
    const { baseFilter, metadata: routeMetadata, fileNamePrefix, ecsMapping } = params;
    const { format } = request.query;
    const kuery = request.body?.kuery;
    const agentIds = request.body?.agentIds;
    const esFilters = request.body?.esFilters;

    const logger = osqueryContext.logFactory.get('export_results');

    // Validate the KQL filter at the route boundary so invalid kuery surfaces
    // as a 400 before any ES round-trips. Compose the full filter string the
    // same way the factory will so validation matches execution. The composed
    // value is used only for validation here; the factory rebuilds it from
    // baseFilter/kuery/agentIds when issuing the search.
    const filterForValidation = composeExportKuery({ baseFilter, kuery, agentIds });

    try {
      getQueryFilter({ filter: filterForValidation });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn(`Invalid kuery in export request: ${message}`);

      return response.badRequest({
        body: { message: `Invalid kuery: ${message}` },
      });
    }

    // Validate esFilters at the route boundary — an invalid filter must NOT
    // fall through to an unfiltered export. Silently returning the full
    // dataset when the user asked for a narrowed one is a correctness hazard.
    let validatedEsFilters: Filter[] | undefined;
    if (esFilters?.length) {
      if (!isFilters(esFilters)) {
        return response.badRequest({
          body: {
            message: 'Invalid esFilters: not a valid filters array',
          },
        });
      }

      try {
        buildQueryFromFilters(esFilters, undefined);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);

        return response.badRequest({
          body: { message: `Invalid esFilters: ${message}` },
        });
      }

      validatedEsFilters = esFilters;
    }

    const coreContext = await context.core;

    // PIT lifecycle stays in route; data plugin search context does not expose PIT lifecycle (design D5).
    const esClient = coreContext.elasticsearch.client.asInternalUser;

    // Resolve integration namespaces and pass them to the factory for index resolution.
    // The factory (query.export_results.dsl.ts) handles buildIndexNameWithNamespace,
    // CCS prefixing, and tolerance flags — the route no longer builds the index string.
    let integrationNamespaces: string[] | undefined;

    if (osqueryContext?.service?.getIntegrationNamespaces) {
      const spaceScopedClient = await createInternalSavedObjectsClientForSpaceId(
        osqueryContext,
        request
      );
      const namespaceMap = await osqueryContext.service.getIntegrationNamespaces(
        [OSQUERY_INTEGRATION_NAME],
        spaceScopedClient,
        logger
      );

      const osqueryNamespaces = namespaceMap[OSQUERY_INTEGRATION_NAME];
      if (osqueryNamespaces && osqueryNamespaces.length > 0) {
        integrationNamespaces = osqueryNamespaces;
      }
    }

    const spaceId = osqueryContext?.service?.getActiveSpace
      ? (await osqueryContext.service.getActiveSpace(request))?.id ?? DEFAULT_SPACE_ID
      : DEFAULT_SPACE_ID;

    const auditLabels = {
      action_id: routeMetadata.action_id,
      format,
      ...(routeMetadata.execution_count != null
        ? { execution_count: routeMetadata.execution_count }
        : {}),
    };

    // Open PIT with the broad index pattern. Index resolution for per-namespace
    // scoping is the factory's responsibility; ES ignores the `index` in search
    // body when a PIT is provided, so the PIT scope is determined here.
    // ignore_unavailable mirrors query.all_results.dsl.ts.
    // If openPointInTime throws, there is no PIT to close — handle separately.
    let pitId: string;
    try {
      const pitResponse = await esClient.openPointInTime({
        index: `logs-${OSQUERY_INTEGRATION_NAME}.result*`,
        keep_alive: '5m',
        ignore_unavailable: true,
      });
      pitId = pitResponse.id;
    } catch (e) {
      const failureAuditEvent: AuditEvent = {
        message: 'Osquery export failed',
        event: {
          action: 'osquery_export',
          category: ['database'],
          type: ['access'],
          outcome: 'failure',
        },
        labels: auditLabels,
      };
      coreContext.security.audit.logger.log(failureAuditEvent);

      const message = e instanceof Error ? e.message : String(e);

      return response.customError({
        statusCode: (e as { statusCode?: number }).statusCode ?? 500,
        body: { message },
      });
    }

    const closePit = async (id: string) => {
      try {
        await esClient.closePointInTime({ id });
      } catch (e) {
        // An unclosed PIT holds cluster memory until keep_alive expires (5m).
        // Surface at warn so cluster-memory pressure is visible in ops dashboards.
        logger.warn(`Failed to close PIT ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    try {
      // Get user info for metadata
      const user = await getUserInfo({
        request,
        security: osqueryContext.security,
        logger,
      });

      const formatter = createFormatter(format);
      const timestamp = new Date().toISOString();
      // Strip characters that would break the quoted Content-Disposition filename token
      // (double-quotes, backslashes, and CR/LF). The fileNamePrefix may contain
      // user-supplied values such as scheduleId / actionId from URL params.
      const safePrefix = fileNamePrefix.replace(/["\\\r\n]/g, '_');
      const fileName = `${safePrefix}-${timestamp.replace(/[:.]/g, '-')}.${
        formatter.fileExtension
      }`;

      const csvColumnsForEmptyExport =
        format === 'csv' && ecsMapping
          ? (['agent.name', 'agent.id', ...Object.keys(ecsMapping)] as string[])
          : undefined;

      const searchContext = await context.search;

      const result = await exportResultsToStream({
        search: searchContext,
        pit: { id: pitId, keep_alive: '5m' },
        closePit,
        baseRequest: {
          factoryQueryType: OsqueryQueries.exportResults,
          baseFilter,
          kuery,
          agentIds,
          esFilters: validatedEsFilters,
          size: 1_000,
          ecsMapping,
          integrationNamespaces,
          spaceId,
        },
        formatter,
        metadata: {
          ...routeMetadata,
          timestamp,
          exported_by: user?.username ?? 'unknown',
          format,
          ...(csvColumnsForEmptyExport ? { csv_columns: csvColumnsForEmptyExport } : {}),
        },
        aborted$: request.events.aborted$,
        logger,
        ecsMapping,
      });

      // Check if we got an error (max results exceeded)
      if ('statusCode' in result) {
        return response.badRequest({
          body: { message: result.message },
        });
      }

      // Audit trail for data egress (no PII in application logs). Stream errors
      // are logged separately with action_id correlation. Use Core request context
      // (not deprecated plugins.security.audit).
      const auditEvent: AuditEvent = {
        message: 'Osquery export started',
        event: {
          action: 'osquery_export',
          category: ['database'],
          type: ['access'],
          outcome: 'unknown',
        },
        labels: auditLabels,
      };
      coreContext.security.audit.logger.log(auditEvent);

      return response.ok({
        body: result,
        headers: {
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Type': formatter.contentType,
        },
      });
    } catch (e) {
      await closePit(pitId);

      const failureAuditEvent: AuditEvent = {
        message: 'Osquery export failed',
        event: {
          action: 'osquery_export',
          category: ['database'],
          type: ['access'],
          outcome: 'failure',
        },
        labels: auditLabels,
      };
      coreContext.security.audit.logger.log(failureAuditEvent);

      const message = e instanceof Error ? e.message : String(e);

      return response.customError({
        statusCode: (e as { statusCode?: number }).statusCode ?? 500,
        body: { message },
      });
    }
  };
