/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Subject } from 'rxjs';
import type { RuleResponse } from '../../../common/api/detection_engine/model/rule_schema';
import { createAiRuleCreationHandler } from './ai_rule_creation_handler';
import type { AiRuleCreationService } from './ai_rule_creation_store';
import { securitySolutionQueryClient } from '../../common/containers/query_client/query_client_provider';

jest.mock('../rule_management/api/api', () => ({
  createRule: jest.fn(),
  updateRule: jest.fn(),
}));
jest.mock('./transforms', () => ({
  transformInput: jest.fn((r) => r),
  transformOutput: jest.fn((r) => r),
}));
jest.mock('../../common/containers/query_client/query_client_provider', () => ({
  securitySolutionQueryClient: {
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
  },
}));

import { createRule, updateRule } from '../rule_management/api/api';

const mockCreateRule = createRule as jest.Mock;
const mockUpdateRule = updateRule as jest.Mock;

const makeRule = (overrides: Partial<RuleResponse> = {}): RuleResponse =>
  ({
    name: 'Test Rule',
    description: 'Detects test events',
    type: 'esql',
    language: 'esql',
    query: 'FROM logs-* | WHERE event.action == "login"',
    severity: 'low',
    risk_score: 21,
    ...overrides,
  } as unknown as RuleResponse);

const savedRule = makeRule({ id: 'saved-id-1', name: 'Saved Rule' });

const makeService = (): AiRuleCreationService => {
  const subject = new Subject<{
    rule: RuleResponse;
    attachmentId?: string;
    updateOrigin?: (id: string) => Promise<unknown>;
  }>();
  return {
    saveRuleRequest$: subject.asObservable(),
    _subject: subject,
    clearSaving: jest.fn(),
    deactivateFormSync: jest.fn(),
    getSession: jest.fn().mockReturnValue(null),
  } as unknown as AiRuleCreationService & { _subject: typeof subject };
};

const makeNotifications = () => ({
  toasts: {
    addSuccess: jest.fn(),
    addDanger: jest.fn(),
    addWarning: jest.fn(),
  },
});

const makeAgentBuilder = (convId?: string) => ({
  events: {
    ui: {
      activeConversation$: {
        subscribe: jest.fn((cb: (v: { id: string } | undefined) => void) => {
          if (convId) cb({ id: convId });
          return { unsubscribe: jest.fn() };
        }),
      },
    },
  },
  addAttachment: jest.fn(),
});

const emit = (service: AiRuleCreationService & { _subject: Subject<unknown> }, payload: object) => {
  (service as unknown as { _subject: Subject<unknown> })._subject.next(payload);
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createAiRuleCreationHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('validation failure', () => {
    it('calls clearSaving and shows danger toast without calling the API', async () => {
      const service = makeService();
      const notifications = makeNotifications();
      createAiRuleCreationHandler({
        aiRuleCreation: service,
        notifications: notifications as never,
      });

      emit(service as never, { rule: { name: 'bad' } }); // missing required fields
      await flush();

      expect(service.clearSaving).toHaveBeenCalled();
      expect(notifications.toasts.addDanger).toHaveBeenCalled();
      expect(mockCreateRule).not.toHaveBeenCalled();
      expect(mockUpdateRule).not.toHaveBeenCalled();
    });
  });

  describe('create path (no rule.id)', () => {
    it('calls createRule and shows success toast', async () => {
      mockCreateRule.mockResolvedValue(savedRule);
      const service = makeService();
      const notifications = makeNotifications();
      const agentBuilder = makeAgentBuilder('conv-1');

      createAiRuleCreationHandler({
        aiRuleCreation: service,
        notifications: notifications as never,
        agentBuilder: agentBuilder as never,
      });

      emit(service as never, { rule: makeRule() });
      await flush();

      expect(mockCreateRule).toHaveBeenCalled();
      expect(mockUpdateRule).not.toHaveBeenCalled();
      expect(notifications.toasts.addSuccess).toHaveBeenCalled();
      expect(service.clearSaving).toHaveBeenCalled();
    });

    it('calls updateOrigin with the saved rule id', async () => {
      mockCreateRule.mockResolvedValue(savedRule);
      const service = makeService();
      const updateOrigin = jest.fn().mockResolvedValue(undefined);

      createAiRuleCreationHandler({
        aiRuleCreation: service,
        notifications: makeNotifications() as never,
        agentBuilder: makeAgentBuilder('conv-1') as never,
      });

      emit(service as never, { rule: makeRule(), updateOrigin });
      await flush();

      expect(updateOrigin).toHaveBeenCalledWith('saved-id-1');
    });

    it('does not call updateOrigin when convId is absent', async () => {
      mockCreateRule.mockResolvedValue(savedRule);
      const service = makeService();
      const updateOrigin = jest.fn();

      createAiRuleCreationHandler({
        aiRuleCreation: service,
        notifications: makeNotifications() as never,
        // no agentBuilder → no active conversation
      });

      emit(service as never, { rule: makeRule(), updateOrigin });
      await flush();

      expect(updateOrigin).not.toHaveBeenCalled();
    });
  });

  describe('update path (rule.id present)', () => {
    it('calls updateRule and does not call updateOrigin', async () => {
      mockUpdateRule.mockResolvedValue(savedRule);
      const service = makeService();
      const updateOrigin = jest.fn();

      createAiRuleCreationHandler({
        aiRuleCreation: service,
        notifications: makeNotifications() as never,
        agentBuilder: makeAgentBuilder('conv-1') as never,
      });

      emit(service as never, { rule: makeRule({ id: 'saved-id-1' }), updateOrigin });
      await flush();

      expect(mockUpdateRule).toHaveBeenCalled();
      expect(mockCreateRule).not.toHaveBeenCalled();
      expect(updateOrigin).not.toHaveBeenCalled();
    });

    it('writes to query cache immediately', async () => {
      mockUpdateRule.mockResolvedValue(savedRule);
      const service = makeService();

      createAiRuleCreationHandler({
        aiRuleCreation: service,
        notifications: makeNotifications() as never,
      });

      emit(service as never, { rule: makeRule({ id: 'saved-id-1' }) });
      await flush();

      expect(securitySolutionQueryClient.setQueryData).toHaveBeenCalled();
    });
  });

  describe('API error', () => {
    it('calls clearSaving and shows danger toast with the error message', async () => {
      mockCreateRule.mockRejectedValue({ body: { message: 'Server error' } });
      const service = makeService();
      const notifications = makeNotifications();

      createAiRuleCreationHandler({
        aiRuleCreation: service,
        notifications: notifications as never,
      });

      emit(service as never, { rule: makeRule() });
      await flush();

      expect(service.clearSaving).toHaveBeenCalled();
      expect(notifications.toasts.addDanger).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Server error' })
      );
    });
  });
});
