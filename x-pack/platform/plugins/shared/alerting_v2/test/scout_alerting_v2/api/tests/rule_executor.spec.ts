/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * We are excluding the  @kbn/eslint/scout_require_api_client_in_api_test
 * eslint rule for this file because we do not test APIs but the rule executor itself.
 * The correctness of the rule executor relies on how it produces rule events and
 * not on the APIs that are used to create the rule and source data.
 */

/* eslint-disable @kbn/eslint/scout_require_api_client_in_api_test */

import { setTimeout as wait } from 'timers/promises';
import { keyBy } from 'lodash';
import { expect } from '@kbn/scout/api';
import { tags } from '@kbn/scout';
import type { AlertEvent } from '../../../../server/resources/datastreams/alert_events';
import { apiTest, buildCreateRuleData, testData } from '../fixtures';

const { SCHEDULE_INTERVAL } = testData;

/**
 * Index a list of alert events by their `data['host.name']` value.
 *
 * Several tests breach multiple groups in a single executor batch and need to
 * assert per-group output. Because the events share a `@timestamp`, their
 * order in `.rule-events` is not deterministic, so we look them up by host
 * name instead of asserting positional array order.
 */
const groupEventsByHost = (events: AlertEvent[]): Record<string, AlertEvent> =>
  keyBy(events, (event) => event.data['host.name'] as string);

/**
 * Isolated cases for the alerting_v2 rule executor's persisted output.
 *
 */
apiTest.describe('Rule executor', { tag: tags.stateful.classic }, () => {
  const SOURCE_INDEX = 'test-alerting-v2-rule-executor-source';
  /**
   * Time-based wait used only by tests that assert the *absence* of events from
   * a disabled or deleted rule, where there is no positive condition to poll
   * for (the executor is no longer scheduled, so no `task-run` events will
   * appear). All other negative assertions wait for executor ticks via
   * `ruleExecutions.waitForRuns`. This buffer covers ~2 task manager
   * ticks (SCHEDULE_INTERVAL is 5s) so a regression that incorrectly executed
   * disabled rules would have time to manifest.
   */
  const WAIT_TIME_MS = 12_000;

  apiTest.beforeAll(async ({ apiServices }) => {
    await apiServices.alertingV2.sourceIndex.create({
      index: SOURCE_INDEX,
      mappings: {
        'host.name': { type: 'keyword' },
        severity: { type: 'keyword' },
        value: { type: 'long' },
        'event.created': { type: 'date' },
      },
    });
  });

  apiTest.afterAll(async ({ apiServices }) => {
    await apiServices.alertingV2.rules.cleanUp();
    await apiServices.alertingV2.ruleEvents.cleanUp();
    await apiServices.alertingV2.sourceIndex.delete({ index: SOURCE_INDEX });
  });

  apiTest('writes one breach event per matching ES|QL row', async ({ apiServices }) => {
    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-breach-1',
          severity: 'high',
          value: 1,
        },
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-breach-2',
          severity: 'low',
          value: 2,
        },
      ],
    });

    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'executor-shape-one-event-per-row' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-breach-1", "host-breach-2") | STATS count = COUNT(*) BY host.name`,
          },
        },
      })
    );

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 2, { status: 'breached' });

    const breachEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      status: 'breached',
    });

    expect(breachEvents).toHaveLength(2);
  });

  apiTest(
    'writes the columns returned by the query to the data field correctly',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-data-1',
            severity: 'high',
            value: 1,
          },
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-data-2',
            severity: 'low',
            value: 2,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-shape-data-field' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-data-1", "host-data-2") | STATS count = COUNT(*) BY host.name`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 2, { status: 'breached' });

      const breachEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });

      expect(breachEvents).toHaveLength(2);

      const eventsByHost = groupEventsByHost(breachEvents);
      expect(eventsByHost['host-data-1'].data).toMatchObject({
        'host.name': 'host-data-1',
        count: 1,
      });
      expect(eventsByHost['host-data-2'].data).toMatchObject({
        'host.name': 'host-data-2',
        count: 1,
      });
    }
  );

  apiTest(
    'populates rule, source, and scheduling fields on every breach event',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-shape-fields',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-shape-rule-fields' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-shape-fields" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      const [event] = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });

      expect(Date.parse(event['@timestamp'])).toBeGreaterThan(0);
      expect(Date.parse(event.scheduled_timestamp!)).toBeGreaterThan(0);
      expect(Date.parse(event.scheduled_timestamp!)).toBeLessThanOrEqual(
        Date.parse(event['@timestamp'])
      );

      // Rule fields
      expect(event.rule.id).toBe(rule.id);
      expect(Number.isInteger(event.rule.version)).toBe(true);
      expect(event.rule.version).toBeGreaterThan(0);

      // Event fields
      expect(typeof event.group_hash).toBe('string');
      expect(event.group_hash.length).toBeGreaterThan(0);
      expect(event.source).toBe('internal');
      expect(event.type).toBe('alert');
      expect(event.status).toBe('breached');
      expect(event.space_id).toBe('default');
    }
  );

  apiTest('writes one event per group when grouping.fields is set', async ({ apiServices }) => {
    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-grouping-a',
          severity: 'high',
          value: 1,
        },
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-grouping-b',
          severity: 'high',
          value: 1,
        },
      ],
    });

    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'executor-grouping-one-per-group' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-grouping-a", "host-grouping-b") | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
        },
      })
    );

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 2, { status: 'breached' });

    const breachEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      status: 'breached',
    });

    expect(breachEvents).toHaveLength(2);

    const groupHashes = new Set(breachEvents.map((e) => e.group_hash));
    expect(groupHashes.size).toBe(2);

    const hosts = breachEvents.map((e) => e.data['host.name']).sort();
    expect(hosts).toStrictEqual(['host-grouping-a', 'host-grouping-b']);
  });

  apiTest('groups multiple documents into the same group correctly', async ({ apiServices }) => {
    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-multi-1',
          severity: 'high',
          value: 1,
        },
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-multi-1',
          severity: 'low',
          value: 2,
        },
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-multi-2',
          severity: 'medium',
          value: 3,
        },
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-multi-2',
          severity: 'low',
          value: 4,
        },
      ],
    });

    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'executor-grouping-multiple-docs-per-group' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-multi-1", "host-multi-2") | STATS count = COUNT(*) BY host.name`,
          },
        },
      })
    );

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 2, { status: 'breached' });

    const breachEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      status: 'breached',
    });

    expect(breachEvents).toHaveLength(2);

    expect(breachEvents[0].group_hash).not.toBe(breachEvents[1].group_hash);

    const eventsByHost = groupEventsByHost(breachEvents);
    expect(eventsByHost['host-multi-1'].data).toMatchObject({
      'host.name': 'host-multi-1',
      count: 2,
    });
    expect(eventsByHost['host-multi-2'].data).toMatchObject({
      'host.name': 'host-multi-2',
      count: 2,
    });
  });

  apiTest(
    'produces stable group_hash for the same group across executions',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-grouping-stable',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-grouping-stable-hash' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-grouping-stable" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      const firstHash = (await apiServices.alertingV2.ruleEvents.find(rule.id))[0].group_hash;

      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-grouping-stable',
            severity: 'high',
            value: 2,
          },
        ],
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 2, { status: 'breached' });

      const breachEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });

      expect(breachEvents).toHaveLength(2);
      expect(breachEvents[0].group_hash).toBe(firstHash);
      expect(breachEvents[1].group_hash).toBe(firstHash);
    }
  );

  apiTest(
    'produces the correct breach events for match based queries without grouping',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-grouping-fallback-a',
            severity: 'high',
            value: 1,
          },
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-grouping-fallback-b',
            severity: 'high',
            value: 2,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-grouping-fallback' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-grouping-fallback-a", "host-grouping-fallback-b") | KEEP host.name, severity, value`,
            },
          },
          grouping: undefined,
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 2, { status: 'breached' });

      const breachEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });

      expect(breachEvents).toHaveLength(2);
      expect(breachEvents[0].group_hash).not.toBe(breachEvents[1].group_hash);

      const eventsByHost = groupEventsByHost(breachEvents);
      expect(eventsByHost['host-grouping-fallback-a'].data).toMatchObject({
        'host.name': 'host-grouping-fallback-a',
        severity: 'high',
        value: 1,
      });
      expect(eventsByHost['host-grouping-fallback-b'].data).toMatchObject({
        'host.name': 'host-grouping-fallback-b',
        severity: 'high',
        value: 2,
      });
    }
  );

  apiTest(
    'extracts severity from the ES|QL row onto breached events as a top-level field',
    async ({ apiServices }) => {
      /**
       * Three breached groups exercise the three branches of the
       * `severity` extraction:
       *
       * - `host-severity-supported` — the ES|QL value is one of the
       *   supported severities (`critical`) and is copied onto the
       *   event as a top-level field.
       * - `host-severity-uppercase` — the ES|QL value is `HIGH`. The
       *   executor lowercases the value before matching, so the
       *   top-level field is `high` while the original casing is
       *   preserved in `data.severity`.
       * - `host-severity-unknown` — the ES|QL value (`SEV1`) is not
       *   in the supported set, so no top-level severity is written.
       *   The original value still shows up in `data.severity` because
       *   the executor never mutates the row payload.
       */
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-severity-supported',
            severity: 'critical',
            value: 1,
          },
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-severity-uppercase',
            severity: 'HIGH',
            value: 1,
          },
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-severity-unknown',
            severity: 'SEV1',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-severity-extraction' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-severity-supported", "host-severity-uppercase", "host-severity-unknown") | KEEP host.name, severity, value`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 3, { status: 'breached' });

      const breachEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });

      expect(breachEvents).toHaveLength(3);

      const eventsByHost = groupEventsByHost(breachEvents);

      expect(eventsByHost['host-severity-supported'].severity).toBe('critical');
      expect(eventsByHost['host-severity-supported'].data).toMatchObject({
        'host.name': 'host-severity-supported',
        severity: 'critical',
      });

      expect(eventsByHost['host-severity-uppercase'].severity).toBe('high');
      expect(eventsByHost['host-severity-uppercase'].data).toMatchObject({
        'host.name': 'host-severity-uppercase',
        severity: 'HIGH',
      });

      expect(eventsByHost['host-severity-unknown'].severity).toBeUndefined();
      expect(eventsByHost['host-severity-unknown'].data).toMatchObject({
        'host.name': 'host-severity-unknown',
        severity: 'SEV1',
      });
    }
  );

  apiTest(
    'includes data within the lookback window even when older than schedule.every',
    async ({ apiServices }) => {
      // 30s in the past — within the 1m lookback but well outside the 5s schedule
      // interval, so it can only be picked up by the lookback range.
      const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();

      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': thirtySecondsAgo,
            'host.name': 'host-lookback-included',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-lookback-included' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-lookback-included" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      const breachEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });

      expect(breachEvents.length).toBeGreaterThanOrEqual(1);
      expect(breachEvents[0].data).toMatchObject({ 'host.name': 'host-lookback-included' });
    }
  );

  apiTest('excludes data outside the lookback window', async ({ apiServices }) => {
    // 5 minutes in the past — well outside the 1m lookback.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();

    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': fiveMinutesAgo,
          'host.name': 'host-lookback-excluded',
          severity: 'high',
          value: 1,
        },
      ],
    });

    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'executor-lookback-excluded' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-lookback-excluded" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
        },
      })
    );

    await apiServices.alertingV2.ruleExecutions.waitForRuns({
      ruleId: rule.id,
      runs: 2,
    });

    const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
    expect(events).toHaveLength(0);
  });

  apiTest(
    'defaults the lookback window to schedule.every when no lookback is set',
    async ({ apiServices }) => {
      // 30s in the past — outside the 5s default (= schedule.every) lookback,
      // but inside the 1m lookback used by the rest of the suite. If the
      // executor mistakenly fell back to a longer default, this doc would match.
      const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();

      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': thirtySecondsAgo,
            'host.name': 'host-lookback-default',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-lookback-default' },
          schedule: { every: SCHEDULE_INTERVAL },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-lookback-default" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleExecutions.waitForRuns({
        ruleId: rule.id,
        runs: 2,
      });

      const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
      expect(events).toHaveLength(0);
    }
  );

  apiTest(
    'uses the configured time_field for the lookback range filter',
    async ({ apiServices }) => {
      // Two docs whose `@timestamp` is fresh but whose `event.created` differs:
      //   - host-time-field-in:  event.created within the 1m lookback
      //   - host-time-field-out: event.created 5m ago, outside the lookback
      // Only the first should match if the executor honors `time_field`.
      const now = new Date().toISOString();
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();

      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': now,
            'event.created': now,
            'host.name': 'host-time-field-in',
            severity: 'high',
            value: 1,
          },
          {
            '@timestamp': now,
            'event.created': fiveMinutesAgo,
            'host.name': 'host-time-field-out',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-time-field-custom' },
          time_field: 'event.created',
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-time-field-in", "host-time-field-out") | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      await apiServices.alertingV2.ruleExecutions.waitForRuns({
        ruleId: rule.id,
        runs: 2,
      });

      const breachEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });

      const matchedHosts = new Set(breachEvents.map((event) => event.data['host.name']));
      expect(matchedHosts.has('host-time-field-in')).toBe(true);
      expect(matchedHosts.has('host-time-field-out')).toBe(false);
    }
  );

  apiTest(
    'binds the ?_tstart and ?_tend reserved ES|QL params to the lookback window',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-esql-reserved-params',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // The ES|QL request fails outright if the query references
      // unbound params, so seeing a breach event proves the executor
      // wired both `?_tstart` and `?_tend` from the lookback window.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-esql-reserved-params' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-esql-reserved-params" AND @timestamp >= ?_tstart AND @timestamp <= ?_tend | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      const breachEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });

      expect(breachEvents.length).toBeGreaterThanOrEqual(1);
      expect(breachEvents[0].data).toMatchObject({
        'host.name': 'host-esql-reserved-params',
        count: 1,
      });
    }
  );

  apiTest(
    'emits a recovered event under no_breach policy when a previously breaching group stops breaching',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-recovery-no-breach',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-recovery-no-breach' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-recovery-no-breach" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      const breachedEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });

      const breachedHash = breachedEvents[0].group_hash;

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-recovery-no-breach' } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'recovered' });

      const recoveredEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'recovered',
      });

      expect(recoveredEvents.length).toBeGreaterThanOrEqual(1);
      expect(recoveredEvents[0].group_hash).toBe(breachedHash);
    }
  );

  apiTest(
    'does not emit recovery events for kind: "signal" rules when previously matching groups stop matching',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-signal-no-recovery',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          kind: 'signal',
          metadata: { name: 'executor-signal-no-recovery' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-signal-no-recovery" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          // Signal rules cannot configure recovery, so omit it. They must
          // also opt out of state_transition (schema forbids it for "signal").
          state_transition: undefined,
          recovery_strategy: undefined,
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-signal-no-recovery' } },
      });

      await apiServices.alertingV2.ruleExecutions.waitForRuns({
        ruleId: rule.id,
        runs: 2,
      });

      const recoveredEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'recovered',
      });

      expect(recoveredEvents).toHaveLength(0);
    }
  );

  apiTest(
    'does not emit recovery events for alert rules created without query.recovery',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-alert-no-recovery-query',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          kind: 'alert',
          metadata: { name: 'executor-alert-no-recovery-query' },
          recovery_strategy: 'none',
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-alert-no-recovery-query" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-alert-no-recovery-query' } },
      });

      await apiServices.alertingV2.ruleExecutions.waitForRuns({
        ruleId: rule.id,
        runs: 2,
      });

      const recoveredEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'recovered',
      });

      expect(recoveredEvents).toHaveLength(0);
    }
  );

  apiTest('uses the configured recover query', async ({ apiServices }) => {
    /**
     * severity=high docs drive the main breach query
     * severity=recovered docs drive the recovery query for the SAME group (host.name).
     */
    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-recovery-query',
          severity: 'high',
          value: 1,
        },
      ],
    });

    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'executor-recovery-query' },
        recovery_strategy: 'query',
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-recovery-query" AND severity == "high" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
          recovery: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-recovery-query" AND severity == "recovered" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
        },
      })
    );

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

    const breachedEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      status: 'breached',
    });

    const breachedHash = breachedEvents[0].group_hash;

    // Drop the breaching doc so the main query no longer matches, then
    // index a doc that matches the recovery query for the same host.
    await apiServices.alertingV2.sourceIndex.deleteDocs({
      index: SOURCE_INDEX,
      query: {
        bool: {
          filter: [
            { term: { 'host.name': 'host-recovery-query' } },
            { term: { severity: 'high' } },
          ],
        },
      },
    });

    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-recovery-query',
          severity: 'recovered',
          value: 0,
        },
      ],
    });

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'recovered' });

    const recoveredEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      status: 'recovered',
    });

    expect(recoveredEvents.length).toBeGreaterThanOrEqual(1);
    expect(recoveredEvents[0].group_hash).toBe(breachedHash);
  });

  apiTest(
    'emits one recovery event per active group when recover query matches multiple',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-recovery-query-multi-a',
            severity: 'high',
            value: 1,
          },
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-recovery-query-multi-b',
            severity: 'high',
            value: 2,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-recovery-query-multi' },
          recovery_strategy: 'query',
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-recovery-query-multi-a", "host-recovery-query-multi-b") AND severity == "high" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
            recovery: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-recovery-query-multi-a", "host-recovery-query-multi-b") AND severity == "recovered" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 2, { status: 'breached' });

      const breachedEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });

      const breachedHashes = new Set(breachedEvents.map((event) => event.group_hash));
      expect(breachedHashes.size).toBe(2);

      // Stop both groups from breaching and emit recovery rows for both.
      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: {
          bool: {
            filter: [
              {
                terms: {
                  'host.name': ['host-recovery-query-multi-a', 'host-recovery-query-multi-b'],
                },
              },
              { term: { severity: 'high' } },
            ],
          },
        },
      });

      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-recovery-query-multi-a',
            severity: 'recovered',
            value: 0,
          },
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-recovery-query-multi-b',
            severity: 'recovered',
            value: 0,
          },
        ],
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 2, { status: 'recovered' });

      const recoveredEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'recovered',
      });

      const recoveredHashes = new Set(recoveredEvents.map((event) => event.group_hash));
      expect(recoveredHashes.size).toBe(2);
      // Every recovered hash must correspond to a previously breached group.
      for (const hash of recoveredHashes) {
        expect(breachedHashes.has(hash)).toBe(true);
      }
    }
  );

  apiTest(
    'does not recover a group when recover query returns no matching active group',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-recovery-query-no-match',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-recovery-query-no-match' },
          recovery_strategy: 'query',
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-recovery-query-no-match" AND severity == "high" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
            recovery: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-recovery-query-other-host" AND severity == "recovered" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: {
          bool: {
            filter: [
              { term: { 'host.name': 'host-recovery-query-no-match' } },
              { term: { severity: 'high' } },
            ],
          },
        },
      });

      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-recovery-query-other-host',
            severity: 'recovered',
            value: 0,
          },
        ],
      });

      await apiServices.alertingV2.ruleExecutions.waitForRuns({
        ruleId: rule.id,
        runs: 2,
      });

      const recoveredEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'recovered',
      });

      expect(recoveredEvents).toHaveLength(0);
    }
  );

  apiTest(
    'does not recover a group when recover query returns zero rows',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-recovery-query-empty',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // The recovery query targets `severity == "recovered"`, but no doc with
      // that severity is ever indexed, so the query will always return zero
      // rows. The active group must remain non-recovered.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-recovery-query-empty' },
          recovery_strategy: 'query',
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-recovery-query-empty" AND severity == "high" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
            recovery: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-recovery-query-empty" AND severity == "recovered" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      // Drop the breaching doc so the main query no longer matches. The
      // recovery query still returns zero rows, exercising the "empty
      // ES|QL response" branch in `buildQueryRecoveryAlertEvents`.
      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: {
          bool: {
            filter: [
              { term: { 'host.name': 'host-recovery-query-empty' } },
              { term: { severity: 'high' } },
            ],
          },
        },
      });

      await apiServices.alertingV2.ruleExecutions.waitForRuns({
        ruleId: rule.id,
        runs: 2,
      });

      const recoveredEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'recovered',
      });

      expect(recoveredEvents).toHaveLength(0);
    }
  );

  apiTest(
    'emits recovery events only for groups that stop breaching when others keep breaching',
    async ({ apiServices }) => {
      // Both groups breach first.
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-partial-recovery-a',
            severity: 'high',
            value: 1,
          },
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-partial-recovery-b',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-partial-recovery' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-partial-recovery-a", "host-partial-recovery-b") | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      // Wait until both groups have breached so both are tracked as active.
      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 2, { status: 'breached' });

      const breachedEventsBefore = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });
      const hashesByHost = new Map<string, string>(
        breachedEventsBefore.map((event) => [event.data['host.name'] as string, event.group_hash])
      );
      const hashA = hashesByHost.get('host-partial-recovery-a');
      const hashB = hashesByHost.get('host-partial-recovery-b');
      expect(hashA).toBeDefined();
      expect(hashB).toBeDefined();

      const initialBreachCountB = breachedEventsBefore.filter(
        (event) => event.data['host.name'] === 'host-partial-recovery-b'
      ).length;

      // Drop only host-a's data — host-b keeps breaching. Re-index host-b
      // so it stays inside the lookback window throughout the rest of the
      // test, even on slower runs.
      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-partial-recovery-a' } },
      });

      const reIndexHostB = async () => {
        await apiServices.alertingV2.sourceIndex.indexDocs({
          index: SOURCE_INDEX,
          docs: [
            {
              '@timestamp': new Date().toISOString(),
              'host.name': 'host-partial-recovery-b',
              severity: 'high',
              value: 1,
            },
          ],
        });
      };
      await reIndexHostB();

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'recovered' });

      const recoveredEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'recovered',
      });

      // Only host-a should be in the recovered set.
      const recoveredHashes = new Set(recoveredEvents.map((event) => event.group_hash));
      expect(recoveredHashes.has(hashA!)).toBe(true);
      expect(recoveredHashes.has(hashB!)).toBe(false);

      // Strong check: host-b should keep producing *new* breach events
      // alongside host-a's recoveries — a regression that recovers all
      // active groups when any group stops breaching would not increase
      // host-b's breach count.
      await reIndexHostB();
      await expect
        .poll(
          async () => {
            const events = await apiServices.alertingV2.ruleEvents.find(rule.id, {
              status: 'breached',
            });
            return events.filter((event) => event.data['host.name'] === 'host-partial-recovery-b')
              .length;
          },
          { timeout: testData.POLL_TIMEOUT_MS, intervals: [testData.POLL_INTERVAL_MS] }
        )
        .toBeGreaterThan(initialBreachCountB);
    }
  );

  apiTest(
    'emits both breach and recovery events in the same execution when one group recovers and another keeps breaching',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-mixed-execution-a',
            severity: 'high',
            value: 1,
          },
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-mixed-execution-b',
            severity: 'high',
            value: 2,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-mixed-execution' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-mixed-execution-a", "host-mixed-execution-b") | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      // Both groups must be active before we drop one of them; otherwise the
      // "recovery on first execution" race could mask either branch.
      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 2, { status: 'breached' });

      const breachedBefore = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });
      const initialBreachCountB = breachedBefore.filter(
        (event) => event.data['host.name'] === 'host-mixed-execution-b'
      ).length;

      // Drop host-a only and keep refreshing host-b inside the lookback so
      // the same execution sees host-b as breaching while host-a recovers.
      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-mixed-execution-a' } },
      });

      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-mixed-execution-b',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // Wait until host-a is in the recovered set AND host-b has produced
      // a NEW breach event after the recovery threshold. Strong assertion:
      // both branches of `CreateRecoveryEventsStep` (append recovery events
      // to the existing breach batch) ran in the same pipeline tick.
      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'recovered' });
      await expect
        .poll(
          async () => {
            const events = await apiServices.alertingV2.ruleEvents.find(rule.id, {
              status: 'breached',
            });
            return events.filter((event) => event.data['host.name'] === 'host-mixed-execution-b')
              .length;
          },
          { timeout: testData.POLL_TIMEOUT_MS, intervals: [testData.POLL_INTERVAL_MS] }
        )
        .toBeGreaterThan(initialBreachCountB);

      const recoveredEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'recovered',
      });
      expect(recoveredEvents.length).toBeGreaterThan(0);
    }
  );

  apiTest(
    'executes the concatenated base+breach block query for composed format rules',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-composed-breach-only',
            severity: 'high',
            value: 10,
          },
          {
            '@timestamp': new Date().toISOString(),
            // This host has a low value and must NOT produce a breach event,
            // proving the breach block (not just the base) drives the filter.
            'host.name': 'host-composed-no-breach',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-composed-breach' },
          query: {
            format: 'composed',
            base: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-composed-breach-only", "host-composed-no-breach") | STATS max_val = MAX(value) BY host.name`,
            breach: { segment: `WHERE max_val >= 10` },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      await apiServices.alertingV2.ruleExecutions.waitForRuns({
        ruleId: rule.id,
        runs: 2,
      });

      const breachEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });

      const breachedHosts = breachEvents.map((e) => e.data['host.name']);
      expect(breachedHosts).toContain('host-composed-breach-only');
      expect(breachedHosts).not.toContain('host-composed-no-breach');
    }
  );

  apiTest(
    'emits a recovered event using the composed recovery segment',
    async ({ apiServices }) => {
      // Index a high-value doc so the breach block (max_val >= 10) fires.
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-composed-recover',
            value: 10,
          },
        ],
      });

      // base query returns max value per host; the breach and recover blocks each
      // append a WHERE clause — the composed format shares the FROM/STATS between them.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-composed-recover' },
          recovery_strategy: 'query',
          query: {
            format: 'composed',
            base: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-composed-recover" | STATS max_val = MAX(value) BY host.name`,
            breach: { segment: `WHERE max_val >= 10` },
            recovery: { segment: `WHERE max_val < 5` },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      const breachedEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });
      const breachedHash = breachedEvents[0].group_hash;

      // Replace the high-value doc with a low-value one so the recover block matches.
      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-composed-recover' } },
      });

      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-composed-recover',
            value: 1,
          },
        ],
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'recovered' });

      const recoveredEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'recovered',
      });

      expect(recoveredEvents.length).toBeGreaterThanOrEqual(1);
      expect(recoveredEvents[0].group_hash).toBe(breachedHash);
    }
  );

  apiTest(
    'emits recovery via strategy: "no_breach" when an active group stops matching the breach query',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-no-breach-strategy',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-no-breach-strategy' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-no-breach-strategy" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-no-breach-strategy' } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'recovered' });

      const recoveredEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'recovered',
      });
      expect(recoveredEvents.length).toBeGreaterThanOrEqual(1);
    }
  );

  apiTest('writes zero events when the ES|QL query returns no rows', async ({ apiServices }) => {
    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'executor-no-breach-empty-query' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-no-breach-never-indexed" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
        },
      })
    );

    await apiServices.alertingV2.ruleExecutions.waitForRuns({
      ruleId: rule.id,
      runs: 2,
    });

    const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
    expect(events).toHaveLength(0);
  });

  apiTest('a disabled rule writes no new events', async ({ apiServices }) => {
    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-halt-disabled',
          severity: 'high',
          value: 1,
        },
      ],
    });

    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'executor-halt-disabled' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-halt-disabled" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
        },
      })
    );

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

    await apiServices.alertingV2.rules.bulkDisable({ ids: [rule.id] });

    await apiServices.alertingV2.rules.waitForEnabledState({ id: rule.id, enabled: false });
    await apiServices.alertingV2.ruleExecutions.waitForTaskDrained({ ruleId: rule.id });

    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-halt-disabled',
          severity: 'high',
          value: 1,
        },
      ],
    });

    const baseline = (await apiServices.alertingV2.ruleEvents.find(rule.id)).length;
    /**
     * Time-based wait is intentional here: the assertion is that a *disabled*
     * rule writes no new events, which is the absence of a condition. There is
     * no positive event to poll for. The wait covers ~2 task manager ticks so
     * a regression that incorrectly executed disabled rules would have time
     * to manifest.
     */
    await wait(WAIT_TIME_MS);
    const after = (await apiServices.alertingV2.ruleEvents.find(rule.id)).length;

    expect(after).toBe(baseline);
  });

  apiTest(
    'resumes producing events after a disabled rule is re-enabled',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-reenabled',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-resume-reenabled' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-reenabled" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      await apiServices.alertingV2.rules.bulkDisable({ ids: [rule.id] });

      /**
       * Wait for the disable to fully settle before issuing the re-enable.
       *
       * `bulkDisable` is a best-effort operation: it writes the rule SO and
       * then asynchronously asks task manager to disable the executor task.
       * Issuing `bulkEnable` immediately after creates two near-simultaneous
       * writes to the same rule SO and to the task manager task document,
       * which has surfaced as transient 5xx responses from Kibana under load.
       *
       * We wait on two independent signals:
       *   1. `waitForEnabledState({ enabled: false })` — the rule SO has the
       *      disabled state visible to the API layer.
       *   2. `waitForTaskDrained` — no executor run is in flight, so
       *      the baseline event snapshot below is stable.
       */
      await apiServices.alertingV2.rules.waitForEnabledState({ id: rule.id, enabled: false });
      await apiServices.alertingV2.ruleExecutions.waitForTaskDrained({ ruleId: rule.id });
      const baseline = (await apiServices.alertingV2.ruleEvents.find(rule.id)).length;

      await apiServices.alertingV2.rules.bulkEnable({ ids: [rule.id] });
      await apiServices.alertingV2.rules.waitForEnabledState({ id: rule.id, enabled: true });

      // Refresh the breaching doc so it is inside the lookback window when the
      // re-enabled rule next executes — this isolates the re-enable behavior
      // from any flakiness around the first post-enable schedule tick.
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-reenabled',
            severity: 'high',
            value: 1,
          },
        ],
      });

      await expect
        .poll(async () => (await apiServices.alertingV2.ruleEvents.find(rule.id)).length, {
          timeout: testData.POLL_TIMEOUT_MS,
          intervals: [testData.POLL_INTERVAL_MS],
        })
        .toBeGreaterThan(baseline);
    }
  );

  apiTest("no_data_strategy 'emit' writes a no_data rule event", async ({ apiServices }) => {
    const HOST = 'host-no-data-emit';

    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': HOST,
          severity: 'high',
          value: 1,
        },
      ],
    });

    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'executor-no-data-emit' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "${HOST}" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
          no_data: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "${HOST}" | STATS count = COUNT(*) BY host.name`,
          },
        },
        // Use recovery_strategy 'none' so the recovery step never fires.
        recovery_strategy: 'none',
        no_data_strategy: 'emit',
      })
    );

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

    const breachedEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      status: 'breached',
    });
    const breachedHash = breachedEvents[0].group_hash;

    await apiServices.alertingV2.sourceIndex.deleteDocs({
      index: SOURCE_INDEX,
      query: { term: { 'host.name': HOST } },
    });

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'no_data' });

    const noDataEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      status: 'no_data',
    });

    expect(noDataEvents.length).toBeGreaterThanOrEqual(1);
    expect(noDataEvents[0].group_hash).toBe(breachedHash);
  });

  apiTest(
    "no_data_strategy 'last_known_status' emits the same no_data rule event as 'emit'",
    async ({ apiServices }) => {
      const HOST = 'host-no-data-last-known';

      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': HOST,
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'executor-no-data-last-known' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "${HOST}" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
            no_data: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "${HOST}" | STATS count = COUNT(*) BY host.name`,
            },
          },
          // Use recovery_strategy 'none' so the recovery step never fires.
          recovery_strategy: 'none',
          no_data_strategy: 'last_known_status',
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

      const breachedEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'breached',
      });
      const breachedHash = breachedEvents[0].group_hash;

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': HOST } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'no_data' });

      const noDataEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'no_data',
      });

      expect(noDataEvents.length).toBeGreaterThanOrEqual(1);
      expect(noDataEvents[0].group_hash).toBe(breachedHash);
    }
  );

  apiTest("no_data_strategy 'recover' writes a no_data rule event", async ({ apiServices }) => {
    const HOST = 'host-no-data-recover';

    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': HOST,
          severity: 'high',
          value: 1,
        },
      ],
    });

    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'executor-no-data-recover' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "${HOST}" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
          no_data: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "${HOST}" | STATS count = COUNT(*) BY host.name`,
          },
        },
        // Pair 'recover' no-data strategy with recovery_strategy 'none' so
        // the recovery step does not emit a recovered event for the group —
        // confirming the no_data event comes from the no-data step and the
        // director drives the episode toward recovery.
        recovery_strategy: 'none',
        no_data_strategy: 'recover',
      })
    );

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

    const breachedEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      status: 'breached',
    });
    const breachedHash = breachedEvents[0].group_hash;

    await apiServices.alertingV2.sourceIndex.deleteDocs({
      index: SOURCE_INDEX,
      query: { term: { 'host.name': HOST } },
    });

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'no_data' });

    const noDataEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      status: 'no_data',
    });

    expect(noDataEvents.length).toBeGreaterThanOrEqual(1);
    expect(noDataEvents[0].group_hash).toBe(breachedHash);

    // The no-data step writes a no_data event; the recovery step is
    // disabled so no recovered rule event should exist.
    const recoveredEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      status: 'recovered',
    });
    expect(recoveredEvents).toHaveLength(0);
  });

  apiTest("no_data_strategy 'none' does not write no_data events", async ({ apiServices }) => {
    const HOST = 'host-no-data-none';

    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': HOST,
          severity: 'high',
          value: 1,
        },
      ],
    });

    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'executor-no-data-none' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "${HOST}" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
        },
        // Default no_data_strategy is 'none'; spell it out so the test
        // intent is unambiguous.
        no_data_strategy: 'none',
      })
    );

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

    await apiServices.alertingV2.sourceIndex.deleteDocs({
      index: SOURCE_INDEX,
      query: { term: { 'host.name': HOST } },
    });

    // Recovery is still on by default ('no_breach'), so we wait for the
    // recovery side of the lifecycle as the positive signal that the
    // executor processed the absence — then assert no no_data events.
    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'recovered' });

    const noDataEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      status: 'no_data',
    });
    expect(noDataEvents).toHaveLength(0);
  });

  apiTest('a deleted rule writes no new events', async ({ apiServices }) => {
    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-halt-deleted',
          severity: 'high',
          value: 1,
        },
      ],
    });

    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'executor-halt-deleted' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-halt-deleted" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
        },
      })
    );

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, { status: 'breached' });

    await apiServices.alertingV2.rules.delete(rule.id);

    await apiServices.alertingV2.ruleExecutions.waitForTaskDrained({ ruleId: rule.id });

    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-halt-deleted',
          severity: 'high',
          value: 1,
        },
      ],
    });

    const baseline = (await apiServices.alertingV2.ruleEvents.find(rule.id)).length;
    /**
     * Time-based wait is intentional here: the assertion is that a *deleted*
     * rule writes no new events, which is the absence of a condition. There is
     * no positive event to poll for. The wait covers ~2 task manager ticks so
     * a regression that kept executing deleted rules would have time to
     * manifest.
     */
    await wait(WAIT_TIME_MS);
    const after = (await apiServices.alertingV2.ruleEvents.find(rule.id)).length;

    expect(after).toBe(baseline);
  });

  apiTest('an invalid ES|QL query writes no events', async ({ apiServices }) => {
    // Targets an index that does not exist. The ES|QL parser accepts the query
    // (so rule creation succeeds) but execution fails at runtime. The executor
    // surfaces the failure through error middleware and writes nothing.
    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'executor-invalid-query' },
        query: {
          format: 'standalone',
          breach: {
            query:
              'FROM nonexistent-index-rule-executor-spec-zzz | STATS count = COUNT(*) | WHERE count >= 1',
          },
        },
      })
    );

    await apiServices.alertingV2.ruleExecutions.waitForRuns({
      ruleId: rule.id,
      runs: 2,
    });

    const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
    expect(events).toHaveLength(0);
  });
});
