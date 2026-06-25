/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject, Subject } from 'rxjs';
import type { ChromeStart } from '@kbn/core/public';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import type { ActiveConversation } from '@kbn/agent-builder-browser/events';
import { ChatEventType, type ChatEvent } from '@kbn/agent-builder-common';
import type { VersionedAttachment } from '@kbn/agent-builder-common/attachments';
import type { SigEvent } from '@kbn/streams-schema';
import { SIGNIFICANT_EVENT_ATTACHMENT_TYPE } from '@kbn/streams-plugin/common';
import { FocusedSignificantEventService } from '../../../services/significant_events/focused_significant_event_service';
import {
  registerSignificantEventAutoAttach,
  type IdGenerator,
} from './significant_event_auto_attach';
import { AGENTBUILDER_FEATURE_ID } from '@kbn/agent-builder-plugin/public';

const createEvent = (overrides?: Partial<SigEvent>): SigEvent => ({
  '@timestamp': '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  event_id: 'event-1',
  discovery_slug: 'payment-outage',
  stream_names: ['logs.payment'],
  title: 'Payment outage',
  summary: 'Payments are failing.',
  root_cause: 'Payment gateway timeout.',
  criticality: 90,
  confidence: 0.8,
  recommendations: ['Restart gateway client'],
  status: 'promoted',
  ...overrides,
});

const createVersionedAttachment = (id: string): VersionedAttachment => ({
  id,
  type: SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
  versions: [
    {
      version: 1,
      data: createEvent(),
      created_at: '2026-01-01T00:00:00.000Z',
      content_hash: 'hash',
    },
  ],
  current_version: 1,
});

const createRoundCompleteEvent = (attachmentId: string): ChatEvent => ({
  type: ChatEventType.roundComplete,
  data: {
    round: {} as never,
    attachments: [createVersionedAttachment(attachmentId)],
  },
});

const createIdGenerator = (): IdGenerator => {
  let current = 'draft-id-1';

  return {
    get current() {
      return current;
    },
    next: jest.fn(() => {
      current = current === 'draft-id-1' ? 'draft-id-2' : 'draft-id-3';
      return current;
    }),
  };
};

describe('registerSignificantEventAutoAttach', () => {
  let currentAppId$: BehaviorSubject<string | null>;
  let activeConversation$: BehaviorSubject<ActiveConversation | null>;
  let focusedSignificantEventService: FocusedSignificantEventService;
  let addAttachment: jest.Mock;
  let draftAttachmentId: IdGenerator;
  let cleanup: () => void;
  let chatEventsByConversationId: Map<string, Subject<ChatEvent>>;

  beforeEach(() => {
    jest.useFakeTimers();
    currentAppId$ = new BehaviorSubject<string | null>(null);
    activeConversation$ = new BehaviorSubject<ActiveConversation | null>(null);
    focusedSignificantEventService = new FocusedSignificantEventService();
    addAttachment = jest.fn();
    draftAttachmentId = createIdGenerator();
    chatEventsByConversationId = new Map();

    const chrome = {
      sidebar: {
        getCurrentAppId$: () => currentAppId$.asObservable(),
      },
    } as unknown as ChromeStart;

    const agentBuilder = {
      addAttachment,
      events: {
        ui: { activeConversation$: activeConversation$.asObservable() },
        getChatEvents$: jest.fn((conversationId: string) => {
          let chatEvents$ = chatEventsByConversationId.get(conversationId);

          if (!chatEvents$) {
            chatEvents$ = new Subject<ChatEvent>();
            chatEventsByConversationId.set(conversationId, chatEvents$);
          }

          return chatEvents$.asObservable();
        }),
      },
    } as unknown as AgentBuilderPluginStart;

    cleanup = registerSignificantEventAutoAttach({
      agentBuilder,
      chrome,
      focusedSignificantEventService,
      draftAttachmentId,
    });
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  it('does not attach when the Agent Builder sidebar is closed', () => {
    focusedSignificantEventService.setFocusedEvent(createEvent());
    activeConversation$.next({ id: undefined });
    jest.runOnlyPendingTimers();

    expect(addAttachment).not.toHaveBeenCalled();
  });

  it('attaches the focused event to a new conversation draft when chat is open', () => {
    const event = createEvent();

    focusedSignificantEventService.setFocusedEvent(event);
    currentAppId$.next(AGENTBUILDER_FEATURE_ID);
    activeConversation$.next({ id: undefined });
    jest.runOnlyPendingTimers();

    expect(addAttachment).toHaveBeenCalledWith({
      id: 'draft-id-1',
      type: SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
      origin: 'payment-outage',
      data: event,
    });
  });

  it('does not attach to an existing conversation', () => {
    focusedSignificantEventService.setFocusedEvent(createEvent());
    currentAppId$.next(AGENTBUILDER_FEATURE_ID);
    activeConversation$.next({ id: 'conversation-1', conversation: undefined });
    jest.runOnlyPendingTimers();

    expect(addAttachment).not.toHaveBeenCalled();
  });

  it('updates the same draft attachment when the focused event changes before send', () => {
    currentAppId$.next(AGENTBUILDER_FEATURE_ID);
    activeConversation$.next({ id: undefined });

    focusedSignificantEventService.setFocusedEvent(createEvent({ discovery_slug: 'first-event' }));
    jest.runOnlyPendingTimers();
    focusedSignificantEventService.setFocusedEvent(createEvent({ discovery_slug: 'second-event' }));
    jest.runOnlyPendingTimers();

    expect(addAttachment).toHaveBeenCalledTimes(2);
    expect(addAttachment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'draft-id-1', origin: 'first-event' })
    );
    expect(addAttachment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'draft-id-1', origin: 'second-event' })
    );
  });

  it('rotates the draft id after it is created in a completed round', () => {
    focusedSignificantEventService.setFocusedEvent(createEvent());
    currentAppId$.next('agentBuilder');
    activeConversation$.next({ id: undefined });
    jest.runOnlyPendingTimers();

    activeConversation$.next({ id: 'conversation-1', conversation: undefined });
    chatEventsByConversationId.get('conversation-1')?.next(createRoundCompleteEvent('draft-id-1'));

    currentAppId$.next(null);
    currentAppId$.next('agentBuilder');
    activeConversation$.next({ id: undefined });
    jest.runOnlyPendingTimers();

    expect(addAttachment).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'draft-id-3' }));
  });

  it('unsubscribes on cleanup', () => {
    cleanup();

    focusedSignificantEventService.setFocusedEvent(createEvent());
    currentAppId$.next('agentBuilder');
    activeConversation$.next({ id: undefined });
    jest.runOnlyPendingTimers();

    expect(addAttachment).not.toHaveBeenCalled();
  });
});
