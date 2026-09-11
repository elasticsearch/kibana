/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable, Subscription } from 'rxjs';
import { BehaviorSubject, finalize, scan } from 'rxjs';
import type { BrowserChatEvent } from '@kbn/agent-builder-browser/events';
import type { ActiveStreamState } from './active_stream_state';
import { activeStreamReducer, initialActiveStreamState } from './active_stream_state';

/**
 * Minimal event source the store folds over. Today this is `EventsService` (the public
 * transport), but the store only needs raw per-conversation events — nothing else off it.
 * When transport moves to websockets, only the thing that implements this changes.
 */
export interface ChatEventSource {
  getChatEvents$: (conversationId: string) => Observable<BrowserChatEvent>;
}

interface ConversationStream {
  state$: BehaviorSubject<ActiveStreamState>;
  sub: Subscription;
  ended: boolean;
}

export class ConversationStreamService {
  private readonly streams = new Map<string, ConversationStream>();

  constructor(private readonly source: ChatEventSource) {}

  private ensure(conversationId: string): ConversationStream {
    const existing = this.streams.get(conversationId);
    if (existing) {
      existing.ended = false;
      return existing;
    }
    const state$ = new BehaviorSubject<ActiveStreamState>(initialActiveStreamState);
    const sub = this.source
      .getChatEvents$(conversationId)
      .pipe(scan(activeStreamReducer, initialActiveStreamState))
      .subscribe(state$);
    const stream: ConversationStream = { state$, sub, ended: false };
    this.streams.set(conversationId, stream);
    return stream;
  }

  private maybeTeardown(conversationId: string) {
    const stream = this.streams.get(conversationId);
    const isIdle = !stream?.state$.getValue().activeExecution;
    if (!stream || stream.state$.observed || (!stream.ended && !isIdle)) {
      return;
    }
    stream.sub.unsubscribe();
    this.streams.delete(conversationId);
  }

  /**
   * Hot state stream for one conversation. Consumers subscribe (e.g. via `useObservable`)
   * and receive the folded `ActiveStreamState` as the agent runs.
   */
  getActiveStream$(conversationId: string): Observable<ActiveStreamState> {
    const { state$ } = this.ensure(conversationId);
    return state$.pipe(finalize(() => this.maybeTeardown(conversationId)));
  }

  /** Non-reactive snapshot: is this conversation mid-run right now. */
  isStreamActive(conversationId: string): boolean {
    return !!this.streams.get(conversationId)?.state$.getValue().activeExecution;
  }

  notifyStreamEnded(conversationId: string) {
    const stream = this.streams.get(conversationId);
    if (!stream) {
      return;
    }
    stream.ended = true;
    this.maybeTeardown(conversationId);
  }
}
