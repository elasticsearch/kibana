/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition, ToolHandlerContext } from '@kbn/agent-builder-server/tools';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { Logger } from '@kbn/logging';
import type { CoreSetup } from '@kbn/core/server';
import type { CasesClient } from '../../client';
import type { CasesServerStartDependencies } from '../../types';
import { getCaseStepCommonDefinition } from '../../../common/workflows/steps/get_case';
import { getCasesStepCommonDefinition } from '../../../common/workflows/steps/get_cases';
import { findCasesStepCommonDefinition } from '../../../common/workflows/steps/find_cases';
import type { CasesFindRequest } from '../../../common/types/api';
import type { Case, RelatedCase } from '../../../common/types/domain';
import {
  enhanceCaseData,
  createResult,
  createErrorResponse,
  deduplicateCases,
  type CoreServices,
  type EnhancedCaseData,
} from './search_cases_helpers';
import {
  emitCaseAttachment,
  emitCasesAttachment,
  injectAttachmentIds,
  toCaseAttachmentData,
} from '../attachments/emit_attachments';
import { CASES_SOLUTION_CONTEXT_INSTRUCTION } from '../utils/tool_instructions';

const emitSearchAttachments = async (
  cases: EnhancedCaseData[],
  attachments: ToolHandlerContext['attachments']
): Promise<string[]> => {
  if (cases.length === 0) return [];
  if (cases.length === 1) {
    const id = await emitCaseAttachment(attachments, toCaseAttachmentData(cases[0], cases[0].url));
    return [id];
  }
  const id = await emitCasesAttachment(
    attachments,
    cases.map((c) => toCaseAttachmentData(c, c.url)),
    cases.length
  );
  return [id];
};

const casesSchema = z.object({
  mode: z
    .enum(['get', 'bulk_get', 'similar', 'by_alert', 'search'])
    .describe(
      'Required fields per mode:\n' +
        '- get: case_id\n' +
        '- bulk_get: case_ids (keep ≤10)\n' +
        '- similar: similar_to_case_id (+ optional page, perPage)\n' +
        '- by_alert: alert_ids (+ optional owner)\n' +
        '- search: owner (required) + optional search, severity, status, tags, assignees, reporters, category, from, to, searchFields, sortField, sortOrder, page, perPage'
    ),
  ...getCaseStepCommonDefinition.inputSchema.omit({ include_comments: true }).partial().shape,
  ...getCasesStepCommonDefinition.inputSchema.partial().shape,
  ...findCasesStepCommonDefinition.inputSchema.partial().shape,
  // Custom fields not in any step schema:
  similar_to_case_id: z
    .string()
    .optional()
    .describe(
      'Find cases similar to this case ID based on shared observables. Required for similar mode.'
    ),
  alert_ids: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Array of alert IDs to find cases containing these alerts. Required for by_alert mode.'
    ),
  // owner, assignees, from, to, search: descriptions inherited from step schemas
});

async function fetchCaseById(
  caseId: string,
  casesClient: CasesClient,
  request: KibanaRequest,
  coreServices: CoreServices,
  logger: Logger
): Promise<EnhancedCaseData> {
  const theCase = await casesClient.cases.get({
    id: caseId,
    includeComments: false,
  });

  return enhanceCaseData(theCase, request, coreServices, logger);
}

async function fetchCasesByAlertIds(
  alertIds: string[],
  casesClient: CasesClient,
  owner: string | undefined,
  logger: Logger
): Promise<Case[]> {
  const allRelatedCasesArrays = await Promise.all(
    alertIds.map(async (alertId) => {
      try {
        return await casesClient.cases.getCasesByAlertID({
          alertID: alertId,
          options: owner ? { owner } : {},
        });
      } catch (error) {
        logger.warn(`[Cases Tool] Failed to fetch cases for alert ID ${alertId}: ${error}`);
        return [];
      }
    })
  );

  const relatedCases: RelatedCase[] = deduplicateCases(allRelatedCasesArrays);

  if (relatedCases.length === 0) {
    return [];
  }

  const bulkResult = await casesClient.cases.bulkGet({
    ids: relatedCases.map((c) => c.id),
  });

  if (bulkResult.errors.length > 0) {
    logger.warn(
      `[Cases Tool] Failed to fetch full details for ${bulkResult.errors.length} case(s) by alert IDs`
    );
  }

  return bulkResult.cases;
}

function enhanceCases(
  cases: Case[],
  request: KibanaRequest,
  coreServices: CoreServices,
  logger: Logger
): EnhancedCaseData[] {
  return cases.map((theCase) => enhanceCaseData(theCase, request, coreServices, logger));
}

export const searchCasesTool = (
  coreSetup: CoreSetup<CasesServerStartDependencies>,
  getCasesClientFn: (request: KibanaRequest) => Promise<CasesClient>
): BuiltinToolDefinition<typeof casesSchema> => {
  return {
    id: platformCoreTools.cases,
    type: ToolType.builtin,
    description: `Read-only retrieval of Elastic cases (Security / Observability / Stack Management). For writes use \`platform.core.cases.manage\` (CRUD), \`platform.core.cases.attachments\` (comments, alerts, events, get_all), or \`platform.core.cases.observables\` (IOCs).

${CASES_SOLUTION_CONTEXT_INSTRUCTION}

Modes: \`get\`, \`bulk_get\`, \`similar\`, \`by_alert\`, \`search\`. See \`mode\` field for required inputs.

\`owner\` is required for \`search\` (other modes use specific identifiers instead). Never call this tool multiple times with different \`owner\` values — that's always a bug.

\`search\` mode returns one page; default \`perPage\` **10**, max **50**, paginate with \`page\` (1-indexed).

Returns metadata only; for comments/alert/event attachments call \`platform.core.cases.attachments\` mode \`get_all\`. Cases auto-render as structured attachments — emit \`<render_attachment id="..." />\` for each ID in \`attachment_ids\` and don't format markdown links to the case in your text.`,
    schema: casesSchema,
    handler: async (
      {
        mode,
        case_id,
        case_ids,
        similar_to_case_id,
        alert_ids,
        owner,
        from,
        to,
        search,
        searchFields,
        severity,
        sortField,
        sortOrder,
        status,
        tags,
        assignees,
        reporters,
        category,
        page,
        perPage,
      },
      { request, spaceId, logger, attachments }
    ) => {
      try {
        const [coreStart] = await coreSetup.getStartServices();
        const coreServices: CoreServices = { coreStart, spaceId };

        const casesClient = await getCasesClientFn(request);

        switch (mode) {
          case 'get': {
            if (!case_id) {
              return createErrorResponse(
                new Error('case_id is required for get mode'),
                '[Cases Tool] Missing required field',
                'Missing required field: case_id',
                logger
              );
            }
            logger.info(`[Cases Tool] Getting case by ID: ${case_id}`);
            const caseData = await fetchCaseById(
              case_id,
              casesClient,
              request,
              coreServices,
              logger
            );
            const singleAttachmentId = await emitCaseAttachment(
              attachments,
              toCaseAttachmentData(caseData, caseData.url)
            );
            return injectAttachmentIds(
              createResult([caseData], `Retrieved case: ${caseData.title}`),
              [singleAttachmentId]
            );
          }

          case 'bulk_get': {
            if (!case_ids || case_ids.length === 0) {
              return createErrorResponse(
                new Error('case_ids is required for bulk_get mode'),
                '[Cases Tool] Missing required field',
                'Missing required field: case_ids',
                logger
              );
            }
            const BULK_GET_LIMIT = 10;
            const ids = case_ids.slice(0, BULK_GET_LIMIT);
            const truncated = case_ids.length > BULK_GET_LIMIT;
            logger.info(`[Cases Tool] Bulk-getting ${ids.length} cases`);
            const bulkResult = await casesClient.cases.bulkGet({ ids });
            const enrichedCases = enhanceCases(bulkResult.cases, request, coreServices, logger);
            const bulkAttachmentIds = await emitSearchAttachments(enrichedCases, attachments);
            return injectAttachmentIds(
              createResult(
                enrichedCases,
                `Retrieved ${enrichedCases.length} case(s)${
                  truncated ? ` (first ${BULK_GET_LIMIT} of ${case_ids.length} requested)` : ''
                }${bulkResult.errors.length > 0 ? `, ${bulkResult.errors.length} error(s)` : ''}`
              ),
              bulkAttachmentIds
            );
          }

          case 'similar': {
            if (!similar_to_case_id) {
              return createErrorResponse(
                new Error('similar_to_case_id is required for similar mode'),
                '[Cases Tool] Missing required field',
                'Missing required field: similar_to_case_id',
                logger
              );
            }
            logger.info(`[Cases Tool] Finding cases similar to: ${similar_to_case_id}`);
            const similarResult = await casesClient.cases.similar(similar_to_case_id, {
              page: page ?? 1,
              perPage: perPage ?? 20,
            });
            const enrichedSimilar = enhanceCases(
              similarResult.cases,
              request,
              coreServices,
              logger
            );
            const similarAttachmentIds = await emitSearchAttachments(enrichedSimilar, attachments);
            return injectAttachmentIds(
              {
                results: [
                  {
                    type: 'other' as const,
                    data: { ...similarResult, cases: enrichedSimilar },
                  },
                ],
              },
              similarAttachmentIds
            );
          }

          case 'by_alert': {
            if (!alert_ids || alert_ids.length === 0) {
              return createErrorResponse(
                new Error('alert_ids is required for by_alert mode'),
                '[Cases Tool] Missing required field',
                'Missing required field: alert_ids',
                logger
              );
            }
            logger.info(`[Cases Tool] Querying cases by alert IDs: ${alert_ids.join(', ')}`);
            const cases = await fetchCasesByAlertIds(
              alert_ids,
              casesClient,
              owner as string | undefined,
              logger
            );

            if (cases.length === 0) {
              return createResult(
                [],
                `No cases found containing alert IDs: ${alert_ids.join(', ')}`
              );
            }

            const casesData = enhanceCases(cases, request, coreServices, logger);
            const alertAttachmentIds = await emitSearchAttachments(casesData, attachments);
            return injectAttachmentIds(
              createResult(
                casesData,
                `Found ${casesData.length} unique case(s) containing alert ID(s): ${alert_ids.join(
                  ', '
                )}`
              ),
              alertAttachmentIds
            );
          }

          case 'search': {
            if (!owner) {
              return createErrorResponse(
                new Error('owner is required for search mode'),
                '[Cases Tool] Missing required field',
                'Missing required field: owner is required for search mode',
                logger
              );
            }
            // Single page; agent paginates explicitly via `page` / `perPage`.
            const requestedPerPage = Math.min(perPage ?? 10, 50);
            const requestedPage = page ?? 1;
            const searchParams: CasesFindRequest = {
              sortField: (sortField as CasesFindRequest['sortField']) ?? 'updatedAt',
              sortOrder: sortOrder ?? 'desc',
              perPage: requestedPerPage,
              page: requestedPage,
              owner,
              ...(search && { search }),
              ...(searchFields && {
                searchFields: searchFields as CasesFindRequest['searchFields'],
              }),
              ...(severity && { severity: severity as CasesFindRequest['severity'] }),
              ...(status && { status: status as CasesFindRequest['status'] }),
              ...(tags && { tags }),
              ...(assignees && { assignees }),
              ...(reporters && { reporters }),
              ...(category && { category }),
              ...(from && { from }),
              ...(to && { to }),
            };

            const findResult = await casesClient.cases.find(searchParams);
            const casesData = enhanceCases(findResult.cases, request, coreServices, logger);
            const searchAttachmentIds = await emitSearchAttachments(casesData, attachments);

            const totalPages = Math.max(1, Math.ceil(findResult.total / requestedPerPage));
            const message =
              findResult.total > casesData.length
                ? `Showing page ${requestedPage} of ${totalPages} (${casesData.length} of ${findResult.total} matches). Pass \`page\` to fetch additional pages.`
                : undefined;
            return injectAttachmentIds(createResult(casesData, message), searchAttachmentIds);
          }

          default: {
            const _exhaustive: never = mode;
            throw new Error(`Unknown search_cases mode: ${_exhaustive}`);
          }
        }
      } catch (error) {
        return createErrorResponse(
          error,
          '[Cases Tool] Error in cases tool',
          'Error fetching cases',
          logger
        );
      }
    },
    tags: ['cases'],
  };
};
