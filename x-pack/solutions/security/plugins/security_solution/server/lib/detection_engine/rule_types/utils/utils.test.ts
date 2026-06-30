/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import sinon from 'sinon';
import type { TransportResult } from '@elastic/elasticsearch';
import type { FieldCapsResponse } from '@elastic/elasticsearch/lib/api/types';
import { ALERT_REASON, ALERT_RULE_PARAMETERS, ALERT_UUID, TIMESTAMP } from '@kbn/rule-data-utils';

import type { SanitizedRuleAction } from '@kbn/alerting-plugin/common';
import { gapReasonType } from '@kbn/alerting-plugin/common';

import { alertsMock } from '@kbn/alerting-plugin/server/mocks';
import { listMock } from '@kbn/lists-plugin/server/mocks';
import type { ExceptionListClient } from '@kbn/lists-plugin/server';
import { getListArrayMock } from '../../../../../common/detection_engine/schemas/types/lists.mock';
import { getExceptionListItemSchemaMock } from '@kbn/lists-plugin/common/schemas/response/exception_list_item_schema.mock';

moment.suppressDeprecationWarnings = true;

import {
  generateId,
  parseInterval,
  getGapBetweenRuns,
  getGapReason,
  getNumCatchupIntervals,
  getRuleRangeTuples,
  getExceptions,
  hasTimestampFields,
  createErrorsFromShard,
  createSearchAfterReturnTypeFromResponse,
  createSearchAfterReturnType,
  mergeReturns,
  getValidDateFromDoc,
  calculateTotal,
  getTotalHitsValue,
  isDetectionAlert,
  getField,
  addToSearchAfterReturn,
  getUnprocessedExceptionsWarnings,
  getDisabledActionsWarningText,
  calculateFromValue,
  stringifyAfterKey,
} from './utils';
import type { SearchAfterAndBulkCreateReturnType } from '../types';
import {
  sampleSignalHit,
  sampleDocSearchResultsWithSortId,
  sampleEmptyDocSearchResults,
  sampleDocSearchResultsNoSortIdNoHits,
  sampleDocNoSortId,
  sampleAlertDocNoSortIdWithTimestamp,
  sampleAlertDocAADNoSortIdWithTimestamp,
} from '../__mocks__/es_results';
import type { ShardError } from '../../../types';
import { ruleExecutionLogMock } from '../../rule_monitoring/mocks';
import type { GenericBulkCreateResponse } from '../factories';
import type { DetectionAlertLatest } from '../../../../../common/api/detection_engine/model/alerts';
import type { AlertingServerSetup } from '@kbn/alerting-plugin/server';

describe('utils', () => {
  const anchor = '2020-01-01T06:06:06.666Z';
  const unix = moment(anchor).valueOf();
  let nowDate = moment('2020-01-01T00:00:00.000Z');
  let clock: sinon.SinonFakeTimers;
  let ruleExecutionLogger: ReturnType<typeof ruleExecutionLogMock.forExecutors.create>;

  beforeEach(() => {
    nowDate = moment('2020-01-01T00:00:00.000Z');
    clock = sinon.useFakeTimers(unix);
    ruleExecutionLogger = ruleExecutionLogMock.forExecutors.create();
  });

  afterEach(() => {
    clock.restore();
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe('generateId', () => {
    test('it generates expected output', () => {
      const id = generateId('index-123', 'doc-123', 'version-123', 'rule-123');
      expect(id).toEqual('10622e7d06c9e38a532e71fc90e3426c1100001fb617aec8cb974075da52db06');
    });

    test('expected output is a hex', () => {
      const id = generateId('index-123', 'doc-123', 'version-123', 'rule-123');
      expect(id).toMatch(/[a-f0-9]+/);
    });
  });

  describe('parseInterval', () => {
    test('it returns a duration when given one that is valid', () => {
      const duration = parseInterval('5m');
      expect(duration).not.toBeNull();
      expect(duration?.asMilliseconds()).toEqual(moment.duration(5, 'minutes').asMilliseconds());
    });

    test('it throws given an invalid duration', () => {
      const duration = parseInterval('junk');
      expect(duration).toBeNull();
    });
  });

  describe('getGapBetweenRuns', () => {
    test('it returns a gap of 0 when "from" and interval match each other and the previous started was from the previous interval time', () => {
      const gap = getGapBetweenRuns({
        previousStartedAt: nowDate.clone().subtract(5, 'minutes').toDate(),
        startedAt: nowDate.clone().toDate(),
        originalFrom: nowDate.clone().subtract(5, 'minutes'),
        originalTo: nowDate.clone(),
      });
      expect(gap).not.toBeNull();
      expect(gap?.asMilliseconds()).toEqual(0);
    });

    test('it returns a negative gap of 1 minute when "from" overlaps to by 1 minute and the previousStartedAt was 5 minutes ago', () => {
      const gap = getGapBetweenRuns({
        previousStartedAt: nowDate.clone().subtract(5, 'minutes').toDate(),
        startedAt: nowDate.clone().toDate(),
        originalFrom: nowDate.clone().subtract(6, 'minutes'),
        originalTo: nowDate.clone(),
      });
      expect(gap).not.toBeNull();
      expect(gap?.asMilliseconds()).toEqual(moment.duration(-1, 'minute').asMilliseconds());
    });

    test('it returns a negative gap of 5 minutes when "from" overlaps to by 1 minute and the previousStartedAt was 5 minutes ago', () => {
      const gap = getGapBetweenRuns({
        previousStartedAt: nowDate.clone().subtract(5, 'minutes').toDate(),
        startedAt: nowDate.clone().toDate(),
        originalFrom: nowDate.clone().subtract(10, 'minutes'),
        originalTo: nowDate.clone(),
      });
      expect(gap).not.toBeNull();
      expect(gap?.asMilliseconds()).toEqual(moment.duration(-5, 'minute').asMilliseconds());
    });

    test('it returns a negative gap of 1 minute when "from" overlaps to by 1 minute and the previousStartedAt was 10 minutes ago and so was the interval', () => {
      const gap = getGapBetweenRuns({
        previousStartedAt: nowDate.clone().subtract(10, 'minutes').toDate(),
        startedAt: nowDate.clone().toDate(),
        originalFrom: nowDate.clone().subtract(11, 'minutes'),
        originalTo: nowDate.clone(),
      });
      expect(gap).not.toBeNull();
      expect(gap?.asMilliseconds()).toEqual(moment.duration(-1, 'minute').asMilliseconds());
    });

    test('it returns a gap of only -30 seconds when the from overlaps with now by 1 minute, the interval is 5 minutes but the previous started is 30 seconds more', () => {
      const gap = getGapBetweenRuns({
        previousStartedAt: nowDate.clone().subtract(5, 'minutes').subtract(30, 'seconds').toDate(),
        startedAt: nowDate.clone().toDate(),
        originalFrom: nowDate.clone().subtract(6, 'minutes'),
        originalTo: nowDate.clone(),
      });
      expect(gap).not.toBeNull();
      expect(gap?.asMilliseconds()).toEqual(moment.duration(-30, 'seconds').asMilliseconds());
    });

    test('it returns an exact 0 gap when the from overlaps with now by 1 minute, the interval is 5 minutes but the previous started is one minute late', () => {
      const gap = getGapBetweenRuns({
        previousStartedAt: nowDate.clone().subtract(6, 'minutes').toDate(),
        startedAt: nowDate.clone().toDate(),
        originalFrom: nowDate.clone().subtract(6, 'minutes'),
        originalTo: nowDate.clone(),
      });
      expect(gap).not.toBeNull();
      expect(gap?.asMilliseconds()).toEqual(moment.duration(0, 'minute').asMilliseconds());
    });

    test('it returns a gap of 30 seconds when the from overlaps with now by 1 minute, the interval is 5 minutes but the previous started is one minute and 30 seconds late', () => {
      const gap = getGapBetweenRuns({
        previousStartedAt: nowDate.clone().subtract(6, 'minutes').subtract(30, 'seconds').toDate(),
        startedAt: nowDate.clone().toDate(),
        originalFrom: nowDate.clone().subtract(6, 'minutes'),
        originalTo: nowDate.clone(),
      });
      expect(gap).not.toBeNull();
      expect(gap?.asMilliseconds()).toEqual(moment.duration(30, 'seconds').asMilliseconds());
    });

    test('it returns a gap of 1 minute when the from overlaps with now by 1 minute, the interval is 5 minutes but the previous started is two minutes late', () => {
      const gap = getGapBetweenRuns({
        previousStartedAt: nowDate.clone().subtract(7, 'minutes').toDate(),
        startedAt: nowDate.clone().toDate(),
        originalFrom: nowDate.clone().subtract(6, 'minutes'),
        originalTo: nowDate.clone(),
      });
      expect(gap?.asMilliseconds()).not.toBeNull();
      expect(gap?.asMilliseconds()).toEqual(moment.duration(1, 'minute').asMilliseconds());
    });

    test('it returns 0 if given a previousStartedAt of null', () => {
      const gap = getGapBetweenRuns({
        previousStartedAt: null,
        startedAt: nowDate.clone().toDate(),
        originalFrom: nowDate.clone().subtract(5, 'minutes'),
        originalTo: nowDate.clone(),
      });
      expect(gap.asMilliseconds()).toEqual(0);
    });
  });

  describe('getGapReason', () => {
    test('returns rule_disabled when rule was disabled for a long time and ran promptly after re-enable', () => {
      const previousStartedAt = new Date('2024-01-01T14:30:00.000Z');
      const lastEnabledAt = new Date('2024-01-01T16:00:00.000Z');
      const startedAt = new Date('2024-01-01T16:05:00.000Z');
      const originalFrom = moment(startedAt).subtract(6, 'minutes');
      const originalTo = moment(startedAt);

      const reason = getGapReason({
        previousStartedAt,
        startedAt,
        lastEnabledAt,
        originalFrom,
        originalTo,
      });
      expect(reason).toEqual({ type: gapReasonType.RULE_DISABLED });
    });

    test('returns rule_did_not_run when rule was disabled briefly but TM delayed significantly', () => {
      const previousStartedAt = new Date('2024-01-01T14:30:00.000Z');
      const lastEnabledAt = new Date('2024-01-01T14:32:00.000Z');
      const startedAt = new Date('2024-01-01T16:00:00.000Z');
      const originalFrom = moment(startedAt).subtract(6, 'minutes');
      const originalTo = moment(startedAt);

      const reason = getGapReason({
        previousStartedAt,
        startedAt,
        lastEnabledAt,
        originalFrom,
        originalTo,
      });
      expect(reason).toEqual({ type: gapReasonType.RULE_DID_NOT_RUN });
    });

    test('returns rule_did_not_run when rule was never disabled (lastEnabledAt before previousStartedAt)', () => {
      const previousStartedAt = new Date('2024-01-01T14:30:00.000Z');
      const lastEnabledAt = new Date('2024-01-01T09:00:00.000Z');
      const startedAt = new Date('2024-01-01T16:00:00.000Z');
      const originalFrom = moment(startedAt).subtract(6, 'minutes');
      const originalTo = moment(startedAt);

      const reason = getGapReason({
        previousStartedAt,
        startedAt,
        lastEnabledAt,
        originalFrom,
        originalTo,
      });
      expect(reason).toEqual({ type: gapReasonType.RULE_DID_NOT_RUN });
    });

    test('returns rule_did_not_run when lastEnabledAt is null', () => {
      const reason = getGapReason({
        previousStartedAt: new Date('2024-01-01T14:30:00.000Z'),
        startedAt: new Date('2024-01-01T16:00:00.000Z'),
        lastEnabledAt: null,
        originalFrom: moment('2024-01-01T15:54:00.000Z'),
        originalTo: moment('2024-01-01T16:00:00.000Z'),
      });
      expect(reason).toEqual({ type: gapReasonType.RULE_DID_NOT_RUN });
    });

    test('returns rule_did_not_run when previousStartedAt is null', () => {
      const reason = getGapReason({
        previousStartedAt: null,
        startedAt: new Date('2024-01-01T16:00:00.000Z'),
        lastEnabledAt: new Date('2024-01-01T15:58:00.000Z'),
        originalFrom: moment('2024-01-01T15:54:00.000Z'),
        originalTo: moment('2024-01-01T16:00:00.000Z'),
      });
      expect(reason).toEqual({ type: gapReasonType.RULE_DID_NOT_RUN });
    });

    test('returns rule_disabled when post-enable delay equals drift tolerance exactly', () => {
      const previousStartedAt = new Date('2024-01-01T14:30:00.000Z');
      const lastEnabledAt = new Date('2024-01-01T15:54:00.000Z');
      const startedAt = new Date('2024-01-01T16:00:00.000Z');
      const originalFrom = moment(startedAt).subtract(6, 'minutes');
      const originalTo = moment(startedAt);

      const reason = getGapReason({
        previousStartedAt,
        startedAt,
        lastEnabledAt,
        originalFrom,
        originalTo,
      });
      expect(reason).toEqual({ type: gapReasonType.RULE_DISABLED });
    });

    test('returns rule_did_not_run when post-enable delay exceeds drift tolerance by 1ms', () => {
      const startedAt = new Date('2024-01-01T16:00:00.000Z');
      const originalFrom = moment(startedAt).subtract(6, 'minutes');
      const originalTo = moment(startedAt);
      const driftToleranceMs = originalTo.diff(originalFrom);
      const lastEnabledAt = new Date(startedAt.getTime() - driftToleranceMs - 1);

      const reason = getGapReason({
        previousStartedAt: new Date('2024-01-01T14:30:00.000Z'),
        startedAt,
        lastEnabledAt,
        originalFrom,
        originalTo,
      });
      expect(reason).toEqual({ type: gapReasonType.RULE_DID_NOT_RUN });
    });

    test('returns rule_did_not_run when lastEnabledAt equals previousStartedAt', () => {
      const previousStartedAt = new Date('2024-01-01T14:30:00.000Z');
      const reason = getGapReason({
        previousStartedAt,
        startedAt: new Date('2024-01-01T16:00:00.000Z'),
        lastEnabledAt: previousStartedAt,
        originalFrom: moment('2024-01-01T15:54:00.000Z'),
        originalTo: moment('2024-01-01T16:00:00.000Z'),
      });
      expect(reason).toEqual({ type: gapReasonType.RULE_DID_NOT_RUN });
    });
  });

  describe('getRuleRangeTuples', () => {
    let alerting: AlertingServerSetup;

    beforeEach(() => {
      alerting = alertsMock.createSetup();
      alerting.getConfig = jest.fn().mockReturnValue({ run: { alerts: { max: 1000 } } });
    });

    test('should return a single tuple if no gap', async () => {
      const { tuples, remainingGap, warningStatusMessage } = await getRuleRangeTuples({
        previousStartedAt: moment().subtract(30, 's').toDate(),
        startedAt: moment().subtract(30, 's').toDate(),
        interval: '30s',
        from: 'now-30s',
        to: 'now',
        maxSignals: 20,
        ruleExecutionLogger,
        alerting,
        lastEnabledAt: undefined,
      });
      const someTuple = tuples[0];
      expect(moment(someTuple.to).diff(moment(someTuple.from), 's')).toEqual(30);
      expect(tuples.length).toEqual(1);
      expect(remainingGap.asMilliseconds()).toEqual(0);
      expect(warningStatusMessage).toEqual(undefined);
    });

    test('should return a single tuple if malformed interval prevents gap calculation', async () => {
      const { tuples, remainingGap, warningStatusMessage } = await getRuleRangeTuples({
        previousStartedAt: moment().subtract(30, 's').toDate(),
        startedAt: moment().subtract(30, 's').toDate(),
        interval: 'invalid',
        from: 'now-30s',
        to: 'now',
        maxSignals: 20,
        ruleExecutionLogger,
        alerting,
        lastEnabledAt: undefined,
      });
      const someTuple = tuples[0];
      expect(moment(someTuple.to).diff(moment(someTuple.from), 's')).toEqual(30);
      expect(tuples.length).toEqual(1);
      expect(remainingGap.asMilliseconds()).toEqual(0);
      expect(warningStatusMessage).toEqual(undefined);
    });

    test('should return two tuples if gap and previouslyStartedAt', async () => {
      const previouslyStartedAt = moment().subtract(65, 's').toDate();
      const startedAt = moment().toDate();
      const { tuples, remainingGap, warningStatusMessage, gap } = await getRuleRangeTuples({
        previousStartedAt: previouslyStartedAt,
        startedAt,
        interval: '50s',
        from: 'now-55s',
        to: 'now',
        maxSignals: 20,
        ruleExecutionLogger,
        alerting,
        lastEnabledAt: undefined,
      });
      const someTuple = tuples[1];
      expect(moment(someTuple.to).diff(moment(someTuple.from), 's')).toEqual(55);
      expect(remainingGap.asMilliseconds()).toEqual(0);
      expect(warningStatusMessage).toEqual(undefined);
      expect(gap).toEqual(undefined);
    });

    test('should return five tuples when give long gap', async () => {
      const previousStartedAt = moment().subtract(65, 's').toDate(); // 64 is 5 times the interval + lookback, which will trigger max lookback
      const startedAt = moment().toDate();
      const { tuples, remainingGap, warningStatusMessage, gap } = await getRuleRangeTuples({
        previousStartedAt,
        startedAt,
        interval: '10s',
        from: 'now-13s',
        to: 'now',
        maxSignals: 20,
        ruleExecutionLogger,
        alerting,
        lastEnabledAt: undefined,
      });
      expect(tuples.length).toEqual(5);
      tuples.forEach((item, index) => {
        if (index === 0) {
          return;
        }
        expect(moment(item.to).diff(moment(item.from), 's')).toEqual(13);
        expect(item.to.diff(tuples[index - 1].to, 's')).toEqual(10);
        expect(item.from.diff(tuples[index - 1].from, 's')).toEqual(10);
      });
      expect(remainingGap.asMilliseconds()).toEqual(12000);
      expect(warningStatusMessage).toEqual(undefined);
      expect(gap?.gte).toEqual(previousStartedAt.toISOString());
      expect(gap?.lte).toEqual(moment(previousStartedAt).add(remainingGap, 'ms').toISOString());
    });

    test('should return gapReason as rule_did_not_run when gap exists and lastEnabledAt is undefined', async () => {
      const previousStartedAt = moment().subtract(65, 's').toDate();
      const startedAt = moment().toDate();
      const { gapReason } = await getRuleRangeTuples({
        previousStartedAt,
        startedAt,
        interval: '10s',
        from: 'now-13s',
        to: 'now',
        maxSignals: 20,
        ruleExecutionLogger,
        alerting,
        lastEnabledAt: undefined,
      });
      expect(gapReason).toEqual({ type: gapReasonType.RULE_DID_NOT_RUN });
    });

    test('should return gapReason as rule_disabled when gap exists and rule was recently re-enabled', async () => {
      const previousStartedAt = moment().subtract(65, 's').toDate();
      const startedAt = moment().toDate();
      const lastEnabledAt = moment().subtract(5, 's').toDate();
      const { gapReason } = await getRuleRangeTuples({
        previousStartedAt,
        startedAt,
        interval: '10s',
        from: 'now-13s',
        to: 'now',
        maxSignals: 20,
        ruleExecutionLogger,
        alerting,
        lastEnabledAt,
      });
      expect(gapReason).toEqual({ type: gapReasonType.RULE_DISABLED });
    });

    test('should not return gapReason when there is no gap', async () => {
      const { gapReason } = await getRuleRangeTuples({
        previousStartedAt: moment().subtract(30, 's').toDate(),
        startedAt: moment().subtract(30, 's').toDate(),
        interval: '30s',
        from: 'now-30s',
        to: 'now',
        maxSignals: 20,
        ruleExecutionLogger,
        alerting,
        lastEnabledAt: undefined,
      });
      expect(gapReason).toBeUndefined();
    });

    test('should return a single tuple when give a negative gap (rule ran sooner than expected)', async () => {
      const { tuples, remainingGap, warningStatusMessage } = await getRuleRangeTuples({
        previousStartedAt: moment().subtract(-15, 's').toDate(),
        startedAt: moment().subtract(-15, 's').toDate(),
        interval: '10s',
        from: 'now-13s',
        to: 'now',
        maxSignals: 20,
        ruleExecutionLogger,
        alerting,
        lastEnabledAt: undefined,
      });
      expect(tuples.length).toEqual(1);
      const someTuple = tuples[0];
      expect(moment(someTuple.to).diff(moment(someTuple.from), 's')).toEqual(13);
      expect(remainingGap.asMilliseconds()).toEqual(0);
      expect(warningStatusMessage).toEqual(undefined);
    });

    test('should use alerting framework max alerts value if maxSignals is greater than limit', async () => {
      alerting.getConfig = jest.fn().mockReturnValue({ run: { alerts: { max: 10 } } });
      const { tuples, warningStatusMessage } = await getRuleRangeTuples({
        previousStartedAt: moment().subtract(30, 's').toDate(),
        startedAt: moment().subtract(30, 's').toDate(),
        interval: '30s',
        from: 'now-30s',
        to: 'now',
        maxSignals: 20,
        ruleExecutionLogger,
        alerting,
        lastEnabledAt: undefined,
      });
      const someTuple = tuples[0];
      expect(someTuple.maxSignals).toEqual(10);
      expect(tuples.length).toEqual(1);
      expect(warningStatusMessage).toEqual(
        "The rule's max alerts per run setting (20) is greater than the Kibana alerting limit (10). The rule will only write a maximum of 10 alerts per rule run."
      );
    });

    test('should use maxSignals value if maxSignals is less than alerting framework limit', async () => {
      const { tuples, warningStatusMessage } = await getRuleRangeTuples({
        previousStartedAt: moment().subtract(30, 's').toDate(),
        startedAt: moment().subtract(30, 's').toDate(),
        interval: '30s',
        from: 'now-30s',
        to: 'now',
        maxSignals: 20,
        ruleExecutionLogger,
        alerting,
        lastEnabledAt: undefined,
      });
      const someTuple = tuples[0];
      expect(someTuple.maxSignals).toEqual(20);
      expect(tuples.length).toEqual(1);
      expect(warningStatusMessage).toEqual(undefined);
    });

    test('should return originalFrom and originalTo in response', async () => {
      const { originalFrom, originalTo } = await getRuleRangeTuples({
        previousStartedAt: moment().subtract(30, 's').toDate(),
        startedAt: moment().toDate(),
        interval: '30s',
        from: 'now-30s',
        to: 'now',
        maxSignals: 20,
        ruleExecutionLogger,
        alerting,
        lastEnabledAt: undefined,
      });

      expect(originalFrom).toBeDefined();
      expect(originalTo).toBeDefined();
      expect(moment.duration(originalTo.diff(originalFrom)).asSeconds()).toEqual(30);
    });
  });

  describe('calculateFromValue', () => {
    test('should return formatted `from` value from rule schedule fields', () => {
      const from = calculateFromValue('5m', '4m');
      expect(from).toEqual('now-540s');
    });

    test('should return formatted `from` value from rule schedule fields with no lookback', () => {
      const from = calculateFromValue('5m', '0m');
      expect(from).toEqual('now-300s');
    });

    test('should return formatted `from` value from rule schedule fields with invalid moment fields', () => {
      const from = calculateFromValue('5', '5');
      expect(from).toEqual('now-0s');
    });
  });

  describe('getMaxCatchupRatio', () => {
    test('should return 0 if gap is 0', () => {
      const catchup = getNumCatchupIntervals({
        gap: moment.duration(0),
        intervalDuration: moment.duration(11000),
      });
      expect(catchup).toEqual(0);
    });

    test('should return 1 if gap is in (0, intervalDuration]', () => {
      const catchup = getNumCatchupIntervals({
        gap: moment.duration(10000),
        intervalDuration: moment.duration(10000),
      });
      expect(catchup).toEqual(1);
    });

    test('should round up return value', () => {
      const catchup = getNumCatchupIntervals({
        gap: moment.duration(15000),
        intervalDuration: moment.duration(11000),
      });
      expect(catchup).toEqual(2);
    });
  });

  describe('#getExceptions', () => {
    test('it successfully returns array of exception list items', async () => {
      listMock.getExceptionListClient = () =>
        ({
          findExceptionListItemsPointInTimeFinder: jest
            .fn()
            .mockImplementationOnce(({ executeFunctionOnStream }) => {
              executeFunctionOnStream({ data: [getExceptionListItemSchemaMock()] });
            }),
        } as unknown as ExceptionListClient);
      const client = listMock.getExceptionListClient();
      const exceptions = await getExceptions({
        client,
        lists: getListArrayMock(),
        shouldFilterOutEndpointExceptions: true,
      });

      expect(client.findExceptionListItemsPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          listId: ['list_id_single'],
          namespaceType: ['single'],
          perPage: 1_000,
          filter: [],
          maxSize: undefined,
          sortOrder: undefined,
          sortField: undefined,
        })
      );
      expect(exceptions).toEqual([getExceptionListItemSchemaMock()]);
    });

    test('it throws if "findExceptionListItemsPointInTimeFinder" fails anywhere', async () => {
      const err = new Error('error fetching list');
      listMock.getExceptionListClient = () =>
        ({
          findExceptionListItemsPointInTimeFinder: jest.fn().mockRejectedValue(err),
        } as unknown as ExceptionListClient);

      await expect(() =>
        getExceptions({
          client: listMock.getExceptionListClient(),
          lists: getListArrayMock(),
          shouldFilterOutEndpointExceptions: true,
        })
      ).rejects.toThrowError(
        'unable to fetch exception list items, message: "error fetching list" full error: "Error: error fetching list"'
      );
    });

    test('it returns empty array if "findExceptionListsItem" returns null', async () => {
      listMock.getExceptionListClient = () =>
        ({
          findExceptionListsItem: jest.fn().mockResolvedValue(null),
        } as unknown as ExceptionListClient);

      const exceptions = await getExceptions({
        client: listMock.getExceptionListClient(),
        lists: [],
        shouldFilterOutEndpointExceptions: true,
      });

      expect(exceptions).toEqual([]);
    });
  });

  describe('hasTimestampFields', () => {
    test('returns true when missing timestamp override field', async () => {
      const timestampField = 'event.ingested';
      const timestampFieldCapsResponse: Partial<TransportResult<FieldCapsResponse, unknown>> = {
        body: {
          indices: ['myfakeindex-1', 'myfakeindex-2', 'myfakeindex-3', 'myfakeindex-4'],
          fields: {
            [timestampField]: {
              date: {
                type: 'date',
                searchable: true,
                aggregatable: true,
                indices: ['myfakeindex-3', 'myfakeindex-4'],
              },
              unmapped: {
                type: 'unmapped',
                searchable: false,
                aggregatable: false,
                indices: ['myfakeindex-1', 'myfakeindex-2'],
              },
            },
          },
        },
      };

      const { foundNoIndices, warningMessage } = await hasTimestampFields({
        timestampField,
        timestampFieldCapsResponse: timestampFieldCapsResponse as TransportResult<
          FieldCapsResponse,
          unknown
        >,
        ruleExecutionLogger,
      });

      expect(foundNoIndices).toBeFalsy();
      expect(warningMessage).toBe(
        'The following indices are missing the timestamp override field "event.ingested": ["myfakeindex-1","myfakeindex-2"]'
      );
    });

    test('returns true when missing timestamp field', async () => {
      const timestampField = '@timestamp';
      const timestampFieldCapsResponse: Partial<TransportResult<FieldCapsResponse, unknown>> = {
        body: {
          indices: ['myfakeindex-1', 'myfakeindex-2', 'myfakeindex-3', 'myfakeindex-4'],
          fields: {
            [timestampField]: {
              date: {
                type: 'date',
                searchable: true,
                aggregatable: true,
                indices: ['myfakeindex-3', 'myfakeindex-4'],
              },
              unmapped: {
                type: 'unmapped',
                searchable: false,
                aggregatable: false,
                indices: ['myfakeindex-1', 'myfakeindex-2'],
              },
            },
          },
        },
      };

      const { foundNoIndices, warningMessage } = await hasTimestampFields({
        timestampField,
        timestampFieldCapsResponse: timestampFieldCapsResponse as TransportResult<
          FieldCapsResponse,
          unknown
        >,
        ruleExecutionLogger,
      });

      expect(foundNoIndices).toBeFalsy();
      expect(warningMessage).toBe(
        'The following indices are missing the timestamp field "@timestamp": ["myfakeindex-1","myfakeindex-2"]'
      );
    });
  });

  describe('createErrorsFromShard', () => {
    test('empty errors will return an empty array', () => {
      const createdErrors = createErrorsFromShard({ errors: [] });
      expect(createdErrors).toEqual([]);
    });

    test('single error will return single converted array of a string of a reason', () => {
      const errors: ShardError[] = [
        {
          shard: 1,
          index: 'index-123',
          node: 'node-123',
          reason: {
            type: 'some type',
            reason: 'some reason',
            index_uuid: 'uuid-123',
            index: 'index-123',
            caused_by: {
              type: 'some type',
              reason: 'some reason',
            },
          },
        },
      ];
      const createdErrors = createErrorsFromShard({ errors });
      expect(createdErrors).toEqual([
        'index: "index-123" reason: "some reason" type: "some type" caused by reason: "some reason" caused by type: "some type"',
      ]);
    });

    test('two errors will return two converted arrays to a string of a reason', () => {
      const errors: ShardError[] = [
        {
          shard: 1,
          index: 'index-123',
          node: 'node-123',
          reason: {
            type: 'some type',
            reason: 'some reason',
            index_uuid: 'uuid-123',
            index: 'index-123',
            caused_by: {
              type: 'some type',
              reason: 'some reason',
            },
          },
        },
        {
          shard: 2,
          index: 'index-345',
          node: 'node-345',
          reason: {
            type: 'some type 2',
            reason: 'some reason 2',
            index_uuid: 'uuid-345',
            index: 'index-345',
            caused_by: {
              type: 'some type 2',
              reason: 'some reason 2',
            },
          },
        },
      ];
      const createdErrors = createErrorsFromShard({ errors });
      expect(createdErrors).toEqual([
        'index: "index-123" reason: "some reason" type: "some type" caused by reason: "some reason" caused by type: "some type"',
        'index: "index-345" reason: "some reason 2" type: "some type 2" caused by reason: "some reason 2" caused by type: "some type 2"',
      ]);
    });

    test('You can have missing values for the shard errors and get the expected output of an empty string', () => {
      const errors: ShardError[] = [
        {
          shard: 1,
          index: 'index-123',
          node: 'node-123',
          reason: {},
        },
      ];
      const createdErrors = createErrorsFromShard({ errors });
      expect(createdErrors).toEqual(['index: "index-123"']);
    });

    test('You can have a single value for the shard errors and get expected output without extra spaces anywhere', () => {
      const errors: ShardError[] = [
        {
          shard: 1,
          index: 'index-123',
          node: 'node-123',
          reason: {
            reason: 'some reason something went wrong',
          },
        },
      ];
      const createdErrors = createErrorsFromShard({ errors });
      expect(createdErrors).toEqual([
        'index: "index-123" reason: "some reason something went wrong"',
      ]);
    });

    test('You can have two values for the shard errors and get expected output with one space exactly between the two values', () => {
      const errors: ShardError[] = [
        {
          shard: 1,
          index: 'index-123',
          node: 'node-123',
          reason: {
            reason: 'some reason something went wrong',
            caused_by: { type: 'some type' },
          },
        },
      ];
      const createdErrors = createErrorsFromShard({ errors });
      expect(createdErrors).toEqual([
        'index: "index-123" reason: "some reason something went wrong" caused by type: "some type"',
      ]);
    });
  });

  describe('createSearchAfterReturnTypeFromResponse', () => {
    test('empty results will return successful type', () => {
      const searchResult = sampleEmptyDocSearchResults();
      const newSearchResult = createSearchAfterReturnTypeFromResponse({
        searchResult,
        primaryTimestamp: TIMESTAMP,
      });
      const expected: SearchAfterAndBulkCreateReturnType = {
        bulkCreateTimes: [],
        enrichmentTimes: [],
        alertsCandidateCount: 0,
        createdSignalsCount: 0,
        createdSignals: [],
        errors: [],
        searchAfterTimes: [],
        success: true,
        warning: false,
        warningMessages: [],
        suppressedAlertsCount: 0,
      };
      expect(newSearchResult).toEqual(expected);
    });

    test('multiple results will return successful type with expected success', () => {
      const searchResult = sampleDocSearchResultsWithSortId();
      const newSearchResult = createSearchAfterReturnTypeFromResponse({
        searchResult,
        primaryTimestamp: TIMESTAMP,
      });
      const expected: SearchAfterAndBulkCreateReturnType = {
        bulkCreateTimes: [],
        enrichmentTimes: [],
        alertsCandidateCount: 1,
        createdSignalsCount: 0,
        createdSignals: [],
        errors: [],
        searchAfterTimes: [],
        success: true,
        warning: false,
        warningMessages: [],
        suppressedAlertsCount: 0,
      };
      expect(newSearchResult).toEqual(expected);
    });

    test('result with error will create success: false within the result set', () => {
      const searchResult = sampleDocSearchResultsNoSortIdNoHits();
      searchResult._shards.failed = 1;
      // @ts-expect-error not full interface
      searchResult._shards.failures = [{ reason: { reason: 'Not a sort failure' } }];
      const { success } = createSearchAfterReturnTypeFromResponse({
        searchResult,
        primaryTimestamp: TIMESTAMP,
      });
      expect(success).toEqual(false);
    });

    test('result with error will create success: false within the result set if failed is 2 or more', () => {
      const searchResult = sampleDocSearchResultsNoSortIdNoHits();
      searchResult._shards.failed = 2;
      // @ts-expect-error not full interface
      searchResult._shards.failures = [{ reason: { reason: 'Not a sort failure' } }];
      const { success } = createSearchAfterReturnTypeFromResponse({
        searchResult,
        primaryTimestamp: TIMESTAMP,
      });
      expect(success).toEqual(false);
    });

    test('result with error will create success: false within the result set if mixed reasons for shard failures', () => {
      const searchResult = sampleDocSearchResultsNoSortIdNoHits();
      searchResult._shards.failed = 2;
      searchResult._shards.failures = [
        // @ts-expect-error not full interface
        { reason: { reason: 'Not a sort failure' } },
        // @ts-expect-error not full interface
        { reason: { reason: 'No mapping found for [@timestamp] in order to sort on' } },
      ];
      const { success } = createSearchAfterReturnTypeFromResponse({
        searchResult,
        primaryTimestamp: TIMESTAMP,
      });
      expect(success).toEqual(false);
    });

    test('result with error will create success: true within the result set if failed is 0', () => {
      const searchResult = sampleDocSearchResultsNoSortIdNoHits();
      searchResult._shards.failed = 0;
      const { success } = createSearchAfterReturnTypeFromResponse({
        searchResult,
        primaryTimestamp: TIMESTAMP,
      });
      expect(success).toEqual(true);
    });

    test('result with error will create success: true within the result set if shard failure reasons are sorting on timestamp field', () => {
      const searchResult = sampleDocSearchResultsNoSortIdNoHits();
      searchResult._shards.failed = 2;
      searchResult._shards.failures = [
        // @ts-expect-error not full interface
        { reason: { reason: 'No mapping found for [event.ingested] in order to sort on' } },
        // @ts-expect-error not full interface
        { reason: { reason: 'No mapping found for [@timestamp] in order to sort on' } },
      ];
      const { success } = createSearchAfterReturnTypeFromResponse({
        searchResult,
        primaryTimestamp: 'event.ingested',
      });
      expect(success).toEqual(true);
    });
  });

  describe('getValidDateFromDoc', () => {
    test('It returns undefined if the search result contains a null timestamp', () => {
      const doc = sampleDocNoSortId();
      (doc._source['@timestamp'] as unknown) = null;
      if (doc.fields != null) {
        (doc.fields['@timestamp'] as unknown) = null;
      }
      const date = getValidDateFromDoc({ doc, primaryTimestamp: TIMESTAMP });
      expect(date).toEqual(undefined);
    });

    test('It returns undefined if the search result contains a undefined timestamp', () => {
      const doc = sampleDocNoSortId();
      (doc._source['@timestamp'] as unknown) = undefined;
      if (doc.fields != null) {
        (doc.fields['@timestamp'] as unknown) = undefined;
      }
      const date = getValidDateFromDoc({ doc, primaryTimestamp: TIMESTAMP });
      expect(date).toEqual(undefined);
    });

    test('It returns undefined if the search result contains an invalid string value', () => {
      const doc = sampleDocNoSortId();
      (doc._source['@timestamp'] as unknown) = 'invalid value';
      if (doc.fields != null) {
        (doc.fields['@timestamp'] as unknown) = ['invalid value'];
      }
      const date = getValidDateFromDoc({ doc, primaryTimestamp: TIMESTAMP });
      expect(date).toEqual(undefined);
    });

    test('It returns normal date time if set', () => {
      const doc = sampleDocNoSortId();
      const date = getValidDateFromDoc({ doc, primaryTimestamp: TIMESTAMP });
      expect(date?.toISOString()).toEqual('2020-04-20T21:27:45.000Z');
    });

    test('It returns date time from field if set there', () => {
      const timestamp = '2020-10-07T19:27:19.136Z';
      let doc = sampleDocNoSortId();
      if (doc == null) {
        throw new TypeError('Test requires one element');
      }
      doc = {
        ...doc,
        fields: {
          '@timestamp': [timestamp],
        },
      };
      const date = getValidDateFromDoc({ doc, primaryTimestamp: TIMESTAMP });
      expect(date?.toISOString()).toEqual(timestamp);
    });

    test('It returns timestampOverride date time if set', () => {
      const override = '2020-10-07T19:20:28.049Z';
      const doc = sampleDocNoSortId();
      doc._source.different_timestamp = new Date(override).toISOString();
      const date = getValidDateFromDoc({ doc, primaryTimestamp: 'different_timestamp' });
      expect(date?.toISOString()).toEqual(override);
    });

    test('It returns timestampOverride date time from fields if set on it', () => {
      const override = '2020-10-07T19:36:31.110Z';
      let doc = sampleDocNoSortId();
      if (doc == null) {
        throw new TypeError('Test requires one element');
      }
      doc = {
        ...doc,
        fields: {
          different_timestamp: [override],
        },
      };
      const date = getValidDateFromDoc({ doc, primaryTimestamp: 'different_timestamp' });
      expect(date?.toISOString()).toEqual(override);
    });

    test('It returns the timestamp if the timestamp happens to be a string of an epoch when it has it in _source and fields', () => {
      const doc = sampleDocNoSortId();
      const testDateString = '2021-06-25T15:53:56.590Z';
      const testDate = `${new Date(testDateString).valueOf()}`;
      doc._source['@timestamp'] = testDate;
      if (doc.fields != null) {
        doc.fields['@timestamp'] = [testDate];
      }
      const date = getValidDateFromDoc({ doc, primaryTimestamp: TIMESTAMP });
      expect(date?.toISOString()).toEqual(testDateString);
    });

    test('It returns the timestamp if the timestamp happens to be a string of an epoch when it has it in _source and fields is nonexistent', () => {
      const doc = sampleDocNoSortId();
      const testDateString = '2021-06-25T15:53:56.590Z';
      const testDate = `${new Date(testDateString).valueOf()}`;
      doc._source['@timestamp'] = testDate;
      doc.fields = undefined;
      const date = getValidDateFromDoc({ doc, primaryTimestamp: TIMESTAMP });
      expect(date?.toISOString()).toEqual(testDateString);
    });

    test('It returns the timestamp if the timestamp happens to be a string of an epoch in an override field', () => {
      const override = '2020-10-07T19:36:31.110Z';
      const testDate = `${new Date(override).valueOf()}`;
      let doc = sampleDocNoSortId();
      if (doc == null) {
        throw new TypeError('Test requires one element');
      }
      doc = {
        ...doc,
        fields: {
          different_timestamp: [testDate],
        },
      };
      const date = getValidDateFromDoc({ doc, primaryTimestamp: 'different_timestamp' });
      expect(date?.toISOString()).toEqual(override);
    });
  });

  describe('createSearchAfterReturnType', () => {
    test('createSearchAfterReturnType will return full object when nothing is passed', () => {
      const searchAfterReturnType = createSearchAfterReturnType();
      const expected: SearchAfterAndBulkCreateReturnType = {
        bulkCreateTimes: [],
        enrichmentTimes: [],
        createdSignalsCount: 0,
        createdSignals: [],
        errors: [],
        searchAfterTimes: [],
        success: true,
        warning: false,
        warningMessages: [],
        suppressedAlertsCount: 0,
      };
      expect(searchAfterReturnType).toEqual(expected);
    });

    test('createSearchAfterReturnType can override all values', () => {
      const searchAfterReturnType = createSearchAfterReturnType({
        bulkCreateTimes: ['123'],
        enrichmentTimes: [],
        createdSignalsCount: 5,
        createdSignals: Array(5).fill(sampleSignalHit()),
        errors: ['error 1'],
        searchAfterTimes: ['123'],
        success: false,
        warning: true,
        warningMessages: ['test warning'],
      });
      const expected: SearchAfterAndBulkCreateReturnType = {
        bulkCreateTimes: ['123'],
        enrichmentTimes: [],
        createdSignalsCount: 5,
        createdSignals: Array(5).fill(sampleSignalHit()),
        errors: ['error 1'],
        searchAfterTimes: ['123'],
        success: false,
        warning: true,
        warningMessages: ['test warning'],
        suppressedAlertsCount: 0,
      };
      expect(searchAfterReturnType).toEqual(expected);
    });

    test('createSearchAfterReturnType can override select values', () => {
      const searchAfterReturnType = createSearchAfterReturnType({
        createdSignalsCount: 5,
        createdSignals: Array(5).fill(sampleSignalHit()),
        errors: ['error 1'],
      });
      const expected: SearchAfterAndBulkCreateReturnType = {
        bulkCreateTimes: [],
        enrichmentTimes: [],
        createdSignalsCount: 5,
        createdSignals: Array(5).fill(sampleSignalHit()),
        errors: ['error 1'],
        searchAfterTimes: [],
        success: true,
        warning: false,
        warningMessages: [],
        suppressedAlertsCount: 0,
      };
      expect(searchAfterReturnType).toEqual(expected);
    });
  });

  describe('mergeReturns', () => {
    test('it merges a default "prev" and "next" correctly ', () => {
      const merged = mergeReturns([createSearchAfterReturnType(), createSearchAfterReturnType()]);
      const expected: SearchAfterAndBulkCreateReturnType = {
        bulkCreateTimes: [],
        enrichmentTimes: [],
        createdSignalsCount: 0,
        createdSignals: [],
        errors: [],
        searchAfterTimes: [],
        success: true,
        warning: false,
        warningMessages: [],
        suppressedAlertsCount: 0,
        totalEventsFound: 0,
      };
      expect(merged).toEqual(expected);
    });

    test('it merges search in with two default search results where "prev" "success" is false correctly', () => {
      const { success } = mergeReturns([
        createSearchAfterReturnType({ success: false }),
        createSearchAfterReturnType(),
      ]);
      expect(success).toEqual(false);
    });

    test('it merges search in with two default search results where "next" "success" is false correctly', () => {
      const { success } = mergeReturns([
        createSearchAfterReturnType(),
        createSearchAfterReturnType({ success: false }),
      ]);
      expect(success).toEqual(false);
    });

    test('it merges search where values from "next" and "prev" are computed together', () => {
      const merged = mergeReturns([
        createSearchAfterReturnType({
          bulkCreateTimes: ['123'],
          enrichmentTimes: [],
          createdSignalsCount: 3,
          createdSignals: Array(3).fill(sampleSignalHit()),
          errors: ['error 1', 'error 2'],
          searchAfterTimes: ['123'],
          success: true,
          warningMessages: ['warning1'],
        }),
        createSearchAfterReturnType({
          bulkCreateTimes: ['456'],
          enrichmentTimes: [],
          createdSignalsCount: 2,
          createdSignals: Array(2).fill(sampleSignalHit()),
          errors: ['error 3'],
          searchAfterTimes: ['567'],
          success: true,
          warningMessages: ['warning2'],
          warning: true,
        }),
      ]);
      const expected: SearchAfterAndBulkCreateReturnType = {
        bulkCreateTimes: ['123', '456'], // concatenates the prev and next together
        enrichmentTimes: [],
        createdSignalsCount: 5, // Adds the 3 and 2 together
        createdSignals: Array(5).fill(sampleSignalHit()),
        errors: ['error 1', 'error 2', 'error 3'], // concatenates the prev and next together
        searchAfterTimes: ['123', '567'], // concatenates the searchAfterTimes together
        success: true, // Defaults to success true is all of it was successful
        warning: true,
        warningMessages: ['warning1', 'warning2'],
        suppressedAlertsCount: 0,
        totalEventsFound: 0,
      };
      expect(merged).toEqual(expected);
    });
  });

  describe('addToSearchAfterReturn', () => {
    test('merges the values from bulk create response into search after return type', () => {
      const current = createSearchAfterReturnType();
      const next: GenericBulkCreateResponse<DetectionAlertLatest> = {
        success: false,
        bulkCreateDuration: '100',
        enrichmentDuration: '0',
        createdItemsCount: 1,
        createdItems: [],
        errors: ['new error'],
        alertsWereTruncated: false,
      };
      addToSearchAfterReturn({ current, next });
      expect(current.success).toEqual(false);
      expect(current.bulkCreateTimes).toEqual(['100']);
      expect(current.createdSignalsCount).toEqual(1);
      expect(current.errors).toEqual(['new error']);
    });

    test('does not duplicate error messages', () => {
      const current = createSearchAfterReturnType({ errors: ['error 1'] });
      const next: GenericBulkCreateResponse<DetectionAlertLatest> = {
        success: true,
        bulkCreateDuration: '0',
        enrichmentDuration: '0',
        createdItemsCount: 0,
        createdItems: [],
        errors: ['error 1'],
        alertsWereTruncated: false,
      };
      addToSearchAfterReturn({ current, next });

      expect(current.errors).toEqual(['error 1']);
    });

    test('adds new error messages', () => {
      const current = createSearchAfterReturnType({ errors: ['error 1'] });
      const next: GenericBulkCreateResponse<DetectionAlertLatest> = {
        success: true,
        bulkCreateDuration: '0',
        enrichmentDuration: '0',
        createdItemsCount: 0,
        createdItems: [],
        errors: ['error 2'],
        alertsWereTruncated: false,
      };
      addToSearchAfterReturn({ current, next });

      expect(current.errors).toEqual(['error 1', 'error 2']);
    });
  });

  describe('getTotalHitsValue', () => {
    test('returns value if present as number', () => {
      expect(getTotalHitsValue(sampleDocSearchResultsWithSortId().hits.total)).toBe(1);
    });

    test('returns value if present as value object', () => {
      expect(getTotalHitsValue({ value: 1 })).toBe(1);
    });

    test('returns -1 if not present', () => {
      expect(getTotalHitsValue(undefined)).toBe(-1);
    });
  });

  describe('calculateTotal', () => {
    test('should add totalHits if both totalHits values are numbers', () => {
      expect(calculateTotal(1, 2)).toBe(3);
    });

    test('should return -1 if totalHits is undefined', () => {
      expect(calculateTotal(undefined, 2)).toBe(-1);
    });
  });

  describe('isDetectionAlert', () => {
    test('alert with dotted fields returns true', () => {
      expect(
        isDetectionAlert({
          [ALERT_UUID]: '123',
        })
      ).toEqual(true);
    });

    test('alert with nested fields returns true', () => {
      expect(
        isDetectionAlert({
          kibana: {
            alert: { uuid: '123' },
          },
        })
      ).toEqual(true);
    });

    test('undefined returns false', () => {
      expect(isDetectionAlert(undefined)).toEqual(false);
    });

    test('null returns false', () => {
      expect(isDetectionAlert(null)).toEqual(false);
    });

    test('number returns false', () => {
      expect(isDetectionAlert(5)).toEqual(false);
    });

    test('string returns false', () => {
      expect(isDetectionAlert('a')).toEqual(false);
    });

    test('array returns false', () => {
      expect(isDetectionAlert([])).toEqual(false);
    });

    test('empty object returns false', () => {
      expect(isDetectionAlert({})).toEqual(false);
    });

    test('alert with null value returns false', () => {
      expect(isDetectionAlert({ 'kibana.alert.uuid': null })).toEqual(false);
    });
  });

  describe('getField', () => {
    test('gets legacy field when legacy field name is passed in', () => {
      const doc = sampleAlertDocNoSortIdWithTimestamp();
      const value = getField(doc, 'signal.reason');
      expect(value).toEqual('reasonable reason');
    });

    test('gets AAD field when AAD field name is passed in', () => {
      const doc = sampleAlertDocAADNoSortIdWithTimestamp();
      const value = getField(doc, ALERT_REASON);
      expect(value).toEqual('reasonable reason');
    });

    test('gets legacy field when AAD field name is passed in', () => {
      const doc = sampleAlertDocNoSortIdWithTimestamp();
      const value = getField(doc, ALERT_REASON);
      expect(value).toEqual('reasonable reason');
    });

    test('gets AAD field when legacy field name is passed in', () => {
      const doc = sampleAlertDocAADNoSortIdWithTimestamp();
      const value = getField(doc, 'signal.reason');
      expect(value).toEqual('reasonable reason');
    });

    test('returns `undefined` when AAD field name does not exist', () => {
      const doc = sampleAlertDocNoSortIdWithTimestamp();
      const value = getField(doc, 'kibana.alert.does_not_exist');
      expect(value).toEqual(undefined);
    });

    test('returns `undefined` when legacy field name does not exist', () => {
      const doc = sampleAlertDocAADNoSortIdWithTimestamp();
      const value = getField(doc, 'signal.does_not_exist');
      expect(value).toEqual(undefined);
    });

    test('returns legacy rule param when AAD rule param is passed in', () => {
      const doc = sampleAlertDocNoSortIdWithTimestamp();
      const value = getField(doc, `${ALERT_RULE_PARAMETERS}.description`);
      expect(value).toEqual('Descriptive description');
    });

    test('returns AAD rule param when legacy rule param is passed in', () => {
      const doc = sampleAlertDocAADNoSortIdWithTimestamp();
      const value = getField(doc, 'signal.rule.description');
      expect(value).toEqual('Descriptive description');
    });

    test('gets legacy rule param when legacy rule param is passed in', () => {
      const doc = sampleAlertDocNoSortIdWithTimestamp();
      const value = getField(doc, 'signal.rule.description');
      expect(value).toEqual('Descriptive description');
    });

    test('gets AAD rule param when AAD rule param is passed in', () => {
      const doc = sampleAlertDocAADNoSortIdWithTimestamp();
      const value = getField(doc, `${ALERT_RULE_PARAMETERS}.description`);
      expect(value).toEqual('Descriptive description');
    });
  });

  describe('logUnprocessedExceptionsWarnings', () => {
    test('does not log anything when the array is empty', () => {
      const result = getUnprocessedExceptionsWarnings([]);
      expect(result).toBeUndefined();
    });

    test('logs the exception names when there are unprocessed exceptions', () => {
      const result = getUnprocessedExceptionsWarnings([getExceptionListItemSchemaMock()]);
      expect(result).toEqual(
        `The following exceptions won't be applied to rule execution: ${
          getExceptionListItemSchemaMock().name
        }`
      );
    });
  });

  describe('stringifyAfterKey', () => {
    it('should stringify after_key object with single key value', () => {
      expect(stringifyAfterKey({ 'agent.name': 'test' })).toBe('agent.name: test');
    });
    it('should stringify after_key object with multiple key values', () => {
      expect(stringifyAfterKey({ 'agent.name': 'test', 'destination.ip': '127.0.0.1' })).toBe(
        'agent.name: test, destination.ip: 127.0.0.1'
      );
    });
    it('should return undefined if after_key is undefined', () => {
      expect(stringifyAfterKey(undefined)).toBeUndefined();
    });
  });

  describe('getDisabledActionsWarningText', () => {
    const alertsCreated = true;
    const alertsNotCreated = false;

    const singleDisabledAction = [{ actionTypeId: '.webhook' }];
    const multipleDisabledActionsDiffType = [
      { actionTypeId: '.webhook' },
      { actionTypeId: '.pagerduty' },
    ];
    const multipleDisabledActionsSameType = [
      { actionTypeId: '.webhook' },
      { actionTypeId: '.webhook' },
    ];
    test('returns string for single disabled action with alerts generated', () => {
      const warning = getDisabledActionsWarningText({
        alertsCreated,
        disabledActions: singleDisabledAction as SanitizedRuleAction[],
      });
      expect(warning).toEqual(
        'This rule generated alerts but did not send external notifications because rule action connector .webhook is not enabled. To send notifications, you need a higher Security Analytics license / tier'
      );
    });
    test('returns string for single disabled action with no alerts generated', () => {
      const warning = getDisabledActionsWarningText({
        alertsCreated: alertsNotCreated,
        disabledActions: singleDisabledAction as SanitizedRuleAction[],
      });
      expect(warning).toEqual(
        'Rule action connector .webhook is not enabled. To send notifications, you need a higher Security Analytics license / tier'
      );
    });
    test('returns string for multiple distinct disabled action types with alerts generated', () => {
      const warning = getDisabledActionsWarningText({
        alertsCreated,
        disabledActions: multipleDisabledActionsDiffType as SanitizedRuleAction[],
      });
      expect(warning).toEqual(
        'This rule generated alerts but did not send external notifications because rule action connectors .webhook, .pagerduty are not enabled. To send notifications, you need a higher Security Analytics license / tier'
      );
    });
    test('returns string for multiple distinct disabled action types with alerts NOT generated', () => {
      const warning = getDisabledActionsWarningText({
        alertsCreated: alertsNotCreated,
        disabledActions: multipleDisabledActionsDiffType as SanitizedRuleAction[],
      });
      expect(warning).toEqual(
        'Rule action connectors .webhook, .pagerduty are not enabled. To send notifications, you need a higher Security Analytics license / tier'
      );
    });
    test('returns string for multiple same type disabled action types with alerts generated', () => {
      const warning = getDisabledActionsWarningText({
        alertsCreated,
        disabledActions: multipleDisabledActionsSameType as SanitizedRuleAction[],
      });
      expect(warning).toEqual(
        'This rule generated alerts but did not send external notifications because rule action connector .webhook is not enabled. To send notifications, you need a higher Security Analytics license / tier'
      );
    });

    test('returns string for multiple same type disabled action types with alerts NOT generated', () => {
      const warning = getDisabledActionsWarningText({
        alertsCreated: alertsNotCreated,
        disabledActions: multipleDisabledActionsSameType as SanitizedRuleAction[],
      });
      expect(warning).toEqual(
        'Rule action connector .webhook is not enabled. To send notifications, you need a higher Security Analytics license / tier'
      );
    });
  });
});
