/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { notificationSchema } from './notification_schema';
import type { Notification } from './types';

const validNotification: Notification = {
  '@timestamp': '2026-06-17T00:00:00.000Z',
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
};

describe('notificationSchema', () => {
  it('accepts a valid notification', () => {
    expect(notificationSchema.parse(validNotification)).toEqual(validNotification);
  });

  it.each(['@timestamp', 'event_timestamp'] as const)('rejects a non-ISO %s', (field) => {
    expect(() =>
      notificationSchema.parse({ ...validNotification, [field]: 'not-a-date' })
    ).toThrow();
  });

  it.each(['notification_id', 'type', 'title', 'description', 'source_app_id'] as const)(
    'rejects an empty %s',
    (field) => {
      expect(() => notificationSchema.parse({ ...validNotification, [field]: '' })).toThrow();
    }
  );

  it.each([
    '@timestamp',
    'notification_id',
    'event_timestamp',
    'type',
    'title',
    'description',
    'source_app_id',
  ] as const)('requires %s', (field) => {
    const { [field]: _omitted, ...rest } = validNotification;
    expect(() => notificationSchema.parse(rest)).toThrow();
  });

  it('rejects unknown top-level fields (strict)', () => {
    expect(() => notificationSchema.parse({ ...validNotification, unexpected: 'nope' })).toThrow();
  });

  describe('severity', () => {
    it.each(['info', 'warning', 'error', 'critical'] as const)('accepts %s', (severity) => {
      expect(notificationSchema.parse({ ...validNotification, severity })).toEqual({
        ...validNotification,
        severity,
      });
    });

    it('is optional and defaults to info when omitted', () => {
      const { severity: _severity, ...withoutSeverity } = validNotification;
      expect(notificationSchema.parse(withoutSeverity)).toEqual({
        ...withoutSeverity,
        severity: 'info',
      });
    });

    it('rejects an unknown severity', () => {
      expect(() => notificationSchema.parse({ ...validNotification, severity: 'fatal' })).toThrow();
    });
  });

  describe('cta', () => {
    it('is optional', () => {
      const { cta: _cta, ...withoutCta } = validNotification;
      expect(notificationSchema.parse(withoutCta)).toEqual(withoutCta);
    });

    it.each(['link', 'linkText'] as const)('rejects an empty %s', (field) => {
      expect(() =>
        notificationSchema.parse({
          ...validNotification,
          cta: { ...validNotification.cta, [field]: '' },
        })
      ).toThrow();
    });

    it.each(['link', 'linkText'] as const)('rejects a %s longer than 200 characters', (field) => {
      expect(() =>
        notificationSchema.parse({
          ...validNotification,
          cta: { ...validNotification.cta, [field]: 'x'.repeat(201) },
        })
      ).toThrow();
    });

    it.each(['link', 'linkText'] as const)('requires %s', (field) => {
      const { [field]: _omitted, ...partialCta } = validNotification.cta!;
      expect(() => notificationSchema.parse({ ...validNotification, cta: partialCta })).toThrow();
    });

    it('rejects unknown cta fields (strict)', () => {
      expect(() =>
        notificationSchema.parse({
          ...validNotification,
          cta: { ...validNotification.cta, unexpected: 'nope' },
        })
      ).toThrow();
    });

    it('accepts an internal path link', () => {
      const cta = { link: '/app/ml/inference', linkText: 'View' };
      expect(notificationSchema.parse({ ...validNotification, cta }).cta).toEqual(cta);
    });

    it.each([
      'http://evil.com',
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      'app/ml/inference',
    ])('rejects a non-internal link (%s)', (link) => {
      expect(() =>
        notificationSchema.parse({
          ...validNotification,
          cta: { ...validNotification.cta, link },
        })
      ).toThrow();
    });
  });
});
