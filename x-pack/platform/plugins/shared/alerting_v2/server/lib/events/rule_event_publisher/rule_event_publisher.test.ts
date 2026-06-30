/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import type { EventBus } from '../event_bus';
import type { AlertingDomainEvent, AlertingPublisherContext } from '../domain_events';
import { createRuleEventPublisher } from './rule_event_publisher.mock';
import type { EventRule, RuleEventPublisher } from './rule_event_publisher';
import {
  RULE_CREATED_EVENT_TYPE,
  RULE_DELETED_EVENT_TYPE,
  RULE_DISABLED_EVENT_TYPE,
  RULE_ENABLED_EVENT_TYPE,
  RULE_UPDATED_EVENT_TYPE,
} from './events';

describe('RuleEventPublisher', () => {
  let publisher: RuleEventPublisher;
  let eventBus: jest.Mocked<EventBus<AlertingDomainEvent, AlertingPublisherContext>>;
  let request: KibanaRequest;

  beforeEach(() => {
    ({ publisher, eventBus } = createRuleEventPublisher());
    request = httpServerMock.createKibanaRequest();
  });

  const cases = [
    {
      name: 'emitRuleCreated',
      type: RULE_CREATED_EVENT_TYPE,
      emit: (p: RuleEventPublisher, r: KibanaRequest, rules: EventRule[]) =>
        p.emitRuleCreated(r, rules),
    },
    {
      name: 'emitRuleUpdated',
      type: RULE_UPDATED_EVENT_TYPE,
      emit: (p: RuleEventPublisher, r: KibanaRequest, rules: EventRule[]) =>
        p.emitRuleUpdated(r, rules),
    },
    {
      name: 'emitRuleDeleted',
      type: RULE_DELETED_EVENT_TYPE,
      emit: (p: RuleEventPublisher, r: KibanaRequest, rules: EventRule[]) =>
        p.emitRuleDeleted(r, rules),
    },
    {
      name: 'emitRuleEnabled',
      type: RULE_ENABLED_EVENT_TYPE,
      emit: (p: RuleEventPublisher, r: KibanaRequest, rules: EventRule[]) =>
        p.emitRuleEnabled(r, rules),
    },
    {
      name: 'emitRuleDisabled',
      type: RULE_DISABLED_EVENT_TYPE,
      emit: (p: RuleEventPublisher, r: KibanaRequest, rules: EventRule[]) =>
        p.emitRuleDisabled(r, rules),
    },
  ];

  describe.each(cases)('$name', ({ type, emit }) => {
    it('emits the matching event type with the { ruleId, spaceId } payload', () => {
      emit(publisher, request, [{ id: 'rule-1', spaceId: 'space-1' }]);

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledWith(
        { type, payload: { rule: { ruleId: 'rule-1', spaceId: 'space-1' } } },
        { request }
      );
    });

    it('emits one event per rule for bulk operations', () => {
      emit(publisher, request, [
        { id: 'rule-1', spaceId: 'space-1' },
        { id: 'rule-2', spaceId: 'space-1' },
      ]);

      expect(eventBus.publish).toHaveBeenCalledTimes(2);
      expect(eventBus.publish.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          type,
          payload: { rule: { ruleId: 'rule-1', spaceId: 'space-1' } },
        })
      );
      expect(eventBus.publish.mock.calls[1][0]).toEqual(
        expect.objectContaining({
          type,
          payload: { rule: { ruleId: 'rule-2', spaceId: 'space-1' } },
        })
      );
    });

    it('emits nothing for an empty array', () => {
      emit(publisher, request, []);

      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });
});
