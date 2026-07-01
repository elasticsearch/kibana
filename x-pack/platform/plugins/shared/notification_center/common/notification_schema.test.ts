/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { notificationWriteSchema, notificationReadSchema } from './notification_schema';
import type { Notification, NotificationInput, NotificationDocument } from './types';

/**
 * A producer submission: no `@timestamp` (the Notification Center stamps that on
 * ingest). `satisfies` keeps the literal types (so `severity`/`cta` stay present)
 * while still checking the shape against {@link NotificationInput}.
 */
const validInput = {
  notification_id: 'inference:my-endpoint:deprecated',
  event_timestamp: '2026-06-17T00:00:00.000Z',
  type: 'modelStatus',
  title: 'Inference endpoint deprecated',
  description: 'Your inference endpoint is deprecated and will stop working in a future version.',
  source_app_id: 'inference',
  severity: 'warning',
  cta: {
    link: '/app/management/ml/inference',
    linkText: 'View inference endpoints',
  },
} satisfies NotificationInput;

/** The same notification as stored in the data stream, with the ingest `@timestamp`. */
const validDocument: Notification = {
  '@timestamp': '2026-06-17T00:00:00.123Z',
  ...validInput,
};

describe('notificationWriteSchema', () => {
  it('accepts a valid notification', () => {
    expect(notificationWriteSchema.parse(validInput)).toEqual(validInput);
  });

  it('rejects @timestamp (stamped by the Notification Center, not the producer)', () => {
    expect(() => notificationWriteSchema.parse(validDocument)).toThrow();
  });

  it('rejects a non-ISO event_timestamp', () => {
    expect(() =>
      notificationWriteSchema.parse({ ...validInput, event_timestamp: 'not-a-date' })
    ).toThrow();
  });

  it.each(['notification_id', 'type', 'title', 'description', 'source_app_id'] as const)(
    'rejects an empty %s',
    (field) => {
      expect(() => notificationWriteSchema.parse({ ...validInput, [field]: '' })).toThrow();
    }
  );

  it.each([
    'notification_id',
    'event_timestamp',
    'type',
    'title',
    'description',
    'source_app_id',
  ] as const)('requires %s', (field) => {
    const { [field]: _omitted, ...rest } = validInput;
    expect(() => notificationWriteSchema.parse(rest)).toThrow();
  });

  it('rejects unknown top-level fields (strict)', () => {
    expect(() => notificationWriteSchema.parse({ ...validInput, unexpected: 'nope' })).toThrow();
  });

  describe('severity', () => {
    it.each(['info', 'warning', 'error', 'critical'] as const)('accepts %s', (severity) => {
      expect(notificationWriteSchema.parse({ ...validInput, severity })).toEqual({
        ...validInput,
        severity,
      });
    });

    it('is optional and defaults to info when omitted', () => {
      const { severity: _severity, ...withoutSeverity } = validInput;
      expect(notificationWriteSchema.parse(withoutSeverity)).toEqual({
        ...withoutSeverity,
        severity: 'info',
      });
    });

    it('rejects an unknown severity', () => {
      expect(() => notificationWriteSchema.parse({ ...validInput, severity: 'fatal' })).toThrow();
    });
  });

  describe('cta', () => {
    it('is optional', () => {
      const { cta: _cta, ...withoutCta } = validInput;
      expect(notificationWriteSchema.parse(withoutCta)).toEqual(withoutCta);
    });

    it.each(['link', 'linkText'] as const)('rejects an empty %s', (field) => {
      expect(() =>
        notificationWriteSchema.parse({
          ...validInput,
          cta: { ...validInput.cta, [field]: '' },
        })
      ).toThrow();
    });

    it.each(['link', 'linkText'] as const)('rejects a %s longer than 200 characters', (field) => {
      expect(() =>
        notificationWriteSchema.parse({
          ...validInput,
          cta: { ...validInput.cta, [field]: 'x'.repeat(201) },
        })
      ).toThrow();
    });

    it.each(['link', 'linkText'] as const)('requires %s', (field) => {
      const { [field]: _omitted, ...partialCta } = validInput.cta;
      expect(() => notificationWriteSchema.parse({ ...validInput, cta: partialCta })).toThrow();
    });

    it('rejects unknown cta fields (strict)', () => {
      expect(() =>
        notificationWriteSchema.parse({
          ...validInput,
          cta: { ...validInput.cta, unexpected: 'nope' },
        })
      ).toThrow();
    });

    it('accepts an internal path link', () => {
      const cta = { link: '/app/ml/inference', linkText: 'View' };
      expect(notificationWriteSchema.parse({ ...validInput, cta }).cta).toEqual(cta);
    });

    it.each([
      'http://evil.com',
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      'app/ml/inference',
    ])('rejects a non-internal link (%s)', (link) => {
      expect(() =>
        notificationWriteSchema.parse({
          ...validInput,
          cta: { ...validInput.cta, link },
        })
      ).toThrow();
    });
  });
});

describe('notificationReadSchema', () => {
  it('accepts a valid stored document', () => {
    expect(notificationReadSchema.parse(validDocument)).toEqual(validDocument);
  });

  it('preserves unknown top-level fields written by a newer node (loose)', () => {
    const fromNewerNode = { ...validDocument, future_field: 'kept' };
    expect(notificationReadSchema.parse(fromNewerNode)).toEqual(fromNewerNode);
  });

  it('requires @timestamp', () => {
    const { '@timestamp': _omitted, ...withoutTimestamp } = validDocument;
    expect(() => notificationReadSchema.parse(withoutTimestamp)).toThrow();
  });

  it.each(['@timestamp', 'event_timestamp'] as const)('still rejects a non-ISO %s', (field) => {
    expect(() =>
      notificationReadSchema.parse({ ...validDocument, [field]: 'not-a-date' })
    ).toThrow();
  });

  describe('severity', () => {
    it('falls back to info when an older node reads an unrecognised severity', () => {
      expect(notificationReadSchema.parse({ ...validDocument, severity: 'fatal' })).toEqual({
        ...validDocument,
        severity: 'info',
      });
    });

    it('defaults to info when omitted', () => {
      const { severity: _severity, ...withoutSeverity } = validDocument;
      expect(notificationReadSchema.parse(withoutSeverity)).toEqual({
        ...withoutSeverity,
        severity: 'info',
      });
    });
  });
});

describe('NotificationDocument typing', () => {
  // These assertions are enforced at type-check time; the runtime body only
  // exists so the compiler sees the types exercised. They guard the invariant
  // that `submit()` cannot index a document without stamping `@timestamp`.
  it('requires @timestamp that a producer NotificationInput does not carry', () => {
    const stamped: NotificationDocument = {
      ...notificationWriteSchema.parse(validInput),
      '@timestamp': '2026-06-17T00:00:00.123Z',
    };
    expect(stamped['@timestamp']).toBeDefined();

    // @ts-expect-error — a validated write payload alone is not a document: `@timestamp` is missing.
    const unstamped: NotificationDocument = notificationWriteSchema.parse(validInput);
    expect(unstamped).toBeDefined();
  });
});
