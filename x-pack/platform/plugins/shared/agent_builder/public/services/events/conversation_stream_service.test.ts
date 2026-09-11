/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Subject } from 'rxjs';
import { ChatEventType, type ChatEvent } from '@kbn/agent-builder-common';
import { ConversationStreamService, type ChatEventSource } from './conversation_stream_service';
import { initialActiveStreamState, type ActiveStreamState } from './active_stream_state';

// Minimal message_chunk event - enough for the reducer to accumulate message text
const messageChunkEvent = (chunk: string): ChatEvent =>
  ({
    type: ChatEventType.messageChunk,
    data: { message_id: 'm1', text_chunk: chunk },
  } as ChatEvent);

// Minimal round_complete event - reducer sets activeExecution to null and seals
const roundCompleteEvent = (roundId: string): ChatEvent =>
  ({
    type: ChatEventType.roundComplete,
    data: { round: { id: roundId } },
  } as ChatEvent);

// Inject a fake source backed by per-conversation Subjects.
// The whole point of ChatEventSource is to avoid needing the real EventsService here.
const makeFakeSource = () => {
  const subjects = new Map<string, Subject<ChatEvent>>();
  const getSubject = (id: string): Subject<ChatEvent> => {
    if (!subjects.has(id)) subjects.set(id, new Subject());
    return subjects.get(id)!;
  };
  const source: ChatEventSource = {
    // BrowserChatEvent = ChatEvent, structurally identical, no cast needed
    getChatEvents$: (conversationId) => getSubject(conversationId).asObservable() as any,
  };
  return { source, getSubject };
};

describe('ConversationStreamService', () => {
  it('emits initialActiveStreamState immediately on subscribe before any event', () => {
    const { source } = makeFakeSource();
    const service = new ConversationStreamService(source);
    const emissions: ActiveStreamState[] = [];

    const sub = service.getActiveStream$('A').subscribe((state) => emissions.push(state));
    // BehaviorSubject seed fires synchronously on subscribe
    expect(emissions[0]).toEqual(initialActiveStreamState);
    sub.unsubscribe();
  });

  it('emits accumulated states in order as events are pushed', () => {
    const { source, getSubject } = makeFakeSource();
    const service = new ConversationStreamService(source);
    const emissions: ActiveStreamState[] = [];

    service.getActiveStream$('A').subscribe((state) => emissions.push(state));

    getSubject('A').next(messageChunkEvent('Hello'));
    getSubject('A').next(messageChunkEvent(' World'));

    // [0] = initial seed, [1] = after 'Hello', [2] = after ' World'
    expect(emissions).toHaveLength(3);
    expect(emissions[0]).toEqual(initialActiveStreamState);
    expect(emissions[1].activeExecution?.message).toBe('Hello');
    expect(emissions[2].activeExecution?.message).toBe('Hello World');
  });

  it('isolates events per conversation - events for A do not appear on B stream', () => {
    const { source, getSubject } = makeFakeSource();
    const service = new ConversationStreamService(source);
    const fromA: ActiveStreamState[] = [];
    const fromB: ActiveStreamState[] = [];

    service.getActiveStream$('A').subscribe((state) => fromA.push(state));
    service.getActiveStream$('B').subscribe((state) => fromB.push(state));

    getSubject('A').next(messageChunkEvent('a1'));
    getSubject('B').next(messageChunkEvent('b1'));

    expect(fromA[1].activeExecution?.message).toBe('a1');
    expect(fromB[1].activeExecution?.message).toBe('b1');
    // A stream never saw 'b1'
    expect(fromA.every((s) => s.activeExecution?.message !== 'b1')).toBe(true);
  });

  it('late subscriber immediately receives current folded state (BehaviorSubject replay)', () => {
    const { source, getSubject } = makeFakeSource();
    const service = new ConversationStreamService(source);

    // First subscriber drives the fold to "Hello"
    service.getActiveStream$('A').subscribe(() => {});
    getSubject('A').next(messageChunkEvent('Hello'));

    // Late subscriber - gets the current BehaviorSubject value immediately, not initial state
    const lateEmissions: ActiveStreamState[] = [];
    const lateSub = service.getActiveStream$('A').subscribe((state) => lateEmissions.push(state));

    expect(lateEmissions).toHaveLength(1);
    expect(lateEmissions[0].activeExecution?.message).toBe('Hello');
    lateSub.unsubscribe();
  });

  it('isStreamActive is false initially, true during active execution, false after round_complete', () => {
    const { source, getSubject } = makeFakeSource();
    const service = new ConversationStreamService(source);

    // No stream yet - false
    expect(service.isStreamActive('A')).toBe(false);

    service.getActiveStream$('A').subscribe(() => {});
    // Stream exists but initial state has null activeExecution - still false
    expect(service.isStreamActive('A')).toBe(false);

    // message_chunk creates a non-null activeExecution
    getSubject('A').next(messageChunkEvent('text'));
    expect(service.isStreamActive('A')).toBe(true);

    // round_complete seals and nulls activeExecution
    getSubject('A').next(roundCompleteEvent('round-1'));
    expect(service.isStreamActive('A')).toBe(false);
  });

  it('tears down source subscription after notifyStreamEnded when no subscribers and execution is in-flight', () => {
    // maybeTeardown keeps the stream alive while (!ended && !isIdle).
    // Once ended=true, it tears down regardless of idle state.
    const { source, getSubject } = makeFakeSource();
    const service = new ConversationStreamService(source);

    // Subscribe, then push an event to make activeExecution non-null (not idle)
    const sub = service.getActiveStream$('Z').subscribe(() => {});
    getSubject('Z').next(messageChunkEvent('running'));

    // Unsubscribe - finalize fires maybeTeardown:
    //   state$.observed=false, ended=false, isIdle=false
    //   -> !ended && !isIdle = true -> keep alive
    sub.unsubscribe();
    expect(getSubject('Z').observed).toBe(true); // source still subscribed

    // notifyStreamEnded sets ended=true then calls maybeTeardown:
    //   state$.observed=false, ended=true -> teardown condition met
    service.notifyStreamEnded('Z');
    expect(getSubject('Z').observed).toBe(false); // source subscription torn down
  });

  it('re-subscribe after ended stream creates a fresh stream emitting initialActiveStreamState', () => {
    const { source, getSubject } = makeFakeSource();
    const service = new ConversationStreamService(source);

    // Create, run, then tear down
    const sub = service.getActiveStream$('X').subscribe(() => {});
    getSubject('X').next(messageChunkEvent('data')); // activeExecution non-null
    sub.unsubscribe(); // kept alive (not idle, not ended)
    service.notifyStreamEnded('X'); // tears down, deletes from streams map

    // Re-subscribe: ensure() finds nothing, creates a fresh stream
    const newEmissions: ActiveStreamState[] = [];
    const newSub = service.getActiveStream$('X').subscribe((state) => newEmissions.push(state));

    // Fresh BehaviorSubject starts at initialActiveStreamState
    expect(newEmissions).toHaveLength(1);
    expect(newEmissions[0]).toEqual(initialActiveStreamState);
    newSub.unsubscribe();
  });
});
