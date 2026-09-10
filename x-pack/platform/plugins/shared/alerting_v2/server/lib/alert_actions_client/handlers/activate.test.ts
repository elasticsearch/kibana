/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { ALERT_EPISODE_ACTION_TYPE } from '@kbn/alerting-v2-schemas';
import {
  alertEpisodeStatus,
  alertEventStatus,
  alertEventType,
  type AlertEpisodeStatus,
} from '../../../resources/datastreams/alert_events';
import { ALERTING_ERROR_CODES } from '../../errors/error_codes';
import { buildAlertEventRecord, buildHandlerItem } from '../test_utils';
import type { AlertEventRecord } from '../types';
import { activateHandler } from './activate';

const FIXED_NOW = '2026-06-28T19:00:00.000Z';

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date(FIXED_NOW));
});

afterAll(() => {
  jest.useRealTimers();
});

const buildAlertEvent = (overrides: Partial<AlertEventRecord> = {}): AlertEventRecord =>
  buildAlertEventRecord({
    episode_status: alertEpisodeStatus.inactive,
    ...overrides,
  });

const buildItem = (alertEvent: AlertEventRecord = buildAlertEvent()) =>
  buildHandlerItem(
    { action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE, reason: 'reopen for follow-up' } as const,
    alertEvent
  );

describe('activateHandler', () => {
  describe('happy path', () => {
    it('forwards the precomputed audit doc unchanged', () => {
      const item = buildItem();
      const prepared = activateHandler.prepare(item);
      expect(prepared.alertActionDoc).toBe(item.alertActionDoc);
    });

    it('builds a synthetic .rule-events doc that forces the episode to active + breached', () => {
      const alertEvent = buildAlertEvent();
      const prepared = activateHandler.prepare(buildItem(alertEvent));

      expect(prepared.ruleEvent).toMatchObject({
        '@timestamp': FIXED_NOW,
        rule: { id: alertEvent.rule_id, version: alertEvent.rule_version },
        group_hash: alertEvent.group_hash,
        data: alertEvent.data_json,
        status: alertEventStatus.breached,
        source: alertEvent.source,
        type: alertEventType.alert,
        space_id: alertEvent.space_id,
        episode: {
          id: alertEvent.episode_id,
          status: alertEpisodeStatus.active,
          status_count: 1,
        },
        severity: alertEvent.severity,
      });
    });

    it.each<AlertEpisodeStatus>([
      alertEpisodeStatus.inactive,
      alertEpisodeStatus.recovering,
      alertEpisodeStatus.pending,
    ])('allows activate when episode_status is %s', (status) => {
      expect(() =>
        activateHandler.prepare(buildItem(buildAlertEvent({ episode_status: status })))
      ).not.toThrow();
    });

    it.each<AlertEpisodeStatus>([
      alertEpisodeStatus.inactive,
      alertEpisodeStatus.recovering,
      alertEpisodeStatus.pending,
    ])('starts status_count at 1 when reopening from %s', (status) => {
      const prepared = activateHandler.prepare(
        buildItem(buildAlertEvent({ episode_status: status }))
      );
      expect(prepared.ruleEvent?.episode?.status_count).toBe(1);
    });

    it('defaults rule version to 1 when the alert event omits it', () => {
      const prepared = activateHandler.prepare(
        buildItem(buildAlertEvent({ rule_version: undefined }))
      );
      expect(prepared.ruleEvent?.rule?.version).toBe(1);
    });

    it('omits severity on the synthetic event when the alert event has none', () => {
      const prepared = activateHandler.prepare(buildItem(buildAlertEvent({ severity: null })));
      expect(prepared.ruleEvent?.severity).toBeUndefined();
    });
  });

  describe('precondition: rejects only when the episode is already active', () => {
    it('rejects activate with INVALID_EPISODE_STATE_TRANSITION (400) when episode_status is active', () => {
      try {
        activateHandler.prepare(
          buildItem(buildAlertEvent({ episode_status: alertEpisodeStatus.active }))
        );
        throw new Error('expected handler to throw');
      } catch (error) {
        expect(Boom.isBoom(error)).toBe(true);
        expect(error.output.statusCode).toBe(400);
        expect(error.data).toMatchObject({
          code: ALERTING_ERROR_CODES.INVALID_EPISODE_STATE_TRANSITION,
          details: {
            group_hash: 'group-1',
            episode_id: 'episode-1',
            episode_status: alertEpisodeStatus.active,
            action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
          },
        });
        expect(error.message).toContain('is already active');
      }
    });
  });
});
