/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import {
  ALERT_CASE_IDS,
  ALERT_INSTANCE_ID,
  ALERT_STATUS,
  ALERT_UUID,
  ALERT_WORKFLOW_STATUS,
  ALERT_WORKFLOW_TAGS,
  EVENT_ACTION,
} from '@kbn/rule-data-utils';
import type {
  BulkRequest,
  BulkResponse,
  BulkResponseItem,
  BulkOperationType,
} from '@elastic/elasticsearch/lib/api/types';

import { resolveAlertConflicts } from './alert_conflict_resolver';

const logger = loggingSystemMock.create().get();
const esClient = elasticsearchServiceMock.createElasticsearchClient();
const ruleId = 'rule-id';
const ruleName = 'name of rule';
const ruleType = 'rule-type';

const ruleInfo = `for ${ruleType}:${ruleId} '${ruleName}'`;
const logTags = { tags: [ruleType, ruleId, 'resolve-alert-conflicts'] };

const alertDoc = {
  [EVENT_ACTION]: 'active',
  [ALERT_STATUS]: 'untracked',
  [ALERT_WORKFLOW_STATUS]: 'a-ok!',
  [ALERT_WORKFLOW_TAGS]: ['fee', 'fi', 'fo', 'fum'],
  [ALERT_CASE_IDS]: ['123', '456', '789'],
  [ALERT_UUID]: 'alert-uuid-from-doc',
  [ALERT_INSTANCE_ID]: 'instance-from-doc',
};

describe('alert_conflict_resolver', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('handles errors gracefully', () => {
    test('when mget fails', async () => {
      const { bulkRequest, bulkResponse } = getReqRes('ic');

      esClient.mget.mockRejectedValueOnce(new Error('mget failed'));

      await resolveAlertConflicts({
        logger,
        esClient,
        bulkRequest,
        bulkResponse,
        ruleId,
        ruleName,
        ruleType,
      });

      expect(logger.error).toHaveBeenNthCalledWith(
        2,
        `Error resolving alert conflicts ${ruleInfo}: mget failed`,
        logTags
      );
    });

    test('when bulk fails', async () => {
      const { bulkRequest, bulkResponse } = getReqRes('ic');

      esClient.mget.mockResolvedValueOnce({
        docs: [getMGetResDoc(0, alertDoc)],
      });
      esClient.bulk.mockRejectedValueOnce(new Error('bulk failed'));

      await resolveAlertConflicts({
        logger,
        esClient,
        bulkRequest,
        bulkResponse,
        ruleId,
        ruleName,
        ruleType,
      });

      expect(logger.error).toHaveBeenNthCalledWith(
        2,
        `Error resolving alert conflicts ${ruleInfo}: bulk failed`,
        logTags
      );
    });
  });

  describe('is successful with', () => {
    test('no bulk results', async () => {
      const { bulkRequest, bulkResponse } = getReqRes('');
      await resolveAlertConflicts({
        logger,
        esClient,
        bulkRequest,
        bulkResponse,
        ruleId,
        ruleName,
        ruleType,
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    test('no errors in bulk results', async () => {
      const { bulkRequest, bulkResponse } = getReqRes('c is is c is');
      await resolveAlertConflicts({
        logger,
        esClient,
        bulkRequest,
        bulkResponse,
        ruleId,
        ruleName,
        ruleType,
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    test('one conflicted doc', async () => {
      const { bulkRequest, bulkResponse } = getReqRes('ic');

      esClient.mget.mockResolvedValueOnce({
        docs: [getMGetResDoc(0, alertDoc)],
      });

      esClient.bulk.mockResolvedValueOnce({
        errors: false,
        took: 0,
        items: [getBulkResItem(0)],
      });

      await resolveAlertConflicts({
        logger,
        esClient,
        bulkRequest,
        bulkResponse,
        ruleId,
        ruleName,
        ruleType,
      });

      expect(logger.error).toHaveBeenNthCalledWith(
        1,
        `Error writing alerts ${ruleInfo}: 0 successful, 1 conflicts, 0 errors: `,
        logTags
      );
      expect(logger.warn).toHaveBeenNthCalledWith(
        1,
        `Alert bulk write conflict ${ruleInfo}: alert UUID 'id-1', instance ID 'instance-from-doc'`,
        logTags
      );
      expect(logger.info).toHaveBeenNthCalledWith(
        1,
        `Retrying bulk update of 1 conflicted alerts ${ruleInfo}`,
        logTags
      );
      expect(logger.info).toHaveBeenNthCalledWith(
        2,
        `Retried bulk update of 1 conflicted alerts succeeded ${ruleInfo}`,
        logTags
      );
    });

    test('one conflicted doc amonst other successes and errors', async () => {
      const { bulkRequest, bulkResponse } = getReqRes('is c ic ie');

      esClient.mget.mockResolvedValueOnce({
        docs: [getMGetResDoc(2, alertDoc)],
      });

      esClient.bulk.mockResolvedValueOnce({
        errors: false,
        took: 0,
        items: [getBulkResItem(2)],
      });

      await resolveAlertConflicts({
        logger,
        esClient,
        bulkRequest,
        bulkResponse,
        ruleId,
        ruleName,
        ruleType,
      });

      expect(logger.error).toHaveBeenNthCalledWith(
        1,
        `Error writing alerts ${ruleInfo}: 2 successful, 1 conflicts, 1 errors: hallo`,
        logTags
      );
      expect(logger.warn).toHaveBeenNthCalledWith(
        1,
        `Alert bulk write conflict ${ruleInfo}: alert UUID 'id-3', instance ID 'instance-from-doc'`,
        logTags
      );
      expect(logger.info).toHaveBeenNthCalledWith(
        1,
        `Retrying bulk update of 1 conflicted alerts ${ruleInfo}`,
        logTags
      );
      expect(logger.info).toHaveBeenNthCalledWith(
        2,
        `Retried bulk update of 1 conflicted alerts succeeded ${ruleInfo}`,
        logTags
      );
    });

    test('multiple conflicted doc amonst other successes and errors', async () => {
      const { bulkRequest, bulkResponse } = getReqRes('is c ic ic ie ic');

      esClient.mget.mockResolvedValueOnce({
        docs: [getMGetResDoc(2, alertDoc), getMGetResDoc(3, alertDoc), getMGetResDoc(5, alertDoc)],
      });

      esClient.bulk.mockResolvedValueOnce({
        errors: false,
        took: 0,
        items: [getBulkResItem(2), getBulkResItem(3), getBulkResItem(5)],
      });

      await resolveAlertConflicts({
        logger,
        esClient,
        bulkRequest,
        bulkResponse,
        ruleId,
        ruleName,
        ruleType,
      });

      expect(logger.error).toHaveBeenNthCalledWith(
        1,
        `Error writing alerts ${ruleInfo}: 2 successful, 3 conflicts, 1 errors: hallo`,
        logTags
      );
      expect(logger.warn).toHaveBeenNthCalledWith(
        1,
        `Alert bulk write conflict ${ruleInfo}: alert UUID 'id-3', instance ID 'instance-from-doc'`,
        logTags
      );
      expect(logger.warn).toHaveBeenNthCalledWith(
        2,
        `Alert bulk write conflict ${ruleInfo}: alert UUID 'id-4', instance ID 'instance-from-doc'`,
        logTags
      );
      expect(logger.warn).toHaveBeenNthCalledWith(
        3,
        `Alert bulk write conflict ${ruleInfo}: alert UUID 'id-6', instance ID 'instance-from-doc'`,
        logTags
      );
      expect(logger.info).toHaveBeenNthCalledWith(
        1,
        `Retrying bulk update of 3 conflicted alerts ${ruleInfo}`,
        logTags
      );
      expect(logger.info).toHaveBeenNthCalledWith(
        2,
        `Retried bulk update of 3 conflicted alerts succeeded ${ruleInfo}`,
        logTags
      );
    });
  });
});

function getBulkResItem(id: number) {
  return {
    index: {
      _index: `index-${id}`,
      _id: `id-${id}`,
      _seq_no: 18,
      _primary_term: 1,
      status: 200,
    },
  };
}

function getMGetResDoc(id: number, doc: unknown) {
  return {
    _index: `index-${id}}`,
    _id: `id-${id}`,
    _seq_no: 18,
    _primary_term: 1,
    found: true,
    _source: doc,
  };
}

interface GetReqResResult {
  bulkRequest: BulkRequest<unknown, unknown>;
  bulkResponse: BulkResponse;
}

/**
 * takes as input a string of c, is, ic, ie tokens and builds appropriate
 * bulk request and response objects to use in the tests:
 * - c: create, ignored by the resolve logic
 * - is: index with success
 * - ic: index with conflict
 * - ie: index with error but not conflict
 */
function getReqRes(bulkOps: string): GetReqResResult {
  const ops = bulkOps.trim().split(/\s+/g);

  const bulkRequest = getBulkRequest();
  const bulkResponse = getBulkResponse();

  bulkRequest.operations = [];
  bulkResponse.items = [];
  bulkResponse.errors = false;

  if (ops[0] === '') return { bulkRequest, bulkResponse };

  const createOp = { create: {} };

  let id = 0;
  for (const op of ops) {
    id++;
    switch (op) {
      // create, ignored by the resolve logic
      case 'c':
        bulkRequest.operations.push(createOp, alertDoc);
        bulkResponse.items.push(getResponseItem('create', id, false, 200));
        break;

      // index with success
      case 'is':
        bulkRequest.operations.push(getIndexOp(id), alertDoc);
        bulkResponse.items.push(getResponseItem('index', id, false, 200));
        break;

      // index with conflict
      case 'ic':
        bulkResponse.errors = true;
        bulkRequest.operations.push(getIndexOp(id), alertDoc);
        bulkResponse.items.push(getResponseItem('index', id, true, 409));
        break;

      // index with error but not conflict
      case 'ie':
        bulkResponse.errors = true;
        bulkRequest.operations.push(getIndexOp(id), alertDoc);
        bulkResponse.items.push(getResponseItem('index', id, true, 418)); // I'm a teapot
        break;

      // developer error
      default:
        throw new Error('bad input');
    }
  }

  return { bulkRequest, bulkResponse };
}

function getBulkRequest(): BulkRequest<unknown, unknown> {
  return {
    refresh: 'wait_for',
    index: 'some-index',
    require_alias: true,
    operations: [],
  };
}

function getIndexOp(id: number) {
  return {
    index: {
      _id: `id-${id}`,
      _index: `index-${id}`,
      if_seq_no: 17,
      if_primary_term: 1,
      require_alias: false,
    },
  };
}

function getBulkResponse(): BulkResponse {
  return {
    errors: false,
    took: 0,
    items: [],
  };
}

function getResponseItem(
  type: BulkOperationType,
  id: number,
  error: boolean,
  status: number
): Partial<Record<BulkOperationType, BulkResponseItem>> {
  if (error) {
    return {
      [type]: {
        _index: `index-${id}`,
        _id: `id-${id}`,
        error: { reason: 'hallo' },
        status,
      },
    };
  }

  return {
    [type]: {
      _index: `index-${id}`,
      _id: `id-${id}`,
      _seq_no: 18,
      _primary_term: 1,
      status: 200,
    },
  };
}
