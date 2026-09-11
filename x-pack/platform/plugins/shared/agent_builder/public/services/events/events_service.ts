/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable, Subscription } from 'rxjs';
import { BehaviorSubject, Subject, filter, finalize, map, scan, share } from 'rxjs';
import type { ChatEvent } from '@kbn/agent-builder-common';
import type { ActiveConversation, BrowserChatEvent } from '@kbn/agent-builder-browser/events';
import type { ActiveStreamState } from './active_stream_state';
import { activeStreamReducer, initialActiveStreamState } from './active_stream_state';

interface TaggedChatEvent {
  /** The conversation that produced this event. */
  conversationId: string;
  event: BrowserChatEvent;
}

interface ConversationStream {
  state$: BehaviorSubject<ActiveStreamState>;
  sub: Subscription;
  ended: boolean;
}

export class EventsService {
  private readonly events$ = new Subject<TaggedChatEvent>();

  private readonly conversationStreams = new Map<string, ConversationStream>();

  /**
   * @deprecated Backed by a single shared `Subject` that interleaves events from every
   * conversation. With concurrent per-conversation streams, consumers cannot reliably
   * attribute an event to its source conversation from this stream alone. Use
   * `getChatEvents$(conversationId)` for per-conversation scoping.
   */
  public readonly obs$: Observable<BrowserChatEvent> = this.events$.pipe(
    map(({ event }) => event),
    share()
  );

  private readonly activeConversationState$ = new BehaviorSubject<ActiveConversation | null>(null);
  public readonly activeConversation$ = this.activeConversationState$.asObservable();

  constructor() {}

  private ensureConversationStream(conversationId: string): ConversationStream {
    const existing = this.conversationStreams.get(conversationId);
    if (existing) {
      existing.ended = false;
      return existing;
    }

    const state$ = new BehaviorSubject<ActiveStreamState>(initialActiveStreamState);
    const sub = this.getChatEvents$(conversationId)
      .pipe(scan(activeStreamReducer, initialActiveStreamState))
      .subscribe(state$);

    const stream: ConversationStream = { state$, sub, ended: false };
    this.conversationStreams.set(conversationId, stream);
    return stream;
  }

  private maybeTeardownConversationStream(conversationId: string) {
    const stream = this.conversationStreams.get(conversationId);
    const isIdle = !stream?.state$.getValue().activeExecution;
    if (!stream || stream.state$.observed || (!stream.ended && !isIdle)) {
      return;
    }
    stream.sub.unsubscribe();
    this.conversationStreams.delete(conversationId);
  }

  propagateChatEvent(conversationId: string, event: ChatEvent) {
    this.ensureConversationStream(conversationId);
    this.events$.next({ conversationId, event });
  }

  notifyStreamEnded(conversationId: string) {
    const stream = this.conversationStreams.get(conversationId);
    if (!stream) {
      return;
    }
    stream.ended = true;
    this.maybeTeardownConversationStream(conversationId);
  }

  /**
   * Returns a hot observable of chat events scoped to a single conversation. Subscribe
   * any time during the events service's lifetime; events emit live as the agent runs
   * the conversation. Subscribers only see events tagged with the matching id.
   */
  getChatEvents$(conversationId: string): Observable<BrowserChatEvent> {
    return this.events$.pipe(
      filter((tagged) => tagged.conversationId === conversationId),
      map(({ event }) => event)
    );
  }

  getActiveStream$(conversationId: string): Observable<ActiveStreamState> {
    const { state$ } = this.ensureConversationStream(conversationId);
    return state$.pipe(finalize(() => this.maybeTeardownConversationStream(conversationId)));
  }

  setActiveConversation(activeConversation: ActiveConversation | null) {
    this.activeConversationState$.next(activeConversation);
  }

  clearActiveConversation() {
    this.activeConversationState$.next(null);
  }

  getActiveConversation(): ActiveConversation | null {
    return this.activeConversationState$.getValue();
  }
}
