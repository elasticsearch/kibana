/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { configSchema } from './config';

describe('alerting_v2 config schema', () => {
  describe('rules.minimumScheduleInterval', () => {
    it('defaults to 1m', () => {
      const config = configSchema.validate({});
      expect(config.rules.minimumScheduleInterval).toBe('1m');
    });

    it('accepts a value between the floor and the ceiling', () => {
      expect(
        configSchema.validate({ rules: { minimumScheduleInterval: '12h' } }).rules
          .minimumScheduleInterval
      ).toBe('12h');
    });

    it('accepts the 5s floor used by functional tests', () => {
      expect(
        configSchema.validate({ rules: { minimumScheduleInterval: '5s' } }).rules
          .minimumScheduleInterval
      ).toBe('5s');
    });

    it('rejects a malformed duration', () => {
      expect(() =>
        configSchema.validate({ rules: { minimumScheduleInterval: 'nonsense' } })
      ).toThrow(/Invalid duration/);
    });

    it('rejects a value below the 5s floor', () => {
      expect(() => configSchema.validate({ rules: { minimumScheduleInterval: '1s' } })).toThrow(
        /cannot be less than 5s/
      );
    });

    it('rejects a value above the 30d ceiling', () => {
      expect(() => configSchema.validate({ rules: { minimumScheduleInterval: '31d' } })).toThrow(
        /cannot exceed 30d/
      );
    });
  });

  describe('rules.maxScheduledPerMinute', () => {
    it('defaults to 400', () => {
      const config = configSchema.validate({});
      expect(config.rules.maxScheduledPerMinute).toBe(400);
    });

    it('rejects negative values', () => {
      expect(() => configSchema.validate({ rules: { maxScheduledPerMinute: -1 } })).toThrow();
    });

    it('rejects values above 32000', () => {
      expect(() => configSchema.validate({ rules: { maxScheduledPerMinute: 32001 } })).toThrow();
    });
  });
});
