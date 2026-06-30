/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * We are excluding the  @kbn/eslint/scout_require_api_client_in_api_test
 * eslint rule for this file because we do not test APIs but the director
 * component itself. The correctness of the director relies on how it
 * processes alert events and not on the APIs that are used to create the
 * rule and source data.
 */

/* eslint-disable @kbn/eslint/scout_require_api_client_in_api_test */

import { expect } from '@kbn/scout/api';
import { tags } from '@kbn/scout';
import { apiTest, buildCreateRuleData, testData } from '../fixtures';

const { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } = testData;

/**
 * Integration tests for the alerting_v2 director component.
 *
 * The director runs after the executor has produced a batch of breach/recovery
 * alert events.
 */
apiTest.describe('Director', { tag: tags.stateful.classic }, () => {
  const SOURCE_INDEX = 'test-alerting-v2-director-source';

  apiTest.beforeAll(async ({ apiServices }) => {
    await apiServices.alertingV2.sourceIndex.create({
      index: SOURCE_INDEX,
      mappings: {
        'host.name': { type: 'keyword' },
        severity: { type: 'keyword' },
        value: { type: 'long' },
      },
    });
  });

  apiTest.afterAll(async ({ apiServices }) => {
    await apiServices.alertingV2.rules.cleanUp();
    await apiServices.alertingV2.ruleEvents.cleanUp();
    await apiServices.alertingV2.sourceIndex.delete({ index: SOURCE_INDEX });
  });

  apiTest('skips director processing for signal rules', async ({ apiServices }) => {
    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-director-skip-signal',
          severity: 'high',
          value: 1,
        },
      ],
    });

    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        kind: 'signal',
        metadata: { name: 'director-skip-signal' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-director-skip-signal" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
        },
        // state_transition is forbidden by the schema when kind is "signal".
        state_transition: undefined,
        recovery_strategy: undefined,
      })
    );

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
      status: 'breached',
    });

    const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
    expect(events.length).toBeGreaterThanOrEqual(1);

    for (const event of events) {
      expect(event.type).toBe('signal');
      expect(event.episode).toBeUndefined();
    }
  });

  apiTest(
    'rewrites event type to "alert" and populates episode id/status on every processed event',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-director-shape',
            severity: 'high',
            value: 1,
          },
        ],
      });

      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-shape' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-director-shape" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
      expect(events.length).toBeGreaterThanOrEqual(1);

      for (const event of events) {
        expect(event.type).toBe('alert');
        expect(event.episode).toBeDefined();
        expect(event.episode?.id).toBeDefined();
        expect(['inactive', 'pending', 'active', 'recovering']).toContain(event.episode!.status);
      }
    }
  );

  apiTest(
    'preserves the same episode id across pending -> active -> recovering -> inactive',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-episode-id-stable',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // pending_count=1 and recovering_count=1 force the rule through every
      // status of the lifecycle (skip thresholds disabled). We assert the
      // episode id stays the same across pending → active → recovering →
      // inactive.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-episode-id-stable' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-episode-id-stable" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: { pending_count: 1, recovering_count: 1 },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'pending',
      });
      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      // Stop breaching so the recovery side of the lifecycle is exercised.
      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-episode-id-stable' } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'recovering',
      });
      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'inactive',
      });

      const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
      const episodeIds = new Set(events.map((event) => event.episode?.id));
      const observedStatuses = new Set(events.map((event) => event.episode?.status));

      expect(episodeIds.size).toBe(1);
      expect(observedStatuses).toStrictEqual(
        new Set(['pending', 'active', 'recovering', 'inactive'])
      );
    }
  );

  apiTest(
    'generates a new episode id when a previously inactive group breaches again',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-new-lifecycle',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // Skip pending and recovering so the lifecycle moves quickly.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-new-lifecycle' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-new-lifecycle" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      // 1) First lifecycle: inactive (implicit) -> active.
      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      const firstActiveEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        episodeStatus: 'active',
      });
      const firstEpisodeId = firstActiveEvents[0].episode?.id;

      expect(firstEpisodeId).toBeDefined();

      // 2) Stop breaching and wait for inactive.
      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-new-lifecycle' } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'inactive',
      });

      // 3) Re-introduce the breach. The next active event must use a
      //    DIFFERENT episode id because we're starting a new lifecycle from
      //    inactive.
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-new-lifecycle',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // Wait until the latest episode state for the group is `active` AND
      // its episode id differs from the first lifecycle's id.
      await expect
        .poll(
          async () => {
            const states = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(rule.id);
            return Array.from(states.values()).some(
              (doc) => doc.episode?.status === 'active' && doc.episode.id !== firstEpisodeId
            );
          },
          { timeout: POLL_TIMEOUT_MS, intervals: [POLL_INTERVAL_MS] }
        )
        .toBe(true);
    }
  );

  apiTest(
    'uses the basic strategy when state_transition is omitted (no status_count is ever set)',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-basic-strategy',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // No `state_transition` → basic strategy is selected. The basic strategy
      // never returns a `statusCount` field, so the director must not write
      // `episode.status_count` on any event.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-basic-strategy' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-basic-strategy" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: null,
        })
      );

      // Drive the rule through pending → active → recovering by breaching
      // and then stopping the breach.
      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-basic-strategy' } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'recovering',
      });

      const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
      const observedStatuses = new Set(events.map((event) => event.episode?.status));
      expect(observedStatuses.has('pending')).toBe(true);
      expect(observedStatuses.has('active')).toBe(true);
      expect(observedStatuses.has('recovering')).toBe(true);

      for (const event of events) {
        expect(event.episode?.status_count).toBeUndefined();
      }
    }
  );

  apiTest(
    'increments status_count across consecutive pending executions and resets it on transition to active',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-count-increment',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // pending_count=3 — director needs status_count to climb 1 → 2 → 3 to
      // promote the episode to active. Also lets us assert that active events
      // do not carry status_count.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-count-increment' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-count-increment" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: { pending_count: 3 },
        })
      );

      // Wait for the active transition — by then the executor will have run
      // at least three times for this group, walking status_count 1 → 2.
      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
      const pendingCounts = events
        .filter((event) => event.episode?.status === 'pending')
        .map((event) => event.episode!.status_count)
        .filter((count): count is number => typeof count === 'number');

      expect(pendingCounts).toHaveLength(2);
      expect(Math.min(...pendingCounts)).toBe(1);
      expect(Math.max(...pendingCounts)).toBe(2);

      const activeEvents = events.filter((event) => event.episode?.status === 'active');
      expect(activeEvents.length).toBeGreaterThanOrEqual(1);
      // Active events must not carry status_count.
      for (const event of activeEvents) {
        expect(event.episode?.status_count).toBeUndefined();
      }
    }
  );

  apiTest(
    'starts a new pending lifecycle at status_count 1 after the previous lifecycle reached inactive',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-pending-reset',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // pending_count=10 keeps the rule in pending so we can capture a
      // pending event before recovering it. The first lifecycle goes
      // pending -> inactive directly. Then the second
      // lifecycle must start fresh with status_count=1 and a new
      // episode id.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-pending-reset' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-pending-reset" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: { pending_count: 10 },
        })
      );

      // 1) First lifecycle: capture the initial pending event and its
      //    episode id.
      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'pending',
      });

      const firstPendingEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        episodeStatus: 'pending',
      });

      const firstLifecycleEpisodeId = firstPendingEvents[0].episode?.id;
      expect(firstLifecycleEpisodeId).toBeDefined();

      // 2) Stop breaching while still pending — the episode goes
      //    pending -> inactive directly.
      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-pending-reset' } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'inactive',
      });

      // 3) Re-introduce the breach. The next pending event must use a
      //    DIFFERENT episode id and reset status_count back to 1.
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-pending-reset',
            severity: 'high',
            value: 1,
          },
        ],
      });

      await expect
        .poll(
          async () => {
            const states = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(rule.id);
            return Array.from(states.values()).some(
              (event) =>
                event.episode?.status === 'pending' &&
                event.episode.id !== firstLifecycleEpisodeId &&
                event.episode.status_count === 1
            );
          },
          { timeout: POLL_TIMEOUT_MS, intervals: [POLL_INTERVAL_MS] }
        )
        .toBe(true);
    }
  );

  apiTest('does not write status_count on inactive episode events', async ({ apiServices }) => {
    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-inactive-no-count',
          severity: 'high',
          value: 1,
        },
      ],
    });

    // pending_count=0 + recovering_count=0 sends the episode straight to
    // active and then straight to inactive on recovery, which lets us
    // observe a clean inactive event whose status_count must be unset.
    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'director-inactive-no-count' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-inactive-no-count" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
        },
      })
    );

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
      episodeStatus: 'active',
    });

    await apiServices.alertingV2.sourceIndex.deleteDocs({
      index: SOURCE_INDEX,
      query: { term: { 'host.name': 'host-inactive-no-count' } },
    });

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
      episodeStatus: 'inactive',
    });

    const inactiveEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      episodeStatus: 'inactive',
    });

    expect(inactiveEvents.length).toBeGreaterThanOrEqual(1);
    for (const event of inactiveEvents) {
      expect(event.episode?.status_count).toBeUndefined();
    }
  });

  apiTest(
    'keeps episode in recovering until recovering_count threshold is met',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-recovering-threshold',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // pending_count=0 sends the episode straight to active so we can focus
      // on the recovery side. recovering_count=3 keeps it in recovering for
      // multiple ticks so we can observe an incrementing status_count.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-recovering-threshold' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-recovering-threshold" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: { pending_count: 0, recovering_count: 3 },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-recovering-threshold' } },
      });

      // The episode must reach inactive eventually (after threshold is met).
      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'inactive',
      });

      const events = await apiServices.alertingV2.ruleEvents.find(rule.id);

      const recoveringCounts = events
        .filter((event) => event.episode?.status === 'recovering')
        .map((event) => event.episode!.status_count)
        .filter((count): count is number => typeof count === 'number');

      // Every recovering event must carry a status_count, and we must have
      // observed at least two distinct values (i.e. the count climbed before
      // the threshold was met).
      expect(recoveringCounts).toHaveLength(2);
      expect(Math.min(...recoveringCounts)).toBe(1);
      expect(Math.max(...recoveringCounts)).toBe(2);
    }
  );

  apiTest(
    'recovering_count: 0 skips the recovering status and goes straight to inactive',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-skip-recovering',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // pending_count=0 + recovering_count=0 must skip both the pending and
      // recovering statuses entirely.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-skip-recovering' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-skip-recovering" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-skip-recovering' } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'inactive',
      });

      await apiServices.alertingV2.ruleExecutions.waitForRuns({
        ruleId: rule.id,
        runs: 2,
      });

      const recoveringEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        episodeStatus: 'recovering',
      });

      expect(recoveringEvents).toHaveLength(0);
    }
  );

  apiTest(
    'pending_count: 0 skips the pending status and goes straight to active',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-skip-pending',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // pending_count=0 must skip the pending status entirely so that the
      // episode goes inactive -> active without ever emitting a pending
      // event for the group.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-skip-pending' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-skip-pending" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: { pending_count: 0 },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      await apiServices.alertingV2.ruleExecutions.waitForRuns({
        ruleId: rule.id,
        runs: 2,
      });

      const pendingEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        episodeStatus: 'pending',
      });

      expect(pendingEvents).toHaveLength(0);
    }
  );

  apiTest(
    'transitions recovering -> active when the group breaches again',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-rebreach',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // pending_count=0 sends the rule to active fast. recovering_count=10
      // keeps the episode in recovering long enough that we can re-breach
      // it before it drops to inactive.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-rebreach' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-rebreach" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: { pending_count: 0, recovering_count: 10 },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      const activeEventsBefore = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        episodeStatus: 'active',
      });
      const initialActiveEpisodeId = activeEventsBefore[0].episode?.id;

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-rebreach' } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'recovering',
      });

      // Re-introduce the breach while the group is still recovering.
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-rebreach',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // Wait for an active event whose @timestamp is newer than every
      // event seen so far — i.e. a NEW active event that resulted from the
      // recovering → active transition (not the original active event).
      const recoveringEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        episodeStatus: 'recovering',
      });

      const lastRecoveringTimestamp = recoveringEvents
        .map((event) => Date.parse(event['@timestamp']))
        .sort((a, b) => a - b)
        .pop()!;

      await expect
        .poll(
          async () => {
            const events = await apiServices.alertingV2.ruleEvents.find(rule.id, {
              episodeStatus: 'active',
            });

            return events.some(
              (event) => Date.parse(event['@timestamp']) > lastRecoveringTimestamp
            );
          },
          { timeout: POLL_TIMEOUT_MS, intervals: [POLL_INTERVAL_MS] }
        )
        .toBe(true);

      // The re-active event must keep the same episode id (no new
      // lifecycle is started since we never reached inactive).
      const activeEventsAfter = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        episodeStatus: 'active',
      });

      const reactivatedEvent = activeEventsAfter.find(
        (event) => Date.parse(event['@timestamp']) > lastRecoveringTimestamp
      );

      expect(reactivatedEvent?.episode?.id).toBe(initialActiveEpisodeId);
      // The re-active event is a steady-state status, so the director must
      // not carry over the recovering status_count onto it.
      expect(reactivatedEvent?.episode?.status_count).toBeUndefined();
    }
  );

  apiTest(
    'transitions pending -> inactive when a group recovers before the pending threshold is met',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-pending-to-inactive',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // pending_count=10 effectively keeps the rule in pending so we can
      // recover it before it ever reaches active.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-pending-to-inactive' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-pending-to-inactive" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: { pending_count: 10 },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'pending',
      });

      // Stop breaching while the episode is still pending.
      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-pending-to-inactive' } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'inactive',
      });

      const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
      const observedStatuses = new Set(events.map((event) => event.episode?.status));

      // The episode must NOT have visited active or recovering — it went
      // pending → inactive directly via the basic state machine's
      // pending --[recovered]--> inactive edge.
      expect(observedStatuses.has('pending')).toBe(true);
      expect(observedStatuses.has('inactive')).toBe(true);
      expect(observedStatuses.has('active')).toBe(false);
      expect(observedStatuses.has('recovering')).toBe(false);
    }
  );

  apiTest('tracks episode id and status_count independently per group', async ({ apiServices }) => {
    await apiServices.alertingV2.sourceIndex.indexDocs({
      index: SOURCE_INDEX,
      docs: [
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-multi-group-a',
          severity: 'high',
          value: 1,
        },
        {
          '@timestamp': new Date().toISOString(),
          'host.name': 'host-multi-group-b',
          severity: 'high',
          value: 1,
        },
      ],
    });

    const rule = await apiServices.alertingV2.rules.create(
      buildCreateRuleData({
        metadata: { name: 'director-multi-group' },
        query: {
          format: 'standalone',
          breach: {
            query: `FROM ${SOURCE_INDEX} | WHERE host.name IN ("host-multi-group-a", "host-multi-group-b") | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
          },
        },
        // pending_count is high so neither group transitions to active
        // during the test, keeping host-b in pending while host-a is
        // recovered to inactive.
        state_transition: { pending_count: 100 },
      })
    );

    // Wait until both groups have produced pending events.
    await expect
      .poll(
        async () => {
          const states = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(rule.id);
          return Array.from(states.values())
            .map((event) => event.episode?.status)
            .sort();
        },
        { timeout: POLL_TIMEOUT_MS, intervals: [POLL_INTERVAL_MS] }
      )
      .toStrictEqual(['pending', 'pending']);

    const initialStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(rule.id);
    const groupHashByHost = new Map(
      Array.from(initialStates.values()).map((event) => [
        event.data['host.name'] as string,
        event.group_hash,
      ])
    );

    const groupHashA = groupHashByHost.get('host-multi-group-a');
    const groupHashB = groupHashByHost.get('host-multi-group-b');
    expect(groupHashA).toBeDefined();
    expect(groupHashB).toBeDefined();

    // Drop only host-a so its episode transitions to inactive while
    // host-b keeps incrementing status_count in pending.
    await apiServices.alertingV2.sourceIndex.deleteDocs({
      index: SOURCE_INDEX,
      query: { term: { 'host.name': 'host-multi-group-a' } },
    });

    await expect
      .poll(
        async () => {
          const states = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(rule.id);
          return {
            a: states.get(groupHashA!)?.episode?.status,
            b: states.get(groupHashB!)?.episode?.status,
          };
        },
        { timeout: POLL_TIMEOUT_MS, intervals: [POLL_INTERVAL_MS] }
      )
      .toStrictEqual({ a: 'inactive', b: 'pending' });

    const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
    const eventsA = events.filter((event) => event.group_hash === groupHashA);
    const eventsB = events.filter((event) => event.group_hash === groupHashB);

    expect(eventsA.length).toBeGreaterThan(0);
    expect(eventsB.length).toBeGreaterThan(0);
    expect(eventsA.some((event) => event.episode?.status === 'inactive')).toBe(true);
    expect(eventsB.some((event) => event.episode?.status === 'inactive')).toBe(false);

    const idsA = new Set(eventsA.map((event) => event.episode?.id));
    const idsB = new Set(eventsB.map((event) => event.episode?.id));
    const [idA] = idsA;
    const [idB] = idsB;

    // Each group sticks to a single episode id throughout — and the two
    // groups must have DIFFERENT ids.
    expect(idsA.size).toBe(1);
    expect(idsB.size).toBe(1);
    expect(idA).not.toBe(idB);
  });

  apiTest(
    'transitions pending -> active via pending_timeframe even when pending_count is unreachable',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-pending-timeframe',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // pending_count=1000 is effectively unreachable, so the only path to
      // active is via the pending_timeframe threshold. The strategy
      // measures elapsed time between consecutive director runs for the
      // same group_hash, which is roughly SCHEDULE_INTERVAL (~5s). A 1s
      // timeframe is therefore reliably met on the second director tick.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-pending-timeframe' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-pending-timeframe" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: {
            pending_count: 1000,
            pending_timeframe: '1s',
            pending_operator: 'OR',
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
      const pendingEvents = events.filter((event) => event.episode?.status === 'pending');
      const activeEvents = events.filter((event) => event.episode?.status === 'active');

      // Must observe both: at least one pending event (statusCount cannot
      // possibly reach 1000 in this test window) and at least one active
      // event (proving the timeframe path was the trigger).
      expect(pendingEvents.length).toBeGreaterThanOrEqual(1);
      expect(activeEvents.length).toBeGreaterThanOrEqual(1);

      // None of the pending events should have status_count high enough to
      // satisfy the count threshold on their own.
      for (const event of pendingEvents) {
        expect(event.episode!.status_count!).toBeLessThan(1000);
      }
    }
  );

  apiTest(
    'transitions recovering -> inactive via recovering_timeframe when recovering_operator is OR',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-recovering-timeframe-or',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // recovering_count=1000 is effectively unreachable in this test window,
      // so the only path to inactive is via the recovering_timeframe threshold.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-recovering-timeframe-or' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-recovering-timeframe-or" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: {
            pending_count: 0,
            recovering_count: 1000,
            recovering_timeframe: '1s',
            recovering_operator: 'OR',
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-recovering-timeframe-or' } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'inactive',
      });

      const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
      const recoveringEvents = events.filter((event) => event.episode?.status === 'recovering');
      const inactiveEvents = events.filter((event) => event.episode?.status === 'inactive');

      expect(recoveringEvents.length).toBeGreaterThanOrEqual(1);
      expect(inactiveEvents.length).toBeGreaterThanOrEqual(1);

      for (const event of recoveringEvents) {
        expect(event.episode!.status_count!).toBeLessThan(1000);
      }

      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(rule.id);
      const [latestState] = Array.from(latestStates.values());

      expect(latestStates.size).toBe(1);
      expect(latestState.episode?.status).toBe('inactive');
    }
  );

  apiTest(
    'keeps the latest episode in recovering when only recovering_timeframe is met under recovering_operator AND',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-recovering-timeframe-and',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // Once we observe a second recovering event, the 1s timeframe has
      // definitely been satisfied at least once because the schedule interval is
      // much longer. The episode must still remain recovering because the count
      // threshold is intentionally unreachable and the operator is AND.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-recovering-timeframe-and' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-recovering-timeframe-and" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: {
            pending_count: 0,
            recovering_count: 1000,
            recovering_timeframe: '1s',
            recovering_operator: 'AND',
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': 'host-recovering-timeframe-and' } },
      });

      await expect
        .poll(
          async () => {
            const recoveringEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
              episodeStatus: 'recovering',
            });
            return recoveringEvents.length;
          },
          { timeout: POLL_TIMEOUT_MS, intervals: [POLL_INTERVAL_MS] }
        )
        .toBeGreaterThanOrEqual(2);

      const recoveringEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        episodeStatus: 'recovering',
      });
      const inactiveEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        episodeStatus: 'inactive',
      });

      expect(recoveringEvents.length).toBeGreaterThanOrEqual(2);
      expect(inactiveEvents).toHaveLength(0);

      for (const event of recoveringEvents) {
        expect(event.episode!.status_count!).toBeLessThan(1000);
      }

      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(rule.id);
      const [latestState] = Array.from(latestStates.values());

      expect(latestStates.size).toBe(1);
      expect(latestState.episode?.status).toBe('recovering');
    }
  );

  apiTest(
    'keeps the latest episode in pending when only pending_timeframe is met under pending_operator AND',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-pending-timeframe-and',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // Once we observe a second pending event, the 1s timeframe has
      // definitely been satisfied at least once because the schedule interval
      // is much longer. The episode must still remain pending because the
      // count threshold is intentionally unreachable and the operator is AND.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-pending-timeframe-and' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-pending-timeframe-and" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: {
            pending_count: 1000,
            pending_timeframe: '1s',
            pending_operator: 'AND',
          },
        })
      );

      await expect
        .poll(
          async () => {
            const pendingEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
              episodeStatus: 'pending',
            });
            return pendingEvents.length;
          },
          { timeout: POLL_TIMEOUT_MS, intervals: [POLL_INTERVAL_MS] }
        )
        .toBeGreaterThanOrEqual(2);

      const pendingEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        episodeStatus: 'pending',
      });
      const activeEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        episodeStatus: 'active',
      });

      expect(pendingEvents.length).toBeGreaterThanOrEqual(2);
      expect(activeEvents).toHaveLength(0);

      for (const event of pendingEvents) {
        expect(event.episode!.status_count!).toBeLessThan(1000);
      }

      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(rule.id);
      const [latestState] = Array.from(latestStates.values());

      expect(latestStates.size).toBe(1);
      expect(latestState.episode?.status).toBe('pending');
    }
  );

  apiTest(
    'transitions pending -> active under pending_operator AND when both count and timeframe are met',
    async ({ apiServices }) => {
      await apiServices.alertingV2.sourceIndex.indexDocs({
        index: SOURCE_INDEX,
        docs: [
          {
            '@timestamp': new Date().toISOString(),
            'host.name': 'host-pending-and-success',
            severity: 'high',
            value: 1,
          },
        ],
      });

      // pending_count=2 with a 1s timeframe under AND: by the second director
      // tick for this group the count threshold is reached AND enough time
      // has elapsed since the first pending event, so both criteria are met
      // and the episode must transition to active.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-pending-and-success' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "host-pending-and-success" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
          },
          state_transition: {
            pending_count: 2,
            pending_timeframe: '1s',
            pending_operator: 'AND',
          },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      const events = await apiServices.alertingV2.ruleEvents.find(rule.id);
      const pendingEvents = events.filter((event) => event.episode?.status === 'pending');
      const activeEvents = events.filter((event) => event.episode?.status === 'active');

      expect(pendingEvents.length).toBeGreaterThanOrEqual(1);
      expect(activeEvents.length).toBeGreaterThanOrEqual(1);

      // status_count must have observed value 1 in pending (proves the
      // count side was being walked) and must not be set on active events.
      const pendingCounts = pendingEvents
        .map((event) => event.episode!.status_count)
        .filter((count): count is number => typeof count === 'number');

      expect(pendingCounts).toContain(1);

      for (const event of activeEvents) {
        expect(event.episode?.status_count).toBeUndefined();
      }
    }
  );

  apiTest("no_data_strategy 'emit' sets the episode to active", async ({ apiServices }) => {
    const HOST = 'host-director-no-data-emit';

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
        metadata: { name: 'director-no-data-emit' },
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

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
      episodeStatus: 'active',
    });

    await apiServices.alertingV2.sourceIndex.deleteDocs({
      index: SOURCE_INDEX,
      query: { term: { 'host.name': HOST } },
    });

    await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
      status: 'no_data',
    });

    const noDataEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
      status: 'no_data',
    });

    expect(noDataEvents.length).toBeGreaterThanOrEqual(1);
    for (const event of noDataEvents) {
      expect(event.episode?.status).toBe('active');
    }
  });

  apiTest(
    "no_data_strategy 'last_known_status' preserves the prior episode status",
    async ({ apiServices }) => {
      const HOST = 'host-director-no-data-last-known';

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
          metadata: { name: 'director-no-data-last-known' },
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
          state_transition: { pending_count: 10 },
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'pending',
      });

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': HOST } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        status: 'no_data',
      });

      const noDataEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'no_data',
      });

      expect(noDataEvents.length).toBeGreaterThanOrEqual(1);
      for (const event of noDataEvents) {
        expect(event.episode?.status).toBe('pending');
      }
    }
  );

  apiTest(
    "no_data_strategy 'recover' transitions the episode toward recovery via a no_data event",
    async ({ apiServices }) => {
      const HOST = 'host-director-no-data-recover';

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

      // Use recovery_strategy 'none' so the recovery step never fires.
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({
          metadata: { name: 'director-no-data-recover' },
          query: {
            format: 'standalone',
            breach: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "${HOST}" | STATS count = COUNT(*) BY host.name | WHERE count >= 1`,
            },
            no_data: {
              query: `FROM ${SOURCE_INDEX} | WHERE host.name == "${HOST}" | STATS count = COUNT(*) BY host.name`,
            },
          },
          recovery_strategy: 'none',
          no_data_strategy: 'recover',
        })
      );

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        episodeStatus: 'active',
      });

      await apiServices.alertingV2.sourceIndex.deleteDocs({
        index: SOURCE_INDEX,
        query: { term: { 'host.name': HOST } },
      });

      await apiServices.alertingV2.ruleEvents.waitForAtLeast(rule.id, 1, {
        status: 'no_data',
      });

      const noDataEvents = await apiServices.alertingV2.ruleEvents.find(rule.id, {
        status: 'no_data',
      });

      expect(noDataEvents.length).toBeGreaterThanOrEqual(1);
      // The director applies the recovered FSM transition: active → recovering.
      for (const event of noDataEvents) {
        expect(event.episode?.status).toBe('recovering');
      }
    }
  );
});
