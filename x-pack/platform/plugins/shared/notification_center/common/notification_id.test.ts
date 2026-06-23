/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildEventNotificationId, buildStaticStateNotificationId } from './notification_id';

describe('buildStaticStateNotificationId', () => {
  it('joins producer, entity and state as <producer>:<entity>:<state>', () => {
    expect(
      buildStaticStateNotificationId({
        producer: 'inference',
        entity: 'my-endpoint',
        state: 'deprecated',
      })
    ).toBe('inference:my-endpoint:deprecated');
  });

  it('is deterministic: same parts produce the same id (collapse-friendly)', () => {
    const parts = { producer: 'inference', entity: 'my-endpoint', state: 'deprecated' };
    expect(buildStaticStateNotificationId(parts)).toBe(buildStaticStateNotificationId(parts));
  });

  it('produces a different id when the state changes', () => {
    expect(
      buildStaticStateNotificationId({
        producer: 'inference',
        entity: 'my-endpoint',
        state: 'deprecated',
      })
    ).not.toBe(
      buildStaticStateNotificationId({
        producer: 'inference',
        entity: 'my-endpoint',
        state: 'available',
      })
    );
  });

  it('rejects empty segments', () => {
    expect(() =>
      buildStaticStateNotificationId({ producer: 'inference', entity: '', state: 'deprecated' })
    ).toThrow(/non-empty/);
  });

  it('rejects segments containing the separator', () => {
    expect(() =>
      buildStaticStateNotificationId({ producer: 'inference', entity: 'a:b', state: 'deprecated' })
    ).toThrow(/separator/);
  });
});

describe('buildEventNotificationId', () => {
  it('joins producer, event and epochMs as <producer>:<event>:<epochMs>', () => {
    expect(
      buildEventNotificationId({
        producer: 'autoOps',
        event: 'memoryLimit',
        epochMs: 1750118400000,
      })
    ).toBe('autoOps:memoryLimit:1750118400000');
  });

  it('produces a unique id per occurrence via the epochMs segment', () => {
    expect(
      buildEventNotificationId({
        producer: 'autoOps',
        event: 'memoryLimit',
        epochMs: 1750118400000,
      })
    ).not.toBe(
      buildEventNotificationId({
        producer: 'autoOps',
        event: 'memoryLimit',
        epochMs: 1750118401000,
      })
    );
  });

  it('rejects empty segments', () => {
    expect(() =>
      buildEventNotificationId({ producer: 'autoOps', event: '', epochMs: 1750118400000 })
    ).toThrow(/non-empty/);
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite epochMs (%s)', (epochMs) => {
    expect(() =>
      buildEventNotificationId({ producer: 'autoOps', event: 'memoryLimit', epochMs })
    ).toThrow(/finite/);
  });

  it('rejects segments containing the separator', () => {
    expect(() =>
      buildEventNotificationId({
        producer: 'auto:Ops',
        event: 'memoryLimit',
        epochMs: 1750118400000,
      })
    ).toThrow(/separator/);
  });
});
