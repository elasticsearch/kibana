/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Logger,
  SavedObject,
  SavedObjectsClientContract,
  SavedObjectsFindResponse,
  SavedObjectsFindResult,
  SavedObjectsBulkUpdateResponse,
  SavedObjectsUpdateResponse,
  SavedObjectsResolveResponse,
  SavedObjectsFindOptions,
  SavedObjectsBulkDeleteObject,
  SavedObjectsBulkDeleteOptions,
} from '@kbn/core/server';

import type { estypes } from '@elastic/elasticsearch';
import type { KueryNode } from '@kbn/es-query';
import { nodeBuilder, toElasticsearchQuery } from '@kbn/es-query';

import type {
  SavedObjectsSearchOptions,
  SavedObjectsSearchResponse,
} from '@kbn/core-saved-objects-api-server';
import type {
  Case,
  CaseStatuses,
  User,
  AttachmentAttributesV2,
} from '../../../common/types/domain';
import { caseStatuses } from '../../../common/types/domain';
import {
  CASE_ATTACHMENT_SAVED_OBJECT,
  CASE_COMMENT_SAVED_OBJECT,
  CASE_SAVED_OBJECT,
  MAX_DOCS_PER_PAGE,
} from '../../../common/constants';
import { UNIFIED_ALERT_TYPES_ARRAY } from '../../../common/utils/attachments';
import { decodeOrThrow } from '../../common/runtime_types';
import type {
  SavedObjectFindOptionsKueryNode,
  SavedObjectsBulkResponseWithErrors,
  SOWithErrors,
} from '../../common/types';
import { defaultSortField, flattenCaseSavedObject } from '../../common/utils';
import { DEFAULT_PAGE, DEFAULT_PER_PAGE } from '../../routes/api';
import { buildFilter, combineFilters } from '../../client/utils';
import { includeFieldsRequiredForAuthentication } from '../../authorization/utils';
import {
  transformSavedObjectToExternalModel,
  transformAttributesToESModel,
  transformUpdateResponseToExternalModel,
  transformFindResponseToExternalModel,
  transformESModelToCase,
} from './transform';
import type { AttachmentService } from '../attachments';
import type {
  CasesActivityV2WriterContract,
  CasesAnalyticsV2WriterContract,
} from '../../cases_analytics_v2';
import type { AggregationBuilder, AggregationResponse } from '../../client/metrics/types';
import { createCaseError, isSOError } from '../../common/error';
import type {
  ResolvedExtendedFieldFilter,
  ResolvedFieldLabelFilter,
} from './extended_field_search_utils';
import {
  buildExtendedFieldRuntimeMappings,
  buildFieldLabelRuntimeMappings,
  buildAllExtendedFieldValuesRuntimeMapping,
  EF_ALL_VALUES_FIELD,
} from './extended_field_search_utils';
import type {
  CasePersistedAttributes,
  CaseSavedObjectTransformed,
  CaseTransformedAttributes,
} from '../../common/types/case';
import {
  CaseTransformedAttributesRt,
  CasePersistedStatus,
  getPartialCaseTransformedAttributesRt,
  OwnerRt,
} from '../../common/types/case';
import type {
  GetCaseIdsByAlertIdArgs,
  GetCaseIdsByAlertIdAggs,
  CasesMapWithPageInfo,
  DeleteCaseArgs,
  GetCaseArgs,
  GetCasesArgs,
  FindCommentsArgs,
  FindCaseCommentsArgs,
  GetReportersArgs,
  GetTagsArgs,
  CreateCaseArgs,
  PatchCaseArgs,
  PatchCasesArgs,
  GetCategoryArgs,
  BulkCreateCasesArgs,
} from './types';
import { bulkDecodeSOAttributes } from '../utils';
import {
  DEFAULT_ATTACHMENT_SEARCH_FIELDS,
  constructSearchQuery,
  convertFindQueryParams,
  mergeSearchQuery,
} from './utils';

const PartialCaseTransformedAttributesRt = getPartialCaseTransformedAttributesRt();

/**
 * Merges the legacy (`cases-comments`) and unified (`cases-attachments`) responses for
 * `getCaseIdsByAlertId` so that downstream consumers see a single response with deduped
 * case-id buckets and the union of authorized saved objects.
 */
const mergeCaseIdsByAlertIdResponses = (
  legacyResponse: SavedObjectsFindResponse<{ owner: string }, GetCaseIdsByAlertIdAggs>,
  unifiedResponse: SavedObjectsFindResponse<{ owner: string }, GetCaseIdsByAlertIdAggs>
): SavedObjectsFindResponse<{ owner: string }, GetCaseIdsByAlertIdAggs> => {
  const legacyBuckets = legacyResponse.aggregations?.references.caseIds.buckets ?? [];
  const unifiedBuckets = unifiedResponse.aggregations?.references.caseIds.buckets ?? [];

  const mergedKeys = new Set<string>();
  const mergedBuckets: Array<{ key: string }> = [];
  for (const bucket of [...legacyBuckets, ...unifiedBuckets]) {
    if (!mergedKeys.has(bucket.key)) {
      mergedKeys.add(bucket.key);
      mergedBuckets.push({ key: bucket.key });
    }
  }

  const legacyDocCount = legacyResponse.aggregations?.references.doc_count ?? 0;
  const unifiedDocCount = unifiedResponse.aggregations?.references.doc_count ?? 0;

  // Dedupe saved_objects across legacy + unified by id
  const seenSavedObjectIds = new Set<string>();
  const dedupedSavedObjects = [
    ...legacyResponse.saved_objects,
    ...unifiedResponse.saved_objects,
  ].filter((so) => {
    if (seenSavedObjectIds.has(so.id)) {
      return false;
    }
    seenSavedObjectIds.add(so.id);
    return true;
  });

  return {
    ...legacyResponse,
    total: dedupedSavedObjects.length,
    saved_objects: dedupedSavedObjects,
    aggregations: {
      references: {
        doc_count: legacyDocCount + unifiedDocCount,
        caseIds: { buckets: mergedBuckets },
      },
    },
  };
};

/**
 * `cases-comments.comment` is a text-analyzed field: we use `match_phrase` so the user's
 * input has to appear as a contiguous sequence
 *
 * `cases-comments.alertId` and `cases-comments.eventId` are keyword fields used
 * to look up an exact ID, so a regular `match` is the correct semantic
 */
const buildAttachmentSearchClause = (
  field: string,
  search: string
): estypes.QueryDslQueryContainer => {
  // TODO: add support for CASE_ATTACHMENT_SAVED_OBJECT
  // https://github.com/elastic/security-team/issues/15066
  if (field === `${CASE_COMMENT_SAVED_OBJECT}.comment`) {
    return { match_phrase: { [field]: search } };
  }
  return { match: { [field]: search } };
};

export class CasesService {
  private readonly log: Logger;
  private readonly unsecuredSavedObjectsClient: SavedObjectsClientContract;
  private readonly attachmentService: AttachmentService;
  /**
   * Cases-as-data v2 writer. Fire-and-forget hook fired post-success on case
   * create / patch / delete. When `xpack.cases.analyticsV2.enabled=false` this
   * is `V2_NOOP_WRITER` and every call compiles down to nothing — the cases
   * primary write path is unaffected.
   */
  private readonly analyticsV2Writer: CasesAnalyticsV2WriterContract;
  /**
   * Cases-as-data v2 activity writer. Same lifetime/contract as
   * `analyticsV2Writer`; consumed here only for cascade-delete on case
   * removal — every other activity write originates from the user-actions
   * service.
   */
  private readonly analyticsV2ActivityWriter: CasesActivityV2WriterContract;

  constructor({
    log,
    unsecuredSavedObjectsClient,
    attachmentService,
    analyticsV2Writer,
    analyticsV2ActivityWriter,
  }: {
    log: Logger;
    unsecuredSavedObjectsClient: SavedObjectsClientContract;
    attachmentService: AttachmentService;
    analyticsV2Writer: CasesAnalyticsV2WriterContract;
    analyticsV2ActivityWriter: CasesActivityV2WriterContract;
  }) {
    this.log = log;
    this.unsecuredSavedObjectsClient = unsecuredSavedObjectsClient;
    this.attachmentService = attachmentService;
    this.analyticsV2Writer = analyticsV2Writer;
    this.analyticsV2ActivityWriter = analyticsV2ActivityWriter;
  }

  private buildCaseIdsAggs = (
    soType: string,
    size: number = 100
  ): Record<string, estypes.AggregationsAggregationContainer> => ({
    references: {
      nested: {
        path: `${soType}.references`,
      },
      aggregations: {
        caseIds: {
          terms: {
            field: `${soType}.references.id`,
            size,
          },
        },
      },
    },
  });

  public async getCaseIdsByAlertId({
    alertId,
    filter,
    unifiedFilter,
  }: GetCaseIdsByAlertIdArgs): Promise<
    SavedObjectsFindResponse<{ owner: string }, GetCaseIdsByAlertIdAggs>
  > {
    try {
      this.log.debug(`Attempting to GET all cases for alert id ${alertId}`);

      const legacyResponse = await this.findCaseIdsForAlertByType({
        alertId,
        soType: CASE_COMMENT_SAVED_OBJECT,
        alertIdField: 'alertId',
        filter,
      });

      if (!this.attachmentService.isUnifiedAttachmentsEnabled) {
        return legacyResponse;
      }

      const unifiedResponse = await this.findCaseIdsForAlertByType({
        alertId,
        soType: CASE_ATTACHMENT_SAVED_OBJECT,
        alertIdField: 'attachmentId',
        extraFilter: buildFilter({
          filters: UNIFIED_ALERT_TYPES_ARRAY,
          field: 'type',
          operator: 'or',
          type: CASE_ATTACHMENT_SAVED_OBJECT,
        }),
        filter: unifiedFilter,
      });

      return mergeCaseIdsByAlertIdResponses(legacyResponse, unifiedResponse);
    } catch (error) {
      this.log.error(`Error on GET all cases for alert id ${alertId}: ${error}`);
      throw error;
    }
  }

  /**
   * Runs the per-saved-object-type alert→case lookup. Each saved-object type uses
   * its own nested-aggregation path (`<soType>.references`), so legacy and unified
   * attachments cannot share a single `find` aggregation; they are issued as
   * sibling queries and merged by `getCaseIdsByAlertId`.
   */
  private async findCaseIdsForAlertByType({
    alertId,
    soType,
    alertIdField,
    extraFilter,
    filter,
  }: {
    alertId: string;
    soType: typeof CASE_COMMENT_SAVED_OBJECT | typeof CASE_ATTACHMENT_SAVED_OBJECT;
    alertIdField: 'alertId' | 'attachmentId';
    extraFilter?: KueryNode;
    filter?: KueryNode;
  }): Promise<SavedObjectsFindResponse<{ owner: string }, GetCaseIdsByAlertIdAggs>> {
    const combinedFilter = combineFilters([
      nodeBuilder.is(`${soType}.attributes.${alertIdField}`, alertId),
      extraFilter,
      filter,
    ]);

    const response = await this.unsecuredSavedObjectsClient.find<
      { owner: string },
      GetCaseIdsByAlertIdAggs
    >({
      type: soType,
      fields: includeFieldsRequiredForAuthentication(),
      page: 1,
      perPage: 1,
      sortField: defaultSortField,
      aggs: this.buildCaseIdsAggs(soType, MAX_DOCS_PER_PAGE),
      filter: combinedFilter,
    });

    const owners: Array<SavedObjectsFindResult<{ owner: string }>> = [];
    for (const so of response.saved_objects) {
      const validatedAttributes = decodeOrThrow(OwnerRt)(so.attributes);

      owners.push(Object.assign(so, { attributes: validatedAttributes }));
    }

    return Object.assign(response, { saved_objects: owners });
  }

  /**
   * Extracts the case IDs from the alert aggregation
   */
  public static getCaseIDsFromAlertAggs(
    result: SavedObjectsFindResponse<unknown, GetCaseIdsByAlertIdAggs>
  ): string[] {
    return result.aggregations?.references.caseIds.buckets.map((b) => b.key) ?? [];
  }

  public async getCaseIdsByAttachmentSearch(
    namespaces: string[],
    search?: string,
    searchFields?: string[]
  ): Promise<string[]> {
    const attachmentSearchFields = searchFields?.filter((field) =>
      DEFAULT_ATTACHMENT_SEARCH_FIELDS.includes(field)
    );
    if (!search || !attachmentSearchFields?.length) {
      return [];
    }

    const response = await this.searchCases({
      type: [CASE_COMMENT_SAVED_OBJECT],
      namespaces,
      query: {
        bool: {
          should: attachmentSearchFields.map((field) => buildAttachmentSearchClause(field, search)),
        },
      },
    });

    const references = response?.hits?.hits?.map((hit) => hit?._source?.references).flat();
    if (!references) {
      return [];
    }
    return references
      .filter((ref) => ref?.type === 'cases' && ref?.id !== undefined)
      .map((ref) => ref?.id ?? '');
  }

  /**
   * Returns a map of all cases.
   */
  public async findCasesGroupedByID({
    caseOptions,
  }: {
    caseOptions: SavedObjectFindOptionsKueryNode;
  }): Promise<CasesMapWithPageInfo> {
    const cases = await this.findCases(caseOptions);

    const casesMap = cases.saved_objects.reduce((accMap, caseInfo) => {
      accMap.set(caseInfo.id, caseInfo);
      return accMap;
    }, new Map<string, SavedObjectsFindResult<CaseTransformedAttributes>>());

    const commentTotals = await this.attachmentService.getter.getCaseAttatchmentStats({
      caseIds: Array.from(casesMap.keys()),
    });

    const casesWithComments = new Map<string, Case>();
    for (const [id, caseInfo] of casesMap.entries()) {
      const { alerts, userComments, events } = commentTotals.get(id) ?? {
        alerts: 0,
        userComments: 0,
        events: 0,
      };

      casesWithComments.set(
        id,
        flattenCaseSavedObject({
          savedObject: caseInfo,
          totalComment: userComments,
          totalAlerts: alerts,
          totalEvents: events,
        })
      );
    }

    return {
      casesMap: casesWithComments,
      page: cases.page,
      perPage: cases.per_page,
      total: cases.total,
    };
  }

  /**
   * Returns a map of all cases.
   */
  public async searchCasesGroupedByID({
    caseOptions,
    namespaces,
    extendedFieldFilters,
    fieldLabelFilters,
  }: {
    caseOptions: SavedObjectFindOptionsKueryNode;
    namespaces: string[];
    extendedFieldFilters?: ResolvedExtendedFieldFilter[][];
    fieldLabelFilters?: ResolvedFieldLabelFilter[];
  }): Promise<CasesMapWithPageInfo> {
    const caseIdsByAttachmentSearch = await this.getCaseIdsByAttachmentSearch(
      namespaces,
      caseOptions.search,
      caseOptions.searchFields
    );
    const searchQuery = constructSearchQuery({
      search: caseOptions.search,
      searchFields: caseOptions.searchFields,
      caseIds: caseIdsByAttachmentSearch,
      extendedFieldFilters,
      fieldLabelFilters,
    });

    const filterQuery = caseOptions.filter ? toElasticsearchQuery(caseOptions.filter) : undefined;
    const query = mergeSearchQuery(searchQuery, filterQuery);

    const extendedFieldRuntimeMappings =
      extendedFieldFilters && extendedFieldFilters.length > 0
        ? buildExtendedFieldRuntimeMappings(extendedFieldFilters)
        : {};

    const fieldLabelRuntimeMappings =
      fieldLabelFilters && fieldLabelFilters.length > 0
        ? buildFieldLabelRuntimeMappings(fieldLabelFilters)
        : {};

    const allValuesRuntimeMappings =
      caseOptions.search && caseOptions.searchFields?.includes(EF_ALL_VALUES_FIELD)
        ? buildAllExtendedFieldValuesRuntimeMapping()
        : {};

    const runtimeMappings = {
      ...extendedFieldRuntimeMappings,
      ...fieldLabelRuntimeMappings,
      ...allValuesRuntimeMappings,
    };

    const hasRuntimeMappings = Object.keys(runtimeMappings).length > 0;

    const cases = await this.searchCases({
      type: [CASE_SAVED_OBJECT],
      namespaces,
      query,
      ...(hasRuntimeMappings ? { runtime_mappings: runtimeMappings } : {}),
      ...convertFindQueryParams(caseOptions),
    });

    const casesMap = cases?.hits?.hits?.reduce((accMap, caseInfo) => {
      // Extract UUID from _id format: "cases:uuid"
      if (caseInfo._id && caseInfo._id.startsWith(`${CASE_SAVED_OBJECT}:`)) {
        const caseId = caseInfo._id.split(':')[1];
        const caseData = caseInfo._source?.cases;
        if (caseData) {
          accMap.set(caseId, transformESModelToCase(caseId, caseData, caseInfo));
        }
      }
      return accMap;
    }, new Map<string, Case>());

    // TODO: imported cases do not populate stats when importing
    // Remove once https://github.com/elastic/kibana/issues/245939 is fixed
    const commentTotals = await this.attachmentService.getter.getCaseAttatchmentStats({
      caseIds: Array.from(casesMap.keys()),
    });

    const casesWithComments = new Map<string, Case>();
    for (const [id, caseInfo] of casesMap.entries()) {
      const { alerts, userComments, events } = commentTotals.get(id) ?? {
        alerts: 0,
        userComments: 0,
        events: 0,
      };

      casesWithComments.set(id, {
        ...caseInfo,
        totalComment: userComments,
        totalAlerts: alerts,
        totalEvents: events,
      });
    }
    const total =
      typeof cases.hits.total === 'object' ? cases.hits.total.value ?? 0 : cases.hits.total ?? 0;

    return {
      casesMap: casesWithComments,
      page: caseOptions.page ?? 1,
      perPage: caseOptions.perPage ?? DEFAULT_PER_PAGE,
      total,
    };
  }

  public async getCaseStatusStats({
    searchOptions,
  }: {
    searchOptions: SavedObjectFindOptionsKueryNode;
  }): Promise<{
    [status in CaseStatuses]: number;
  }> {
    const cases = await this.unsecuredSavedObjectsClient.find<
      unknown,
      {
        statuses: {
          buckets: Array<{
            key: string;
            doc_count: number;
          }>;
        };
      }
    >({
      ...searchOptions,
      type: CASE_SAVED_OBJECT,
      perPage: 0,
      aggs: {
        statuses: {
          terms: {
            field: `${CASE_SAVED_OBJECT}.attributes.status`,
            size: caseStatuses.length,
            order: { _key: 'asc' },
          },
        },
      },
    });

    const statusBuckets = CasesService.getStatusBuckets(cases.aggregations?.statuses.buckets);
    return {
      open: statusBuckets?.get(CasePersistedStatus.OPEN) ?? 0,
      'in-progress': statusBuckets?.get(CasePersistedStatus.IN_PROGRESS) ?? 0,
      closed: statusBuckets?.get(CasePersistedStatus.CLOSED) ?? 0,
    };
  }

  private static getStatusBuckets(
    buckets: Array<{ key: string; doc_count: number }> | undefined
  ): Map<number, number> | undefined {
    return buckets?.reduce((acc, bucket) => {
      acc.set(Number(bucket.key), bucket.doc_count);
      return acc;
    }, new Map<number, number>());
  }

  public async deleteCase({ id: caseId, refresh }: DeleteCaseArgs) {
    try {
      this.log.debug(`Attempting to DELETE case ${caseId}`);
      await this.unsecuredSavedObjectsClient.delete(CASE_SAVED_OBJECT, caseId, { refresh });

      // Cases-as-data v2: drop the analytics doc post-success. Fire-and-forget;
      // the writer swallows 404s internally.
      this.analyticsV2Writer.deleteCase(caseId);
      // Cascade to `.cases-activity`. The case SO delete cascades to its
      // user-action SOs at the SO layer, but reconciliation can't see the
      // gap (deleted SOs are gone) — mirror the cascade explicitly here.
      this.analyticsV2ActivityWriter.bulkDeleteActionsByCaseIds([caseId]);
    } catch (error) {
      this.log.error(`Error on DELETE case ${caseId}: ${error}`);
      throw error;
    }
  }

  public async bulkDeleteCaseEntities({
    entities,
    options,
  }: {
    entities: SavedObjectsBulkDeleteObject[];
    options?: SavedObjectsBulkDeleteOptions;
  }) {
    try {
      this.log.debug(() => `Attempting to bulk delete case entities ${JSON.stringify(entities)}`);
      const bulkDeleteResult = await this.unsecuredSavedObjectsClient.bulkDelete(entities, options);

      // Cases-as-data v2: drop analytics docs ONLY for entities whose SO
      // delete actually succeeded. The bulkDelete response carries a
      // per-entity status; iterating `entities` blindly would remove the
      // analytics doc even when the underlying SO survives (version
      // conflict, lost shard, etc.). That state is unrecoverable because
      // reconciliation can't see it — the surviving SO's `updated_at`
      // didn't change, so the filter won't pick it up.
      //
      // `success: true` covers both 200 (deleted) and 404 (already gone) —
      // either way the post-state is "SO absent", which is what the
      // analytics delete is mirroring. Failures (success: false) skip the
      // analytics call, leaving the doc in place to match the SO.
      //
      // Collect successful case ids and dispatch as one bulk delete to the
      // analytics writer — looping `deleteCase` per item would fan out to
      // N ES delete requests (same write-amplification concern as the
      // bulk-upsert paths).
      //
      // Comments / attachments / user-actions are tracked by their own
      // surfaces (added in PR 2) so they're skipped here.
      const entityById = new Map(entities.map((e) => [`${e.type}:${e.id}`, e]));
      const idsToDelete: string[] = [];
      for (const status of bulkDeleteResult.statuses) {
        if (status.success) {
          const entity = entityById.get(`${status.type}:${status.id}`);
          if (entity?.type === CASE_SAVED_OBJECT) {
            idsToDelete.push(entity.id);
          }
        }
      }
      this.analyticsV2Writer.bulkDeleteCases(idsToDelete);
      // Cascade to `.cases-activity` for the same set of case ids — the
      // SO-layer cascade removes the user-action SOs, and reconciliation
      // can't see the gap (deleted SOs are gone), so we drop the analytics
      // mirror explicitly. No-op when `idsToDelete` is empty.
      this.analyticsV2ActivityWriter.bulkDeleteActionsByCaseIds(idsToDelete);
    } catch (error) {
      this.log.error(`Error bulk deleting case entities ${JSON.stringify(entities)}: ${error}`);
    }
  }

  public async getCase({ id: caseId }: GetCaseArgs): Promise<CaseSavedObjectTransformed> {
    try {
      this.log.debug(`Attempting to GET case ${caseId}`);
      const caseSavedObject = await this.unsecuredSavedObjectsClient.get<CasePersistedAttributes>(
        CASE_SAVED_OBJECT,
        caseId
      );

      const res = transformSavedObjectToExternalModel(caseSavedObject);
      const decodeRes = decodeOrThrow(CaseTransformedAttributesRt)(res.attributes);

      return {
        ...res,
        attributes: decodeRes,
      };
    } catch (error) {
      this.log.error(`Error on GET case ${caseId}: ${error}`);
      throw error;
    }
  }

  public async getResolveCase({
    id: caseId,
  }: GetCaseArgs): Promise<SavedObjectsResolveResponse<CaseTransformedAttributes>> {
    try {
      this.log.debug(`Attempting to resolve case ${caseId}`);
      const resolveCaseResult =
        await this.unsecuredSavedObjectsClient.resolve<CasePersistedAttributes>(
          CASE_SAVED_OBJECT,
          caseId
        );

      const resolvedSO = transformSavedObjectToExternalModel(resolveCaseResult.saved_object);
      const decodeRes = decodeOrThrow(CaseTransformedAttributesRt)(resolvedSO.attributes);

      return {
        ...resolveCaseResult,
        saved_object: { ...resolvedSO, attributes: decodeRes },
      };
    } catch (error) {
      this.log.error(`Error on resolve case ${caseId}: ${error}`);
      throw error;
    }
  }

  public async getCases({
    caseIds,
  }: GetCasesArgs): Promise<SavedObjectsBulkResponseWithErrors<CaseTransformedAttributes>> {
    try {
      this.log.debug(`Attempting to GET cases ${caseIds.join(', ')}`);
      const cases = await this.unsecuredSavedObjectsClient.bulkGet<CasePersistedAttributes>(
        caseIds.map((caseId) => ({ type: CASE_SAVED_OBJECT, id: caseId }))
      );

      const res = cases.saved_objects.map((theCase) => {
        if (isSOError(theCase)) {
          return theCase;
        }

        const so = Object.assign(theCase, transformSavedObjectToExternalModel(theCase));
        const decodeRes = decodeOrThrow(CaseTransformedAttributesRt)(so.attributes);
        const soWithDecodedRes = Object.assign(so, { attributes: decodeRes });

        return soWithDecodedRes;
      });

      return Object.assign(cases, {
        saved_objects: res,
      });
    } catch (error) {
      this.log.error(`Error on GET cases ${caseIds.join(', ')}: ${error}`);
      throw error;
    }
  }

  public async findCases(
    options?: SavedObjectFindOptionsKueryNode
  ): Promise<SavedObjectsFindResponse<CaseTransformedAttributes>> {
    try {
      this.log.debug(`Attempting to find cases`);
      const cases = await this.unsecuredSavedObjectsClient.find<CasePersistedAttributes>({
        sortField: defaultSortField,
        ...options,
        type: CASE_SAVED_OBJECT,
      });

      const res = transformFindResponseToExternalModel(cases);
      const decodeRes = bulkDecodeSOAttributes(res.saved_objects, CaseTransformedAttributesRt);

      return {
        ...res,
        saved_objects: res.saved_objects.map((so) => ({
          ...so,
          attributes: decodeRes.get(so.id) as CaseTransformedAttributes,
        })),
      };
    } catch (error) {
      this.log.error(`Error on find cases: ${error}`);
      throw error;
    }
  }

  public async searchCases({
    type,
    namespaces,
    query,
    ...options
  }: SavedObjectsSearchOptions): Promise<SavedObjectsSearchResponse> {
    try {
      this.log.debug(`Attempting to search cases`);
      const cases = await this.unsecuredSavedObjectsClient.search({
        type,
        namespaces,
        query,
        seq_no_primary_term: true,
        ...options,
      });

      return cases;
    } catch (error) {
      this.log.error(`Error on search cases: ${error}`);
      throw error;
    }
  }

  private asArray(id: string | string[] | undefined): string[] {
    if (id === undefined) {
      return [];
    } else if (Array.isArray(id)) {
      return id;
    } else {
      return [id];
    }
  }

  // TODO: This should probably be moved into the client since it is after the transform has
  // occurred within the attachment service
  private async getAllComments({
    id,
    options,
    mode = 'legacy',
  }: FindCommentsArgs): Promise<SavedObjectsFindResponse<AttachmentAttributesV2>> {
    try {
      this.log.debug(`Attempting to GET all comments internal for id ${JSON.stringify(id)}`);
      if (options?.page !== undefined || options?.perPage !== undefined) {
        return this.attachmentService.find({
          options: {
            sortField: defaultSortField,
            ...options,
          },
          mode,
        });
      }

      return this.attachmentService.find({
        options: {
          page: 1,
          perPage: MAX_DOCS_PER_PAGE,
          sortField: defaultSortField,
          ...options,
        },
        mode,
      });
    } catch (error) {
      this.log.error(`Error on GET all comments internal for ${JSON.stringify(id)}: ${error}`);
      throw error;
    }
  }

  // TODO: This should probably be moved into the client since it is after the transform has
  // occurred within the attachment service
  /**
   * Default behavior is to retrieve all comments that adhere to a given filter (if one is included).
   * to override this pass in the either the page or perPage options.
   */
  public async getAllCaseComments({
    id,
    options,
    mode = 'legacy',
  }: FindCaseCommentsArgs): Promise<SavedObjectsFindResponse<AttachmentAttributesV2>> {
    try {
      const refs = this.asArray(id).map((caseID) => ({ type: CASE_SAVED_OBJECT, id: caseID }));
      if (refs.length <= 0) {
        return {
          saved_objects: [],
          total: 0,
          per_page: options?.perPage ?? DEFAULT_PER_PAGE,
          page: options?.page ?? DEFAULT_PAGE,
        };
      }

      this.log.debug(`Attempting to GET all comments for case caseID ${JSON.stringify(id)}`);
      return await this.getAllComments({
        id,
        options: {
          hasReferenceOperator: 'OR',
          hasReference: refs,
          filter: options?.filter,
          ...options,
        },
        mode,
      });
    } catch (error) {
      this.log.error(`Error on GET all comments for case ${JSON.stringify(id)}: ${error}`);
      throw error;
    }
  }

  public async getReporters({ filter }: GetReportersArgs): Promise<User[]> {
    try {
      this.log.debug(`Attempting to GET all reporters`);

      const results = await this.unsecuredSavedObjectsClient.find<
        unknown,
        {
          reporters: {
            buckets: Array<{
              key: string;
              top_docs: { hits: { hits: Array<{ _source: { cases: { created_by: User } } }> } };
            }>;
          };
        }
      >({
        type: CASE_SAVED_OBJECT,
        page: 1,
        perPage: 1,
        filter,
        aggs: {
          reporters: {
            terms: {
              field: `${CASE_SAVED_OBJECT}.attributes.created_by.username`,
              size: MAX_DOCS_PER_PAGE,
              order: { _key: 'asc' },
            },
            aggs: {
              top_docs: {
                top_hits: {
                  sort: [
                    {
                      [`${CASE_SAVED_OBJECT}.created_at`]: {
                        order: 'desc',
                      },
                    },
                  ],
                  size: 1,
                  _source: [`${CASE_SAVED_OBJECT}.created_by`],
                },
              },
            },
          },
        },
      });

      return (
        results?.aggregations?.reporters?.buckets.map(({ key: username, top_docs: topDocs }) => {
          const user = topDocs?.hits?.hits?.[0]?._source?.cases?.created_by ?? {};
          return {
            username,
            full_name: user.full_name ?? null,
            email: user.email ?? null,
            profile_uid: user.profile_uid,
          };
        }) ?? []
      );
    } catch (error) {
      this.log.error(`Error on GET all reporters: ${error}`);
      throw error;
    }
  }

  public async getTags({ filter }: GetTagsArgs): Promise<string[]> {
    try {
      this.log.debug(`Attempting to GET all cases`);

      const results = await this.unsecuredSavedObjectsClient.find<
        unknown,
        { tags: { buckets: Array<{ key: string }> } }
      >({
        type: CASE_SAVED_OBJECT,
        page: 1,
        perPage: 1,
        filter,
        aggs: {
          tags: {
            terms: {
              field: `${CASE_SAVED_OBJECT}.attributes.tags`,
              size: MAX_DOCS_PER_PAGE,
              order: { _key: 'asc' },
            },
          },
        },
      });

      return results?.aggregations?.tags?.buckets.map(({ key }) => key) ?? [];
    } catch (error) {
      this.log.error(`Error on GET tags: ${error}`);
      throw error;
    }
  }

  public async getCategories({ filter }: GetCategoryArgs): Promise<string[]> {
    try {
      this.log.debug(`Attempting to GET all categories`);

      const results = await this.unsecuredSavedObjectsClient.find<
        unknown,
        { categories: { buckets: Array<{ key: string }> } }
      >({
        type: CASE_SAVED_OBJECT,
        page: 1,
        perPage: 1,
        filter,
        aggs: {
          categories: {
            terms: {
              field: `${CASE_SAVED_OBJECT}.attributes.category`,
              size: MAX_DOCS_PER_PAGE,
              order: { _key: 'asc' },
            },
          },
        },
      });

      return results?.aggregations?.categories?.buckets.map(({ key }) => key) ?? [];
    } catch (error) {
      this.log.error(`Error on GET categories: ${error}`);
      throw error;
    }
  }

  public async createCase({
    attributes,
    id,
    refresh,
  }: CreateCaseArgs): Promise<CaseSavedObjectTransformed> {
    try {
      this.log.debug(`Attempting to create a new case`);

      const decodedAttributes = decodeOrThrow(CaseTransformedAttributesRt)(attributes);
      const transformedAttributes = transformAttributesToESModel(decodedAttributes);

      transformedAttributes.attributes.total_alerts = 0;
      transformedAttributes.attributes.total_comments = 0;
      transformedAttributes.attributes.total_events = 0;

      const createdCase = await this.unsecuredSavedObjectsClient.create<CasePersistedAttributes>(
        CASE_SAVED_OBJECT,
        transformedAttributes.attributes,
        { id, references: transformedAttributes.referenceHandler.build(), refresh }
      );

      // Cases-as-data v2: fire-and-forget upsert. No-op when v2 is disabled.
      this.analyticsV2Writer.upsertCase(createdCase);

      const res = transformSavedObjectToExternalModel(createdCase);
      const decodedRes = decodeOrThrow(CaseTransformedAttributesRt)(res.attributes);

      return { ...res, attributes: decodedRes };
    } catch (error) {
      this.log.error(`Error on creating a new case: ${error}`);
      throw error;
    }
  }

  public async bulkCreateCases({
    cases,
    refresh,
  }: BulkCreateCasesArgs): Promise<SavedObjectsBulkResponseWithErrors<CaseTransformedAttributes>> {
    try {
      this.log.debug(`Attempting to bulk create cases`);

      const bulkCreateRequest = cases.map(({ id, ...attributes }) => {
        const decodedAttributes = decodeOrThrow(CaseTransformedAttributesRt)(attributes);

        const { attributes: transformedAttributes, referenceHandler } =
          transformAttributesToESModel(decodedAttributes);

        transformedAttributes.total_alerts = 0;
        transformedAttributes.total_comments = 0;
        transformedAttributes.total_events = 0;

        return {
          type: CASE_SAVED_OBJECT,
          id,
          attributes: transformedAttributes,
          references: referenceHandler.build(),
        };
      });

      const bulkCreateResponse =
        await this.unsecuredSavedObjectsClient.bulkCreate<CasePersistedAttributes>(
          bulkCreateRequest,
          {
            refresh,
          }
        );

      // Cases-as-data v2: collect successfully-created SOs and dispatch as
      // a single bulk to the analytics writer. Looping `upsertCase` per
      // item would fan out to N ES `index` requests, saturating the
      // connection pool the rest of Kibana shares — `bulkUpsertCases`
      // collapses that to one `_bulk` request.
      const successfulAnalyticsV2Mirrors: Array<(typeof bulkCreateResponse.saved_objects)[number]> =
        [];
      const res = bulkCreateResponse.saved_objects.map((theCase) => {
        if (isSOError<CasePersistedAttributes>(theCase)) {
          return theCase;
        }
        successfulAnalyticsV2Mirrors.push(theCase);

        const transformedCase = transformSavedObjectToExternalModel(theCase);
        const decodedRes = decodeOrThrow(CaseTransformedAttributesRt)(transformedCase.attributes);

        return { ...transformedCase, attributes: decodedRes };
      });
      this.analyticsV2Writer.bulkUpsertCases(
        successfulAnalyticsV2Mirrors as Array<SavedObject<CasePersistedAttributes>>
      );

      return { saved_objects: res };
    } catch (error) {
      this.log.error(`Case Service: Error on bulk creating cases: ${error}`);
      throw error;
    }
  }

  public async patchCase({
    caseId,
    updatedAttributes,
    originalCase,
    version,
    refresh,
  }: PatchCaseArgs): Promise<SavedObjectsUpdateResponse<CaseTransformedAttributes>> {
    try {
      this.log.debug(`Attempting to UPDATE case ${caseId}`);

      const decodedAttributes = decodeOrThrow(PartialCaseTransformedAttributesRt)(
        updatedAttributes
      );
      const transformedAttributes = transformAttributesToESModel(decodedAttributes);
      // Compute the merged reference list once and share it between the SO
      // update and the analytics-writer synthesis. Mirrors the
      // `builtReferences` pattern in patchCases — without this, the two
      // callers could subtly diverge if anyone changed how the references
      // are computed in only one place.
      const builtReferences = transformedAttributes.referenceHandler.build(originalCase.references);

      const updatedCase = await this.unsecuredSavedObjectsClient.update<CasePersistedAttributes>(
        CASE_SAVED_OBJECT,
        caseId,
        transformedAttributes.attributes,
        {
          version,
          references: builtReferences,
          refresh,
        }
      );

      // Cases-as-data v2: synthesize the post-patch SO from originalCase + patch
      // attributes to avoid an extra SO get round-trip.
      // originalCase is the external model (string status/severity,
      // external_service.connector_id). Convert to the persisted model first —
      // using it raw silently drops status/severity for untouched fields and
      // injects connector_id into the strict mapping.
      this.analyticsV2Writer.upsertCase({
        ...originalCase,
        attributes: {
          ...transformAttributesToESModel(originalCase.attributes ?? {}).attributes,
          ...transformedAttributes.attributes,
        } as CasePersistedAttributes,
        version: updatedCase.version ?? originalCase.version,
        references: builtReferences ?? [],
      });

      const res = transformUpdateResponseToExternalModel(updatedCase);
      const decodeRes = decodeOrThrow(PartialCaseTransformedAttributesRt)(res.attributes);

      return {
        ...res,
        attributes: decodeRes,
      };
    } catch (error) {
      this.log.error(`Error on UPDATE case ${caseId}: ${error}`);
      throw error;
    }
  }

  public async patchCases({
    cases,
    refresh,
  }: PatchCasesArgs): Promise<SavedObjectsBulkUpdateResponse<CaseTransformedAttributes>> {
    try {
      this.log.debug(`Attempting to UPDATE case ${cases.map((c) => c.caseId).join(', ')}`);

      // Keep the per-case originalCase + transformed-attributes pair around so
      // we can synthesize a post-update SavedObject for the analytics writer
      // after `bulkUpdate` succeeds. We can't read `bulkUpdate`'s response for
      // this because it returns partial attributes, not the full merged state.
      const perCaseUpdate = cases.map(({ caseId, updatedAttributes, version, originalCase }) => {
        const decodedAttributes = decodeOrThrow(PartialCaseTransformedAttributesRt)(
          updatedAttributes
        );
        const { attributes, referenceHandler } = transformAttributesToESModel(decodedAttributes);
        const builtReferences = referenceHandler.build(originalCase.references);
        return {
          caseId,
          version,
          originalCase,
          esAttributes: attributes,
          references: builtReferences,
        };
      });

      const bulkUpdate = perCaseUpdate.map(({ caseId, version, esAttributes, references }) => ({
        type: CASE_SAVED_OBJECT,
        id: caseId,
        attributes: esAttributes,
        references,
        version,
      }));

      const updatedCases =
        await this.unsecuredSavedObjectsClient.bulkUpdate<CasePersistedAttributes>(bulkUpdate, {
          refresh,
        });

      // Index of per-case context by id, for cheap lookup during the post-pass.
      const updateContextById = new Map(perCaseUpdate.map((u) => [u.caseId, u]));

      // Cases-as-data v2: synthesize the post-update SO for each
      // successfully-patched case (`originalCase + new attributes`) and
      // dispatch as one bulk write. Same fan-out-collapse rationale as
      // `bulkCreateCases`.
      const analyticsV2Mirrors: Array<SavedObject<CasePersistedAttributes>> = [];

      const res = updatedCases.saved_objects.reduce((acc, theCase) => {
        if (isSOError(theCase)) {
          acc.push(theCase);
          return acc;
        }

        // Same synthesize-from-originalCase pattern as patchCase: convert the
        // external-model base to the persisted model before spreading the patch.
        const ctx = updateContextById.get(theCase.id);
        if (ctx) {
          analyticsV2Mirrors.push({
            ...ctx.originalCase,
            attributes: {
              ...transformAttributesToESModel(ctx.originalCase.attributes ?? {}).attributes,
              ...ctx.esAttributes,
            } as CasePersistedAttributes,
            version: theCase.version ?? ctx.originalCase.version,
            references: ctx.references ?? [],
          });
        }

        const so = Object.assign(theCase, transformUpdateResponseToExternalModel(theCase));
        const decodeRes = decodeOrThrow(PartialCaseTransformedAttributesRt)(so.attributes);
        const soWithDecodedRes = Object.assign(so, { attributes: decodeRes });

        acc.push(soWithDecodedRes);

        return acc;
      }, [] as Array<SavedObjectsUpdateResponse<CaseTransformedAttributes> | SOWithErrors<CaseTransformedAttributes>>);

      this.analyticsV2Writer.bulkUpsertCases(analyticsV2Mirrors);

      return Object.assign(updatedCases, {
        saved_objects: res,
        /**
         * The case is needed here because
         * the SavedObjectsBulkUpdateResponse is wrong.
         * It assumes that the attributes exist
         * on an error which is not true.
         */
      }) as SavedObjectsBulkUpdateResponse<CaseTransformedAttributes>;
    } catch (error) {
      this.log.error(`Error on UPDATE case ${cases.map((c) => c.caseId).join(', ')}: ${error}`);
      throw error;
    }
  }

  public async executeAggregations({
    aggregationBuilders,
    options,
  }: {
    aggregationBuilders: Array<AggregationBuilder<unknown>>;
    options?: Omit<SavedObjectsFindOptions, 'aggs' | 'type'>;
  }): Promise<AggregationResponse> {
    try {
      const builtAggs = aggregationBuilders.reduce((acc, agg) => {
        return Object.assign(acc, agg.build());
      }, {});

      const res = await this.unsecuredSavedObjectsClient.find<
        CasePersistedAttributes,
        AggregationResponse
      >({
        sortField: defaultSortField,
        ...options,
        aggs: builtAggs,
        type: CASE_SAVED_OBJECT,
      });

      return res.aggregations;
    } catch (error) {
      const aggregationNames = aggregationBuilders.map((agg) => agg.getName());

      throw createCaseError({
        message: `Failed to execute aggregations [${aggregationNames.join(',')}]: ${error}`,
        error,
        logger: this.log,
      });
    }
  }
}
