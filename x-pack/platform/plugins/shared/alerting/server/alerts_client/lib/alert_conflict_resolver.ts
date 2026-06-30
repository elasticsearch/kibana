/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  BulkRequest,
  BulkResponse,
  BulkOperationContainer,
  MgetResponseItem,
} from '@elastic/elasticsearch/lib/api/types';

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import {
  ALERT_INSTANCE_ID,
  ALERT_STATUS,
  ALERT_STATUS_ACTIVE,
  ALERT_STATUS_RECOVERED,
  ALERT_WORKFLOW_STATUS,
  ALERT_WORKFLOW_TAGS,
  ALERT_CASE_IDS,
} from '@kbn/rule-data-utils';

import { zip, get } from 'lodash';
import { sanitizeBulkErrorResponse } from '../..';

// these fields are the one's we'll refresh from the fresh mget'd docs
const REFRESH_FIELDS_ALWAYS = [ALERT_WORKFLOW_STATUS, ALERT_WORKFLOW_TAGS, ALERT_CASE_IDS];
const REFRESH_FIELDS_CONDITIONAL = [ALERT_STATUS];
export const REFRESH_FIELDS_ALL = [...REFRESH_FIELDS_ALWAYS, ...REFRESH_FIELDS_CONDITIONAL];

export interface ResolveAlertConflictsParams {
  esClient: ElasticsearchClient;
  logger: Logger;
  bulkRequest: BulkRequest<unknown, unknown>;
  bulkResponse: BulkResponse;
  ruleId: string;
  ruleName: string;
  ruleType: string;
}

interface NormalizedBulkRequest {
  op: BulkOperationContainer;
  doc: unknown;
}

// wrapper to catch anything thrown; current usage of this function is
// to replace just logging that the error occurred, so we don't want
// to cause _more_ errors ...
export async function resolveAlertConflicts(params: ResolveAlertConflictsParams): Promise<void> {
  const { logger, ruleId, ruleType, ruleName } = params;
  const ruleInfoMessage = `for ${ruleType}:${ruleId} '${ruleName}'`;
  const logTags = { tags: [ruleType, ruleId, 'resolve-alert-conflicts'] };

  try {
    await resolveAlertConflicts_(params);
  } catch (err) {
    logger.error(`Error resolving alert conflicts ${ruleInfoMessage}: ${err.message}`, logTags);
  }
}

async function resolveAlertConflicts_(params: ResolveAlertConflictsParams): Promise<void> {
  const { logger, esClient, bulkRequest, bulkResponse, ruleId, ruleType, ruleName } = params;
  if (bulkRequest.operations && bulkRequest.operations?.length === 0) return;
  if (bulkResponse.items && bulkResponse.items?.length === 0) return;

  const ruleInfoMessage = `for ${ruleType}:${ruleId} '${ruleName}'`;
  const logTags = { tags: [ruleType, ruleId, 'resolve-alert-conflicts'] };

  // get numbers for a summary log message
  const { success, errors, conflicts, messages } = getResponseStats(bulkResponse);
  if (conflicts === 0 && errors === 0) return;

  const allMessages = messages.join('; ');
  logger.error(
    `Error writing alerts ${ruleInfoMessage}: ${success} successful, ${conflicts} conflicts, ${errors} errors: ${allMessages}`,
    logTags
  );

  // get a new bulk request for just conflicted docs
  const conflictRequest = getConflictRequest(bulkRequest, bulkResponse);
  if (conflictRequest.length === 0) return;

  logBulkWriteConflicts(logger, logTags, ruleInfoMessage, conflictRequest);

  // get the fresh versions of those docs
  const freshDocs = await getFreshDocs(esClient, conflictRequest);

  // update the OCC and refresh-able fields
  await updateOCC(conflictRequest, freshDocs);
  await refreshFieldsInDocs(conflictRequest, freshDocs);

  logger.info(
    `Retrying bulk update of ${conflictRequest.length} conflicted alerts ${ruleInfoMessage}`,
    logTags
  );
  const mbrResponse = await makeBulkRequest(params.esClient, params.bulkRequest, conflictRequest);

  if (mbrResponse.bulkResponse?.items.length !== conflictRequest.length) {
    const actual = mbrResponse.bulkResponse?.items.length;
    const expected = conflictRequest.length;
    logger.error(
      `Unexpected number of bulk response items retried; expecting ${expected}, retried ${actual} ${ruleInfoMessage}`,
      logTags
    );
    return;
  }

  if (mbrResponse.error) {
    const index = bulkRequest.index || 'unknown index';
    logger.error(
      `Error writing ${conflictRequest.length} alerts to ${index} ${ruleInfoMessage} - ${mbrResponse.error.message}`,
      logTags
    );
    return;
  }

  if (mbrResponse.errors === 0) {
    logger.info(
      `Retried bulk update of ${conflictRequest.length} conflicted alerts succeeded ${ruleInfoMessage}`,
      logTags
    );
  } else {
    logger.error(
      `Retried bulk update of ${conflictRequest.length} conflicted alerts still had ${mbrResponse.errors} conflicts ${ruleInfoMessage}`,
      logTags
    );
  }
}

// log a warning for each alert write conflict
function logBulkWriteConflicts(
  logger: Logger,
  logTags: { tags: string[] },
  ruleInfoMessage: string,
  conflictRequest: NormalizedBulkRequest[]
): void {
  for (const req of conflictRequest) {
    const alertUuid = req.op?.index?._id || 'unknown';
    const instanceId = get(req.doc, ALERT_INSTANCE_ID) || 'unknown';
    logger.warn(
      `Alert bulk write conflict ${ruleInfoMessage}: alert UUID '${alertUuid}', instance ID '${instanceId}'`,
      logTags
    );
  }
}

interface MakeBulkRequestResponse {
  bulkRequest: BulkRequest;
  bulkResponse?: BulkResponse;
  errors: number;
  error?: Error;
}

// make the bulk request to fix conflicts
async function makeBulkRequest(
  esClient: ElasticsearchClient,
  bulkRequest: BulkRequest,
  conflictRequest: NormalizedBulkRequest[]
): Promise<MakeBulkRequestResponse> {
  const operations = conflictRequest.map((req) => [req.op, req.doc]).flat();
  // just replace the operations from the original request
  const updatedBulkRequest = { ...bulkRequest, operations };

  const bulkResponse = await esClient.bulk(updatedBulkRequest);

  const errors = bulkResponse.items.filter((item) => item.index?.error).length;
  return { bulkRequest, bulkResponse, errors };
}

/** Update refreshable fields in the conflict requests. */
async function refreshFieldsInDocs(
  conflictRequests: NormalizedBulkRequest[],
  freshResponses: MgetResponseItem[]
) {
  for (const [conflictRequest, freshResponse] of zip(conflictRequests, freshResponses)) {
    if (!conflictRequest?.op?.index || !freshResponse) continue;

    // @ts-expect-error @elastic/elasticsearch _source is not in the type!
    const freshDoc = freshResponse._source;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conflictDoc = conflictRequest.doc as Record<string, any>;
    if (!freshDoc || !conflictDoc) continue;

    for (const refreshField of REFRESH_FIELDS_ALWAYS) {
      const val = get(freshDoc, refreshField);
      conflictDoc[refreshField] = val;
    }

    // structured this way to make sure all conditional refresh
    // fields are listed in REFRESH_FIELDS_CONDITIONAL when we mget
    for (const refreshField of REFRESH_FIELDS_CONDITIONAL) {
      switch (refreshField) {
        // hamdling for kibana.alert.status: overwrite conflict doc
        // with fresh version if it's not active or recovered (ie, untracked)
        case ALERT_STATUS:
          const freshStatus = get(freshDoc, ALERT_STATUS);

          if (freshStatus !== ALERT_STATUS_ACTIVE && freshStatus !== ALERT_STATUS_RECOVERED) {
            conflictDoc[ALERT_STATUS] = freshStatus;
          }
          break;
      }
    }
  }
}

/** Update the OCC info in the conflict request with the fresh info. */
async function updateOCC(conflictRequests: NormalizedBulkRequest[], freshDocs: MgetResponseItem[]) {
  for (const [req, freshDoc] of zip(conflictRequests, freshDocs)) {
    if (!req?.op?.index || !freshDoc) continue;

    // @ts-expect-error @elastic/elasticsearch _seq_no is not in the type!
    const seqNo: number | undefined = freshDoc._seq_no;
    // @ts-expect-error @elastic/elasticsearch _primary_term is not in the type!
    const primaryTerm: number | undefined = freshDoc._primary_term;

    if (seqNo === undefined) throw new Error('Unexpected undefined seqNo');
    if (primaryTerm === undefined) throw new Error('Unexpected undefined primaryTerm');

    req.op.index.if_seq_no = seqNo;
    req.op.index.if_primary_term = primaryTerm;
  }
}

/** Get the latest version of the conflicted docs, with fields to refresh. */
async function getFreshDocs(
  esClient: ElasticsearchClient,
  conflictRequests: NormalizedBulkRequest[]
): Promise<MgetResponseItem[]> {
  const docs: Array<{ _id: string; _index: string }> = [];

  conflictRequests.forEach((req) => {
    const [id, index] = [req.op?.index?._id, req.op?.index?._index];
    if (!id || !index) return;

    docs.push({ _id: id, _index: index });
  });

  const mgetRes = await esClient.mget<unknown>({ docs, _source_includes: REFRESH_FIELDS_ALL });

  if (mgetRes.docs.length !== docs.length) {
    throw new Error(
      `Unexpected number of mget response docs; expected ${docs.length}, got ${mgetRes.docs.length}`
    );
  }

  return mgetRes.docs;
}

/** Return the bulk request, filtered to those requests that had conflicts. */
function getConflictRequest(
  bulkRequest: BulkRequest,
  bulkResponse: BulkResponse
): NormalizedBulkRequest[] {
  // first "normalize" the request from it's non-linear form
  const request = normalizeRequest(bulkRequest);

  // maybe we didn't unwind it right ...
  if (request.length !== bulkResponse.items.length) {
    throw new Error('Unexpected number of bulk response items');
  }

  if (request.length === 0) return [];

  // we only want op: index where the status was 409 / conflict
  const conflictRequest = zip(request, bulkResponse.items)
    .filter(([_, res]) => res?.index?.status === 409)
    .map(([req, _]) => req!);

  return conflictRequest;
}

/** Convert a bulk request (op | doc)[] to an array of { op, doc }[]  */
function normalizeRequest(bulkRequest: BulkRequest) {
  if (!bulkRequest.operations) return [];
  const result: NormalizedBulkRequest[] = [];

  let index = 0;
  while (index < bulkRequest.operations.length) {
    // the "op" data
    const op = bulkRequest.operations[index] as NonNullable<BulkOperationContainer>;

    // now the "doc" data, if there is any (none for delete)
    if (op.create || op.index || op.update) {
      index++;
      const doc = bulkRequest.operations[index];
      result.push({ op, doc });
    } else if (op.delete) {
      // no doc for delete op
    } else {
      throw new Error(`Unsupported bulk operation: ${JSON.stringify(op)}`);
    }

    index++;
  }

  return result;
}

interface ResponseStatsResult {
  success: number;
  conflicts: number;
  errors: number;
  messages: string[];
}

// generate a summary of the original bulk request attempt, for logging
function getResponseStats(bulkResponse: BulkResponse): ResponseStatsResult {
  const sanitizedResponse = sanitizeBulkErrorResponse(bulkResponse) as BulkResponse;
  const stats: ResponseStatsResult = { success: 0, conflicts: 0, errors: 0, messages: [] };
  for (const item of sanitizedResponse.items) {
    const op = item.create || item.index || item.update || item.delete;
    if (op?.error) {
      if (op?.status === 409 && op === item.index) {
        stats.conflicts++;
      } else {
        stats.errors++;
        stats.messages.push(op?.error?.reason || 'no bulk reason provided');
      }
    } else {
      stats.success++;
    }
  }
  return stats;
}
