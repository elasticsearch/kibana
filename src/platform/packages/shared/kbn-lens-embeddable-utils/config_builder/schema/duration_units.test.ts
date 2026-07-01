/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { dslDurationFormatSchema, esqlDurationFormatSchema } from './duration_units';

describe('Duration unit schemas', () => {
  describe('dslDurationFormatSchema', () => {
    it('validates fine-grained DSL input units', () => {
      const input = {
        type: 'duration' as const,
        from: 'us' as const,
        to: 'humanize' as const,
      };

      expect(dslDurationFormatSchema.validate(input)).toEqual(input);
    });

    it('rejects long-form unit names', () => {
      const input = {
        type: 'duration' as const,
        from: 'seconds',
        to: 'humanize',
      };

      expect(() => dslDurationFormatSchema.validate(input)).toThrow();
    });

    it('rejects friendly strategies as input units', () => {
      const input = {
        type: 'duration' as const,
        from: 'humanize',
        to: 's',
      };

      expect(() => dslDurationFormatSchema.validate(input)).toThrow();
    });
  });

  describe('esqlDurationFormatSchema', () => {
    it('validates ES|QL input units', () => {
      const input = {
        type: 'duration' as const,
        from: 'mo' as const,
        to: 'humanizePrecise' as const,
      };

      expect(esqlDurationFormatSchema.validate(input)).toEqual(input);
    });

    it('rejects fine-grained units not supported by ES|QL', () => {
      const input = {
        type: 'duration' as const,
        from: 'us',
        to: 'ms',
      };

      expect(() => esqlDurationFormatSchema.validate(input)).toThrow();
    });
  });
});
