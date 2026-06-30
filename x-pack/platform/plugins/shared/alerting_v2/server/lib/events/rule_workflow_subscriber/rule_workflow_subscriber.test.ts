/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import type { WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';
import { createWorkflowsClientMock } from '@kbn/workflows-extensions/server/mocks';
import type { LoggerService } from '../../services/logger_service/logger_service';
import { createLoggerService } from '../../services/logger_service/logger_service.mock';
import type { WorkflowService } from '../../services/workflow_service/workflow_service';
import { createWorkflowService } from '../../services/workflow_service/workflow_service.mock';
import { RULE_CREATED_EVENT_TYPE, type RuleCreatedEvent } from '../rule_event_publisher/events';
import type { AlertingDomainEvent, AlertingPublisherContext } from '../domain_events';
import { createEventBusMock } from '../event_bus/event_bus.mock';
import type { EventBus, Subscription } from '../event_bus';
import { RuleWorkflowSubscriber } from './rule_workflow_subscriber';
import { RULE_WORKFLOW_TRIGGERS, RuleCreatedTriggerId } from './triggers';

type CapturedHandler = (
  event: AlertingDomainEvent,
  context: AlertingPublisherContext
) => void | Promise<void>;

const ruleCreatedEvent: RuleCreatedEvent = {
  type: RULE_CREATED_EVENT_TYPE,
  payload: { rule: { ruleId: 'rule-1', spaceId: 'my-space' } },
};

describe('RuleWorkflowSubscriber', () => {
  let bus: jest.Mocked<EventBus<AlertingDomainEvent, AlertingPublisherContext>>;
  let workflowService: WorkflowService;
  let workflowsExtensions: jest.Mocked<WorkflowsExtensionsServerPluginStart>;
  let mockEmitEvent: jest.Mock;
  let loggerService: LoggerService;
  let mockLogger: jest.Mocked<Logger>;
  let subscriber: RuleWorkflowSubscriber;
  let request: KibanaRequest;

  beforeEach(() => {
    bus = createEventBusMock<AlertingDomainEvent, AlertingPublisherContext>();

    ({ workflowService, workflowsExtensions } = createWorkflowService());
    mockEmitEvent = jest.fn().mockResolvedValue(undefined);
    workflowsExtensions.getClient.mockResolvedValue(
      createWorkflowsClientMock({ emitEvent: mockEmitEvent })
    );

    ({ loggerService, mockLogger } = createLoggerService());
    subscriber = new RuleWorkflowSubscriber(bus, workflowService, loggerService);
    request = httpServerMock.createKibanaRequest();
  });

  describe('start()', () => {
    it("subscribes one handler per binding in the catalog, using each binding's eventType", () => {
      subscriber.start();

      expect(bus.subscribe).toHaveBeenCalledTimes(RULE_WORKFLOW_TRIGGERS.length);

      const subscribedEventTypes = bus.subscribe.mock.calls.map(([eventType]) => eventType);
      const catalogEventTypes = RULE_WORKFLOW_TRIGGERS.map((t) => t.eventType);
      expect(subscribedEventTypes.sort()).toEqual(catalogEventTypes.sort());
    });

    it('is idempotent: a second call does not double-subscribe', () => {
      subscriber.start();
      const firstCallCount = bus.subscribe.mock.calls.length;
      subscriber.start();

      expect(bus.subscribe).toHaveBeenCalledTimes(firstCallCount);
    });
  });

  describe('event dispatch', () => {
    /**
     * Captures the handler the subscriber registered for `eventType` so
     * tests can invoke it directly without going through the real bus.
     */
    const handlerFor = (eventType: AlertingDomainEvent['type']): CapturedHandler => {
      const call = bus.subscribe.mock.calls.find(([type]) => type === eventType);
      if (!call) {
        throw new Error(`No handler registered for "${eventType}"`);
      }
      return call[1] as CapturedHandler;
    };

    it("forwards context.request through WorkflowService, with the binding's triggerId and the event payload", async () => {
      subscriber.start();

      await handlerFor(RULE_CREATED_EVENT_TYPE)(ruleCreatedEvent, { request });

      // The acting user's request must reach getClient so the workflow runs with
      // the same credentials/space that changed the rule (RNA #504 requirement 3).
      expect(workflowsExtensions.getClient).toHaveBeenCalledWith(request);
      expect(mockEmitEvent).toHaveBeenCalledTimes(1);
      expect(mockEmitEvent).toHaveBeenCalledWith(RuleCreatedTriggerId, ruleCreatedEvent.payload);
    });

    it('catches WorkflowService failures, logs them, and does not let the rejection escape the handler', async () => {
      mockEmitEvent.mockRejectedValueOnce(new Error('workflows unreachable'));

      subscriber.start();

      await expect(
        handlerFor(RULE_CREATED_EVENT_TYPE)(ruleCreatedEvent, { request })
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop()', () => {
    it('unsubscribes every active subscription and clears internal state', () => {
      const unsubscribers: jest.Mock[] = [];
      bus.subscribe.mockImplementation(() => {
        const unsubscribe = jest.fn();
        unsubscribers.push(unsubscribe);
        return { unsubscribe } satisfies Subscription;
      });

      subscriber.start();
      expect(unsubscribers.length).toBe(RULE_WORKFLOW_TRIGGERS.length);

      subscriber.stop();

      for (const unsubscribe of unsubscribers) {
        expect(unsubscribe).toHaveBeenCalledTimes(1);
      }
    });

    it('makes a subsequent start() re-subscribe (state cleared)', () => {
      subscriber.start();
      const firstCount = bus.subscribe.mock.calls.length;

      subscriber.stop();
      subscriber.start();

      expect(bus.subscribe).toHaveBeenCalledTimes(firstCount * 2);
    });

    it('is safe to call when no subscriptions are active', () => {
      expect(() => subscriber.stop()).not.toThrow();
    });
  });
});
