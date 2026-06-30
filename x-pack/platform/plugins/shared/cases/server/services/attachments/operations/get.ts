/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject, SavedObjectsFindResponse } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { estypes } from '@elastic/elasticsearch';
import { FILE_SO_TYPE } from '@kbn/files-plugin/common';
import {
  toUnifiedAttachmentType,
  UNIFIED_ALERT_TYPES_ARRAY,
} from '../../../../common/utils/attachments';
import { getAttachmentSavedObjectType } from '../../../common/attachments';
import { isSOError } from '../../../common/error';
import { decodeOrThrow } from '../../../common/runtime_types';
import type {
  AttachmentPersistedAttributes,
  AttachmentTransformedAttributes,
  AttachmentSavedObjectTransformed,
} from '../../../common/types/attachments_v1';
import { AttachmentTransformedAttributesRt } from '../../../common/types/attachments_v1';
import {
  CASE_ATTACHMENT_SAVED_OBJECT,
  CASE_COMMENT_SAVED_OBJECT,
  CASE_SAVED_OBJECT,
  MAX_ALERTS_PER_CASE,
  MAX_DOCS_PER_PAGE,
} from '../../../../common/constants';
import {
  COMMENT_ATTACHMENT_TYPE,
  SECURITY_EVENT_ATTACHMENT_TYPE,
} from '../../../../common/constants/attachments';
import { NodeBuilderOperators, buildFilter, combineFilters } from '../../../client/utils';
import type {
  AttachmentMode,
  AttachmentTotals,
  DocumentAttachmentAttributesV2,
} from '../../../../common/types/domain';
import { AttachmentType, DocumentAttachmentAttributesRtV2 } from '../../../../common/types/domain';
import type {
  AlertIdsAggsResult,
  BulkOptionalAttributes,
  EventIdsAggsResult,
  GetAllAlertsAttachToCaseArgs as GetAllDocumentsAttachedToCaseArgs,
  GetAttachmentArgs,
  MixSavedObjectResponse,
  ServiceContext,
} from '../types';
import type {
  AttachmentAttributesV2,
  AttachmentSavedObjectTransformedV2,
  UnifiedAttachmentAttributes,
} from '../../../common/types/attachments_v2';
import {
  injectAttachmentAttributesAndHandleErrors,
  injectAttachmentSOAttributesFromRefs,
} from '../../so_references';
import { partitionByCaseAssociation } from '../../../common/partitioning';
import { getCaseReferenceId } from '../../../common/references';
import { transformAttributesForMode } from './utils';

export class AttachmentGetter {
  constructor(private readonly context: ServiceContext) {}

  public async bulkGet(
    savedObjectIds: string[],
    mode: AttachmentMode
  ): Promise<BulkOptionalAttributes<AttachmentAttributesV2>> {
    try {
      this.context.log.debug(
        `Attempting to retrieve attachments with ids: ${savedObjectIds.join()}`
      );

      const response =
        await this.context.unsecuredSavedObjectsClient.bulkGet<AttachmentAttributesV2>(
          savedObjectIds.flatMap((id) => [
            { id, type: CASE_ATTACHMENT_SAVED_OBJECT },
            { id, type: CASE_COMMENT_SAVED_OBJECT },
          ])
        );

      const merged = this.mergeBulkGetResults(response.saved_objects);

      if (mode === 'legacy') {
        return this.transformAndDecodeBulkGetResponseLegacy(merged);
      }
      return this.transformAndDecodeBulkGetResponseUnified(merged);
    } catch (error) {
      this.context.log.error(
        `Error retrieving attachments with ids ${savedObjectIds.join()}: ${error}`
      );
      throw error;
    }
  }

  private mergeBulkGetResults(
    savedObjects: Array<SavedObject<AttachmentAttributesV2> | { id: string; error: unknown }>
  ): Array<MixSavedObjectResponse> {
    // We query 2 SO types per id (paired in bulkGet input order): one may hit,
    // one may 404. For ids missing from both types both entries are errors; we
    // surface a single "not found" from the FF-derived default write target so
    // the error message stays consistent with where new writes go.
    if (savedObjects.length % 2 !== 0) {
      throw new Error(
        `Expected bulkGet response to contain pairs of saved objects, received ${savedObjects.length} entries`
      );
    }

    const defaultSavedObjectType = getAttachmentSavedObjectType(this.context.config);
    const result: Array<MixSavedObjectResponse> = [];
    for (let i = 0; i < savedObjects.length; i += 2) {
      const pair = [savedObjects[i], savedObjects[i + 1]] as const;
      if (pair[0].id !== pair[1].id) {
        throw new Error(
          `bulkGet response pair mismatch: expected matching ids, received "${pair[0].id}" and "${pair[1].id}"`
        );
      }
      const hit = pair.find((so) => !isSOError(so));
      if (hit) {
        result.push(hit);
      } else {
        // Both buckets are errors. Surface the one matching the FF-derived
        // default write target so callers see a consistent "not found"
        // (cases-comments when FF off, cases-attachments when FF on).
        const [unifiedSO, legacySO] = pair;
        result.push(defaultSavedObjectType === CASE_ATTACHMENT_SAVED_OBJECT ? unifiedSO : legacySO);
      }
    }
    return result;
  }

  private transformAndDecodeBulkGetResponseLegacy(
    merged: Array<MixSavedObjectResponse>
  ): BulkOptionalAttributes<AttachmentTransformedAttributes> {
    const validatedAttachments: AttachmentSavedObjectTransformed[] = [];

    for (const so of merged) {
      if (isSOError(so)) {
        validatedAttachments.push(so as AttachmentSavedObjectTransformed);
      } else {
        const injectedSo = injectAttachmentAttributesAndHandleErrors(
          so as SavedObject<AttachmentPersistedAttributes>
        ) as SavedObject<AttachmentAttributesV2>;
        const transformed = transformAttributesForMode({
          attributes: injectedSo.attributes,
          mode: 'legacy',
        });
        if (transformed.isUnified) {
          throw new Error('Error transforming attachment to legacy mode');
        }
        const legacySo = {
          ...injectedSo,
          attributes: transformed.attributes,
        } as SavedObject<AttachmentPersistedAttributes>;
        const validatedAttributes = decodeOrThrow(AttachmentTransformedAttributesRt)(
          legacySo.attributes
        );
        validatedAttachments.push(Object.assign(legacySo, { attributes: validatedAttributes }));
      }
    }

    return {
      saved_objects: validatedAttachments,
    };
  }
  // the return type is a mix of legacy and unified until
  // all the attachments are migrated
  private transformAndDecodeBulkGetResponseUnified(
    merged: Array<MixSavedObjectResponse>
  ): BulkOptionalAttributes<AttachmentAttributesV2> {
    const validatedAttachments: Array<AttachmentSavedObjectTransformedV2> = [];

    for (const so of merged) {
      if (isSOError(so)) {
        validatedAttachments.push(so as AttachmentSavedObjectTransformedV2);
      } else {
        const injectedSo = injectAttachmentAttributesAndHandleErrors(
          so as SavedObject<AttachmentPersistedAttributes>
        ) as SavedObject<AttachmentAttributesV2>;
        const transformed = transformAttributesForMode({
          attributes: injectedSo.attributes,
          mode: 'unified',
        });
        if (transformed.isUnified) {
          validatedAttachments.push(
            Object.assign(injectedSo, {
              attributes: transformed.attributes,
            }) as AttachmentSavedObjectTransformedV2
          );
        } else {
          // Legacy-shape result (unmigrated unified type): mirror the legacy
          // bulkGet path — re-transform with mode 'legacy' and decode.
          const legacyTransformed = transformAttributesForMode({
            attributes: injectedSo.attributes,
            mode: 'legacy',
          });
          if (legacyTransformed.isUnified) {
            throw new Error('Error transforming attachment to legacy mode');
          }
          const legacySo = {
            ...injectedSo,
            attributes: legacyTransformed.attributes,
          } as SavedObject<AttachmentPersistedAttributes>;
          const validatedAttributes = decodeOrThrow(AttachmentTransformedAttributesRt)(
            legacySo.attributes
          );

          validatedAttachments.push(Object.assign(legacySo, { attributes: validatedAttributes }));
        }
      }
    }

    return {
      saved_objects: validatedAttachments,
    };
  }

  public async getAttachmentIdsForCases({ caseIds }: { caseIds: string[] }) {
    try {
      this.context.log.debug(
        `Attempting to retrieve attachments associated with cases: [${caseIds}]`
      );

      // We are intentionally not adding the type here because we only want to interact with the id and this function
      // should not use the attributes
      const finder = this.context.unsecuredSavedObjectsClient.createPointInTimeFinder<unknown>({
        type: [CASE_COMMENT_SAVED_OBJECT, CASE_ATTACHMENT_SAVED_OBJECT],
        hasReference: caseIds.map((id) => ({ id, type: CASE_SAVED_OBJECT })),
        sortField: 'created_at',
        sortOrder: 'asc',
        /**
         * We only care about the ids so to reduce the data returned we should limit the fields in the response. Core
         * doesn't support retrieving no fields (id would always be returned anyway) so to limit it we'll only request
         * the owner even though we don't need it.
         */
        fields: ['owner'],
        perPage: MAX_DOCS_PER_PAGE,
      });

      const idTypePairs: Array<{ id: string; type: string }> = [];
      for await (const attachmentSavedObject of finder.find()) {
        idTypePairs.push(
          ...attachmentSavedObject.saved_objects.map((attachment) => ({
            id: attachment.id,
            type: attachment.type,
          }))
        );
      }

      return idTypePairs;
    } catch (error) {
      this.context.log.error(
        `Error retrieving attachments associated with cases: [${caseIds}]: ${error}`
      );
      throw error;
    }
  }

  /**
   * Retrieves all the documents attached to a case.
   */
  public async getAllDocumentsAttachedToCase({
    caseId,
    filter,
    attachmentTypes = [AttachmentType.alert, AttachmentType.event],
    owner,
  }: GetAllDocumentsAttachedToCaseArgs): Promise<
    Array<SavedObject<DocumentAttachmentAttributesV2>>
  > {
    try {
      this.context.log.debug(`Attempting to GET all documents for case id ${caseId}`);
      const legacyDocumentsFilter = buildFilter({
        filters: attachmentTypes,
        field: 'type',
        operator: 'or',
        type: CASE_COMMENT_SAVED_OBJECT,
      });

      const unifiedDocumentsFilter = buildFilter({
        filters: attachmentTypes.map((type) => toUnifiedAttachmentType(type, owner)),
        field: 'type',
        operator: 'or',
        type: CASE_ATTACHMENT_SAVED_OBJECT,
      });

      const combinedFilter = combineFilters([
        combineFilters([legacyDocumentsFilter, unifiedDocumentsFilter], NodeBuilderOperators.or),
        filter,
      ]);

      const finder =
        this.context.unsecuredSavedObjectsClient.createPointInTimeFinder<AttachmentAttributesV2>({
          type: [CASE_COMMENT_SAVED_OBJECT, CASE_ATTACHMENT_SAVED_OBJECT],
          hasReference: { type: CASE_SAVED_OBJECT, id: caseId },
          sortField: 'created_at',
          sortOrder: 'asc',
          filter: combinedFilter,
          perPage: MAX_DOCS_PER_PAGE,
        });

      let result: Array<SavedObject<DocumentAttachmentAttributesV2>> = [];
      for await (const userActionSavedObject of finder.find()) {
        result = result.concat(AttachmentGetter.decodeDocuments(userActionSavedObject));
      }

      return result;
    } catch (error) {
      this.context.log.error(`Error on GET all documents for case id ${caseId}: ${error}`);
      throw error;
    }
  }

  private static decodeDocuments(
    response: SavedObjectsFindResponse<AttachmentAttributesV2>
  ): Array<SavedObject<DocumentAttachmentAttributesV2>> {
    return response.saved_objects.map((so) => {
      const validatedAttributes = decodeOrThrow(DocumentAttachmentAttributesRtV2)(so.attributes);

      return Object.assign(so, { attributes: validatedAttributes });
    });
  }

  /**
   * Retrieves all the alerts attached to a case.
   */
  public async getAllAlertIds({ caseId }: { caseId: string }): Promise<Set<string>> {
    try {
      this.context.log.debug(`Attempting to GET all alerts ids for case id ${caseId}`);
      const legacyFindPromise = this.context.unsecuredSavedObjectsClient.find<
        unknown,
        AlertIdsAggsResult
      >({
        type: CASE_COMMENT_SAVED_OBJECT,
        hasReference: { type: CASE_SAVED_OBJECT, id: caseId },
        sortField: 'created_at',
        sortOrder: 'asc',
        filter: buildFilter({
          filters: [AttachmentType.alert],
          field: 'type',
          operator: 'or',
          type: CASE_COMMENT_SAVED_OBJECT,
        }),
        perPage: 0,
        aggs: {
          alertIds: {
            terms: {
              field: `${CASE_COMMENT_SAVED_OBJECT}.attributes.alertId`,
              size: MAX_ALERTS_PER_CASE,
            },
          },
        },
      });

      const unifiedFindPromise = this.context.unsecuredSavedObjectsClient.find<
        unknown,
        AlertIdsAggsResult
      >({
        type: CASE_ATTACHMENT_SAVED_OBJECT,
        hasReference: { type: CASE_SAVED_OBJECT, id: caseId },
        filter: buildFilter({
          filters: UNIFIED_ALERT_TYPES_ARRAY,
          field: 'type',
          operator: 'or',
          type: CASE_ATTACHMENT_SAVED_OBJECT,
        }),
        perPage: 0,
        aggs: {
          alertIds: {
            terms: {
              field: `${CASE_ATTACHMENT_SAVED_OBJECT}.attributes.attachmentId`,
              size: MAX_ALERTS_PER_CASE,
            },
          },
        },
      });

      const [legacyRes, unifiedRes] = await Promise.all([legacyFindPromise, unifiedFindPromise]);

      const legacyAlertIds =
        legacyRes.aggregations?.alertIds.buckets.map((bucket) => bucket.key) ?? [];
      const unifiedAlertIds =
        unifiedRes.aggregations?.alertIds.buckets.map((bucket) => bucket.key) ?? [];

      return new Set([...legacyAlertIds, ...unifiedAlertIds]);
    } catch (error) {
      this.context.log.error(`Error on GET all alerts ids for case id ${caseId}: ${error}`);
      throw error;
    }
  }

  /**
   * Retrieves all the events attached to a case.
   */
  public async getAllEventIds({
    caseId,
    owner,
  }: {
    caseId: string;
    owner: string;
  }): Promise<Set<string>> {
    try {
      this.context.log.debug(`Attempting to GET all event ids for case id ${caseId}`);
      const legacyEventsFilter = buildFilter({
        filters: [AttachmentType.event],
        field: 'type',
        operator: 'or',
        type: CASE_COMMENT_SAVED_OBJECT,
      });
      const unifiedEventsFilter = buildFilter({
        filters: [toUnifiedAttachmentType(AttachmentType.event, owner)],
        field: 'type',
        operator: 'or',
        type: CASE_ATTACHMENT_SAVED_OBJECT,
      });
      const eventsFilter = combineFilters(
        [legacyEventsFilter, unifiedEventsFilter],
        NodeBuilderOperators.or
      );

      const res = await this.context.unsecuredSavedObjectsClient.find<unknown, EventIdsAggsResult>({
        type: [CASE_COMMENT_SAVED_OBJECT, CASE_ATTACHMENT_SAVED_OBJECT],
        hasReference: { type: CASE_SAVED_OBJECT, id: caseId },
        sortField: 'created_at',
        sortOrder: 'asc',
        filter: eventsFilter,
        perPage: 0,
        aggs: {
          legacyEventIds: {
            terms: {
              field: `${CASE_COMMENT_SAVED_OBJECT}.attributes.eventId`,
              size: MAX_ALERTS_PER_CASE,
            },
          },
          unifiedEventIds: {
            terms: {
              field: `${CASE_ATTACHMENT_SAVED_OBJECT}.attributes.attachmentId`,
              size: MAX_ALERTS_PER_CASE,
            },
          },
        },
      });

      const legacyEventIds =
        res.aggregations?.legacyEventIds.buckets.map((bucket) => bucket.key) ?? [];
      const unifiedEventIds =
        res.aggregations?.unifiedEventIds.buckets.map((bucket) => bucket.key) ?? [];
      const eventIds = [...legacyEventIds, ...unifiedEventIds];
      return new Set(eventIds);
    } catch (error) {
      this.context.log.error(`Error on GET all event ids for case id ${caseId}: ${error}`);
      throw error;
    }
  }

  public async get({
    savedObjectId,
    mode,
  }: GetAttachmentArgs): Promise<AttachmentSavedObjectTransformedV2> {
    try {
      this.context.log.debug(`Attempting to GET attachment ${savedObjectId}`);

      let res:
        | SavedObject<UnifiedAttachmentAttributes>
        | SavedObject<AttachmentPersistedAttributes>;

      // Try unified first; fall back to legacy on 404 to cover unmigrated rows.
      try {
        res = await this.context.unsecuredSavedObjectsClient.get<UnifiedAttachmentAttributes>(
          CASE_ATTACHMENT_SAVED_OBJECT,
          savedObjectId
        );
      } catch (error) {
        if (!SavedObjectsErrorHelpers.isNotFoundError(error)) {
          throw error;
        }
        this.context.log.debug(
          `Attachment ${savedObjectId} not found in ${CASE_ATTACHMENT_SAVED_OBJECT}, falling back to ${CASE_COMMENT_SAVED_OBJECT}`
        );
        res = await this.context.unsecuredSavedObjectsClient.get<AttachmentPersistedAttributes>(
          CASE_COMMENT_SAVED_OBJECT,
          savedObjectId
        );
      }

      const injectedRes = injectAttachmentSOAttributesFromRefs(
        res as SavedObject<AttachmentPersistedAttributes>
      ) as SavedObject<AttachmentAttributesV2>;
      const transformed = transformAttributesForMode({
        attributes: injectedRes.attributes,
        mode,
      });
      if (transformed.isUnified) {
        return Object.assign(injectedRes, { attributes: transformed.attributes });
      }

      const validatedAttributes = decodeOrThrow(AttachmentTransformedAttributesRt)(
        transformed.attributes
      );

      return Object.assign(injectedRes, { attributes: validatedAttributes });
    } catch (error) {
      this.context.log.error(`Error on GET attachment ${savedObjectId}: ${error}`);
      throw error;
    }
  }

  public async getCaseAttatchmentStats({
    caseIds,
  }: {
    caseIds: string[];
  }): Promise<Map<string, AttachmentTotals>> {
    if (caseIds.length <= 0) {
      return new Map();
    }

    interface AggsResult {
      references: {
        caseIds: {
          buckets: Array<{
            key: string;
            doc_count: number;
            reverse: {
              alerts: {
                value: number;
              };
              comments: {
                doc_count: number;
              };
              events: {
                value: number;
              };
            };
          }>;
        };
      };
    }

    const res = await this.context.unsecuredSavedObjectsClient.find<unknown, AggsResult>({
      hasReference: caseIds.map((id) => ({ type: CASE_SAVED_OBJECT, id })),
      hasReferenceOperator: 'OR',
      type: CASE_COMMENT_SAVED_OBJECT,
      perPage: 0,
      aggs: AttachmentGetter.buildCommentStatsAggs(caseIds),
    });

    const statsMap =
      res.aggregations?.references.caseIds.buckets.reduce((acc, idBucket) => {
        acc.set(idBucket.key, {
          userComments: idBucket.reverse.comments.doc_count,
          alerts: idBucket.reverse.alerts.value,
          events: idBucket.reverse.events.value,
        });
        return acc;
      }, new Map<string, AttachmentTotals>()) ?? new Map();

    const unifiedStatsByCase = await this.getUnifiedAttachmentStatsByCaseId(caseIds);
    for (const [caseId, unifiedStats] of unifiedStatsByCase) {
      const existing = statsMap.get(caseId);
      if (existing) {
        statsMap.set(caseId, {
          ...existing,
          userComments: existing.userComments + unifiedStats.userComments,
          alerts: existing.alerts + unifiedStats.alerts,
          events: existing.events + unifiedStats.events,
        });
      } else {
        statsMap.set(caseId, {
          userComments: unifiedStats.userComments,
          alerts: unifiedStats.alerts,
          events: unifiedStats.events,
        });
      }
    }

    return statsMap;
  }

  private async getUnifiedAttachmentStatsByCaseId(
    caseIds: string[]
  ): Promise<Map<string, Pick<AttachmentTotals, 'userComments' | 'events' | 'alerts'>>> {
    interface UnifiedAttachmentAggs {
      refs: {
        caseIds: {
          buckets: Array<{
            key: string;
            reverse: {
              comments: { doc_count: number };
              events: { eventIds: { value: number } };
              alerts: {
                buckets: Record<string, { alertIds: { value: number } }>;
              };
            };
          }>;
        };
      };
    }
    const alertTypeFilters = UNIFIED_ALERT_TYPES_ARRAY.reduce<
      Record<string, { term: Record<string, string> }>
    >((acc, alertType) => {
      acc[alertType] = {
        term: {
          [`${CASE_ATTACHMENT_SAVED_OBJECT}.attributes.type`]: alertType,
        },
      };
      return acc;
    }, {});
    const res = await this.context.unsecuredSavedObjectsClient.find<unknown, UnifiedAttachmentAggs>(
      {
        hasReference: caseIds.map((id) => ({ type: CASE_SAVED_OBJECT, id })),
        hasReferenceOperator: 'OR',
        type: CASE_ATTACHMENT_SAVED_OBJECT,
        perPage: 0,
        aggs: {
          refs: {
            nested: {
              path: `${CASE_ATTACHMENT_SAVED_OBJECT}.references`,
            },
            aggregations: {
              caseIds: {
                terms: {
                  field: `${CASE_ATTACHMENT_SAVED_OBJECT}.references.id`,
                  size: caseIds.length,
                },
                aggregations: {
                  reverse: {
                    reverse_nested: {},
                    aggregations: {
                      comments: {
                        filter: {
                          term: {
                            [`${CASE_ATTACHMENT_SAVED_OBJECT}.attributes.type`]:
                              COMMENT_ATTACHMENT_TYPE,
                          },
                        },
                      },
                      events: {
                        filter: {
                          term: {
                            [`${CASE_ATTACHMENT_SAVED_OBJECT}.attributes.type`]:
                              SECURITY_EVENT_ATTACHMENT_TYPE,
                          },
                        },
                        aggregations: {
                          eventIds: {
                            cardinality: {
                              field: `${CASE_ATTACHMENT_SAVED_OBJECT}.attributes.attachmentId`,
                            },
                          },
                        },
                      },
                      alerts: {
                        filters: {
                          filters: alertTypeFilters,
                        },
                        aggregations: {
                          alertIds: {
                            cardinality: {
                              field: `${CASE_ATTACHMENT_SAVED_OBJECT}.attributes.attachmentId`,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }
    );

    const byCase = new Map<string, Pick<AttachmentTotals, 'userComments' | 'events' | 'alerts'>>();
    const buckets = res.aggregations?.refs?.caseIds?.buckets ?? [];
    for (const bucket of buckets) {
      const alertBuckets = bucket.reverse.alerts?.buckets ?? {};
      const alertCount = Object.values(alertBuckets).reduce(
        (sum, typeBucket) => sum + (typeBucket?.alertIds?.value ?? 0),
        0
      );
      byCase.set(bucket.key, {
        userComments: bucket.reverse.comments.doc_count,
        events: bucket.reverse.events.eventIds.value,
        alerts: alertCount,
      });
    }
    return byCase;
  }

  private static buildCommentStatsAggs(
    ids: string[]
  ): Record<string, estypes.AggregationsAggregationContainer> {
    return {
      references: {
        nested: {
          path: `${CASE_COMMENT_SAVED_OBJECT}.references`,
        },
        aggregations: {
          caseIds: {
            terms: {
              field: `${CASE_COMMENT_SAVED_OBJECT}.references.id`,
              size: ids.length,
            },
            aggregations: {
              reverse: {
                reverse_nested: {},
                aggregations: {
                  alerts: {
                    cardinality: {
                      field: `${CASE_COMMENT_SAVED_OBJECT}.attributes.alertId`,
                    },
                  },
                  comments: {
                    filter: {
                      term: {
                        [`${CASE_COMMENT_SAVED_OBJECT}.attributes.type`]: AttachmentType.user,
                      },
                    },
                  },
                  events: {
                    cardinality: {
                      field: `${CASE_COMMENT_SAVED_OBJECT}.attributes.eventId`,
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  public async getFileAttachments({
    caseId,
    fileIds,
    mode = 'legacy',
  }: {
    caseId: string;
    fileIds: string[];
    mode?: AttachmentMode;
  }): Promise<AttachmentSavedObjectTransformedV2[]> {
    try {
      this.context.log.debug('Attempting to find file attachments');

      /**
       * This is making a big assumption that a single file service saved object can only be associated within a single
       * case. If a single file can be attached to multiple cases it will complicate deleting a file.
       *
       * The file's metadata would have to contain all case ids and deleting a file would need to removing a case id from
       * array instead of deleting the entire saved object in the situation where the file is attached to multiple cases.
       */
      const references = fileIds.map((id) => ({ id, type: FILE_SO_TYPE }));

      /**
       * In the event that we add the ability to attach a file to a case that has already been uploaded we'll run into a
       * scenario where a single file id could be associated with multiple case attachments. So we need
       * to retrieve them all.
       */
      const finder = this.context.unsecuredSavedObjectsClient.createPointInTimeFinder<
        AttachmentPersistedAttributes | UnifiedAttachmentAttributes
      >({
        type: [CASE_COMMENT_SAVED_OBJECT, CASE_ATTACHMENT_SAVED_OBJECT],
        hasReference: references,
        sortField: 'created_at',
        sortOrder: 'asc',
        perPage: MAX_DOCS_PER_PAGE,
      });

      const foundAttachments: AttachmentSavedObjectTransformedV2[] = [];

      for await (const attachmentSavedObjects of finder.find()) {
        foundAttachments.push(
          ...this.transformAndDecodeFileAttachments(attachmentSavedObjects, mode)
        );
      }

      const [validFileAttachments, invalidFileAttachments] = partitionByCaseAssociation(
        caseId,
        foundAttachments
      );

      this.logInvalidFileAssociations(invalidFileAttachments, fileIds, caseId);

      return validFileAttachments;
    } catch (error) {
      this.context.log.error(`Error retrieving file attachments file ids: ${fileIds}: ${error}`);
      throw error;
    }
  }

  private transformAndDecodeFileAttachments(
    response: SavedObjectsFindResponse<AttachmentPersistedAttributes | UnifiedAttachmentAttributes>,
    mode: AttachmentMode
  ): AttachmentSavedObjectTransformedV2[] {
    return response.saved_objects.map((so) => {
      const injectedSo = injectAttachmentSOAttributesFromRefs(
        so as SavedObject<AttachmentPersistedAttributes>
      ) as SavedObject<AttachmentAttributesV2>;

      const transformed = transformAttributesForMode({
        attributes: injectedSo.attributes,
        mode,
      });
      if (transformed.isUnified) {
        return Object.assign(injectedSo, {
          attributes: transformed.attributes,
        }) as AttachmentSavedObjectTransformedV2;
      }

      const validatedAttributes = decodeOrThrow(AttachmentTransformedAttributesRt)(
        transformed.attributes
      );

      return Object.assign(injectedSo, {
        attributes: validatedAttributes,
      }) as AttachmentSavedObjectTransformedV2;
    });
  }

  private logInvalidFileAssociations(
    attachments: Array<SavedObject<unknown>>,
    fileIds: string[],
    targetCaseId: string
  ) {
    const caseIds: string[] = [];
    for (const attachment of attachments) {
      const caseRefId = getCaseReferenceId(attachment.references);
      if (caseRefId != null) {
        caseIds.push(caseRefId);
      }
    }

    if (caseIds.length > 0) {
      this.context.log.warn(
        `Found files associated to cases outside of request: ${caseIds} file ids: ${fileIds} target case id: ${targetCaseId}`
      );
    }
  }
}
