/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import dateMath from '@kbn/datemath';
import { evaluateKql } from './eval_kql';

const FAKE_NOW = new Date('2025-01-15T12:00:00.000Z');

describe('evaluateKql', () => {
  it('should throw an error for invalid KQL', () => {
    expect(() => evaluateKql('invalid "kql', {})).toThrowError();
  });

  describe('"is" expressions', () => {
    it('should return false when field refers to object in property', () => {
      const kql = 'user: "John Doe"';
      expect(evaluateKql(kql, { user: { name: 'Jane Doe' } })).toBe(false);
    });

    it('should correctly evaluate a simple "is" KQL expression', () => {
      const kql = 'status: active';
      expect(evaluateKql(kql, { status: 'active' })).toBe(true);
      expect(evaluateKql(kql, { status: 'inactive' })).toBe(false);
    });

    it('should correctly evaluate a simple "is" KQL expression when key access nested field', () => {
      const kql = 'user.info.name: "Joe Doe"';
      expect(evaluateKql(kql, { user: { info: { name: 'Joe Doe' } } })).toBe(true);
      expect(evaluateKql(kql, { user: { info: { name: 'Jane Doe' } } })).toBe(false);
    });

    it('should correctly evaluate a quoted value with dots in nested field path', () => {
      const kql = 'data.host.name: "admin-console.prod.001"';
      expect(
        evaluateKql(kql, {
          episode_status: 'recovering',
          data: { count: 2, host: { name: 'admin-console.prod.001' } },
        })
      ).toBe(true);
      expect(
        evaluateKql(kql, {
          episode_status: 'recovering',
          data: { count: 2, host: { name: 'other-host' } },
        })
      ).toBe(false);
    });

    it('should correctly evaluate a simple "is" KQL expression with boolean', () => {
      const kql = 'isActive: true';
      expect(evaluateKql(kql, { isActive: true })).toBe(true);
      expect(evaluateKql(kql, { isActive: false })).toBe(false);
    });

    it('should correctly evaluate a simple "is" KQL expression with number', () => {
      const kql = 'matchesCount: 2339';
      expect(evaluateKql(kql, { matchesCount: 2339 })).toBe(true);
      expect(evaluateKql(kql, { matchesCount: 0 })).toBe(false);
    });

    it('should treat array fields as multi-valued: term matches if any element matches', () => {
      const kql = 'tags: "prod"';
      expect(evaluateKql(kql, { tags: ['dev', 'prod'] })).toBe(true);
      expect(evaluateKql(kql, { tags: ['dev', 'staging'] })).toBe(false);
      expect(evaluateKql(kql, { tags: 'prod' })).toBe(true);
    });

    it('should match nested fields when value is an array', () => {
      const kql = 'event.category: "alerts" and event.labels: "demo"';
      expect(
        evaluateKql(kql, {
          event: { category: 'alerts', labels: ['example', 'demo'] },
        })
      ).toBe(true);
      expect(
        evaluateKql(kql, {
          event: { category: 'alerts', labels: ['example'] },
        })
      ).toBe(false);
    });

    it('should support array index access in property path', () => {
      const kql = 'users[0].name: "Alice"';
      expect(evaluateKql(kql, { users: [{ name: 'Alice' }, { name: 'Bob' }] })).toBe(true);
      expect(evaluateKql(kql, { users: [{ name: 'Charlie' }, { name: 'Bob' }] })).toBe(false);
    });

    it('should support array index access through dot', () => {
      const kql = 'users.0.name: "Alice"';
      expect(evaluateKql(kql, { users: [{ name: 'Alice' }, { name: 'Bob' }] })).toBe(true);
      expect(evaluateKql(kql, { users: [{ name: 'Charlie' }, { name: 'Bob' }] })).toBe(false);
    });

    // A field path whose intermediate segment resolves to a non-object (scalar,
    // null, or undefined) must evaluate to false, NOT throw. Traversing further
    // into such a value previously hit `'segment' in <non-object>`, which throws
    // `TypeError: Cannot use 'in' operator ...` and crashed the whole caller
    // (e.g. a workflow execution or an alerting matcher).
    describe('traversing through a non-object intermediate value', () => {
      it('should return false (not throw) when traversing into a string', () => {
        const kql = 'output.value: true';
        expect(() => evaluateKql(kql, { output: 'hello' })).not.toThrow();
        expect(evaluateKql(kql, { output: 'hello' })).toBe(false);
      });

      it('should return false (not throw) when traversing into a number', () => {
        const kql = 'output.value: true';
        expect(evaluateKql(kql, { output: 42 })).toBe(false);
      });

      it('should return false (not throw) when traversing into a boolean', () => {
        const kql = 'output.value: true';
        expect(evaluateKql(kql, { output: true })).toBe(false);
      });

      it('should return false (not throw) when an intermediate segment is undefined', () => {
        const kql = 'steps.x.output.field: "y"';
        expect(evaluateKql(kql, { steps: { x: {} } })).toBe(false);
      });

      it('should return false (not throw) when an intermediate segment is null', () => {
        const kql = 'steps.x.output.field: "y"';
        expect(evaluateKql(kql, { steps: { x: { output: null } } })).toBe(false);
      });

      it('should return false (not throw) for a deep path through a scalar in a range expression', () => {
        const kql = 'output.value.deeper > 5';
        expect(() => evaluateKql(kql, { output: 'hello' })).not.toThrow();
        expect(evaluateKql(kql, { output: 'hello' })).toBe(false);
      });
    });

    describe('range expressions', () => {
      it('should correctly evaluate a simple "range" KQL expression with number', () => {
        const kql = 'matchesCount >= 1000 and matchesCount <= 5000';
        expect(evaluateKql(kql, { matchesCount: 2339 })).toBe(true);
        expect(evaluateKql(kql, { matchesCount: 999 })).toBe(false);
        expect(evaluateKql(kql, { matchesCount: 5001 })).toBe(false);
      });

      it('should correctly evaluate a "less than or equal" KQL expression', () => {
        const kql = 'matchesCount <= 1000';
        expect(evaluateKql(kql, { matchesCount: 1000 })).toBe(true);
        expect(evaluateKql(kql, { matchesCount: 999 })).toBe(true);
        expect(evaluateKql(kql, { matchesCount: 1001 })).toBe(false);
      });

      it('should correctly evaluate a "greater than" KQL expression', () => {
        const kql = 'matchesCount > 1000';
        expect(evaluateKql(kql, { matchesCount: 1001 })).toBe(true);
        expect(evaluateKql(kql, { matchesCount: 1000 })).toBe(false);
        expect(evaluateKql(kql, { matchesCount: 999 })).toBe(false);
      });

      it('should correctly evaluate a "less than" KQL expression', () => {
        const kql = 'matchesCount < 1000';
        expect(evaluateKql(kql, { matchesCount: 999 })).toBe(true);
        expect(evaluateKql(kql, { matchesCount: 1000 })).toBe(false);
        expect(evaluateKql(kql, { matchesCount: 1001 })).toBe(false);
      });

      it('should match range if any array element satisfies the range', () => {
        const kql = 'scores >= 10';
        expect(evaluateKql(kql, { scores: [1, 5, 12] })).toBe(true);
        expect(evaluateKql(kql, { scores: [1, 5, 7] })).toBe(false);
        expect(evaluateKql(kql, { scores: [] })).toBe(false);
      });

      it('should return false when field refers to object in property', () => {
        const kql = 'user < 90';
        expect(evaluateKql(kql, { user: { name: 'Jane Doe' } })).toBe(false);
      });
    });

    describe('wildcard expressions', () => {
      it('should correctly evaluate when checking if field exists using wildcard', () => {
        const kql = 'matchesCount:*'; // TODO: Figure out how to do "exist" operation in KQL
        expect(evaluateKql(kql, { matchesCount: 2339 })).toBe(true);
        expect(evaluateKql(kql, { matchesCount: { someObject: 'foo' } })).toBe(true);
        expect(evaluateKql(kql, { matchesCount: undefined })).toBe(false);
        expect(evaluateKql(kql, { nothing: 0 })).toBe(false);
      });

      it('should evaluate term* wildcard correctly', () => {
        const kql = 'user.name: John*';
        expect(evaluateKql(kql, { user: { name: 'John Doe' } })).toBe(true);
        expect(evaluateKql(kql, { user: { name: 'Jane Doe' } })).toBe(false);
      });

      it('should evaluate wildcards against any string element in an array field', () => {
        const kql = 'tags: demo*';
        expect(evaluateKql(kql, { tags: ['x', 'demo-1'] })).toBe(true);
        expect(evaluateKql(kql, { tags: ['x', 'prod'] })).toBe(false);
      });

      it('should do anything', () => {
        const kql = 'user.info: *John*';
        expect(
          evaluateKql(kql, {
            user: {
              info: 'Lorem ipsum John Doe',
            },
          })
        ).toBe(true);
        expect(
          evaluateKql(kql, {
            user: {
              info: 'Lorem ipsum Jane Doe',
            },
          })
        ).toBe(false);
      });

      it('should match asterisk if quoted', () => {
        const kql = 'user.name:"John*"';
        expect(evaluateKql(kql, { user: { name: 'John*' } })).toBe(true);
        expect(evaluateKql(kql, { user: { name: 'John Doe' } })).toBe(false);
      });

      it('should evaluate *term wildcard correctly', () => {
        const kql = 'user.name: *Doe';
        expect(evaluateKql(kql, { user: { name: 'John Doe' } })).toBe(true);
        expect(evaluateKql(kql, { user: { name: 'John Smith' } })).toBe(false);
      });

      it('should evaluate *term* wildcard correctly', () => {
        const kql = 'txt: *psu*';
        expect(evaluateKql(kql, { txt: 'Lorem ipsum dolor' })).toBe(true);
        expect(evaluateKql(kql, { txt: 'Lorem ipsm dolor' })).toBe(false);
      });

      it('should evaluate a*c wildcard correctly', () => {
        const kql = 'user.name: J*n Doe';
        expect(evaluateKql(kql, { user: { name: 'John Doe' } })).toBe(true);
        expect(evaluateKql(kql, { user: { name: 'Jane Doe' } })).toBe(false);
      });

      it('should evaluate complex wildcard correctly', () => {
        const kql = 'user.name: J*n D*';
        expect(evaluateKql(kql, { user: { name: 'John Doe' } })).toBe(true);
        expect(evaluateKql(kql, { user: { name: 'Jane Doe' } })).toBe(false);
      });

      it('should run wildcard patterns against stringified numeric and boolean scalars', () => {
        expect(evaluateKql('n: foo*', { n: 5 })).toBe(false);
        expect(evaluateKql('n: foo*', { n: true })).toBe(false);
        expect(evaluateKql('n: 23*', { n: 2339 })).toBe(true);
        expect(evaluateKql('n: tr*', { n: true })).toBe(true);
      });
    });

    describe('array membership', () => {
      it('should match when array contains the value', () => {
        const kql = 'tags: "production"';
        expect(evaluateKql(kql, { tags: ['production', 'critical'] })).toBe(true);
      });

      it('should not match when array does not contain the value', () => {
        const kql = 'tags: "staging"';
        expect(evaluateKql(kql, { tags: ['production', 'critical'] })).toBe(false);
      });

      it('should match wildcard against array elements', () => {
        const kql = 'tags: prod*';
        expect(evaluateKql(kql, { tags: ['production', 'critical'] })).toBe(true);
      });

      it('should match existence wildcard against array', () => {
        const kql = 'tags: *';
        expect(evaluateKql(kql, { tags: ['production', 'critical'] })).toBe(true);
      });

      it('should not match when array is empty', () => {
        const kql = 'tags: "production"';
        expect(evaluateKql(kql, { tags: [] })).toBe(false);
      });
    });
  });

  describe('datemath expressions', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(FAKE_NOW);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('"is" expressions with datemath', () => {
      it('should match when context value equals "now" resolved to ISO string', () => {
        const kql = 'timestamp: now';
        const nowIso = dateMath.parse('now')!.toISOString();
        expect(evaluateKql(kql, { timestamp: nowIso })).toBe(true);
      });

      it('should match "now-1d" against the resolved date', () => {
        const kql = 'timestamp: now-1d';
        const resolved = dateMath.parse('now-1d')!.toISOString();
        expect(evaluateKql(kql, { timestamp: resolved })).toBe(true);
        expect(evaluateKql(kql, { timestamp: '2020-01-01T00:00:00.000Z' })).toBe(false);
      });

      it('should match datemath with || anchor syntax', () => {
        const kql = 'timestamp: "2025-01-01T00:00:00.000Z||+1d"';
        const resolved = dateMath.parse('2025-01-01T00:00:00.000Z||+1d')!.toISOString();
        expect(evaluateKql(kql, { timestamp: resolved })).toBe(true);
        expect(evaluateKql(kql, { timestamp: '2025-01-01T00:00:00.000Z' })).toBe(false);
      });

      it('should match "now+1h" against the resolved date', () => {
        const kql = 'timestamp: now+1h';
        const resolved = dateMath.parse('now+1h')!.toISOString();
        expect(evaluateKql(kql, { timestamp: resolved })).toBe(true);
        expect(evaluateKql(kql, { timestamp: '2020-01-01T00:00:00.000Z' })).toBe(false);
      });

      it('should match "now/d" with rounding', () => {
        const kql = 'timestamp: now/d';
        const resolved = dateMath.parse('now/d')!.toISOString();
        expect(evaluateKql(kql, { timestamp: resolved })).toBe(true);
        expect(evaluateKql(kql, { timestamp: '2020-01-01T00:00:00.000Z' })).toBe(false);
      });

      it('should match datemath against any element in an array field', () => {
        const kql = 'timestamps: now-1d';
        const resolved = dateMath.parse('now-1d')!.toISOString();
        expect(evaluateKql(kql, { timestamps: ['2020-01-01T00:00:00.000Z', resolved] })).toBe(true);
        expect(
          evaluateKql(kql, { timestamps: ['2020-01-01T00:00:00.000Z', '2021-06-01T00:00:00.000Z'] })
        ).toBe(false);
      });
    });

    describe('range expressions with datemath', () => {
      it('should evaluate >= with datemath on the right side', () => {
        const kql = 'timestamp >= now-7d';
        // now is 2025-01-15T12:00:00Z, so now-7d is 2025-01-08T12:00:00Z
        expect(evaluateKql(kql, { timestamp: '2025-01-10T00:00:00.000Z' })).toBe(true);
        expect(evaluateKql(kql, { timestamp: '2025-01-01T00:00:00.000Z' })).toBe(false);
      });

      it('should not evaluate >= with datemath on the left side', () => {
        const kql = 'now-7d >= timestamp';
        // now is 2025-01-15T12:00:00Z, so now-7d is 2025-01-08T12:00:00Z
        expect(evaluateKql(kql, { timestamp: '2025-01-01T00:00:00.000Z' })).toBe(false);
      });

      it('should evaluate < with datemath on the right side', () => {
        const kql = 'timestamp < now';
        expect(evaluateKql(kql, { timestamp: '2025-01-14T00:00:00.000Z' })).toBe(true);
        expect(evaluateKql(kql, { timestamp: '2025-01-16T00:00:00.000Z' })).toBe(false);
      });

      it('should evaluate range between two datemath expressions', () => {
        const kql = 'timestamp >= now-7d and timestamp <= now';
        expect(evaluateKql(kql, { timestamp: '2025-01-10T00:00:00.000Z' })).toBe(true);
        expect(evaluateKql(kql, { timestamp: '2025-01-01T00:00:00.000Z' })).toBe(false);
        expect(evaluateKql(kql, { timestamp: '2025-01-16T00:00:00.000Z' })).toBe(false);
      });

      it('should evaluate range with datemath expressions with rounding', () => {
        const baseKql = 'timestamp >= now';
        expect(evaluateKql(`${baseKql}/d`, { timestamp: '2025-01-20T00:00:00.000Z' })).toBe(true);
        expect(evaluateKql(`${baseKql}-7d/d`, { timestamp: '2025-01-10T00:00:00.000Z' })).toBe(
          true
        );
      });

      it('should evaluate > with datemath on the right side', () => {
        const kql = 'timestamp > now-7d';
        // now-7d is 2025-01-08T12:00:00Z
        expect(evaluateKql(kql, { timestamp: '2025-01-09T00:00:00.000Z' })).toBe(true);
        expect(evaluateKql(kql, { timestamp: dateMath.parse('now-7d')!.toISOString() })).toBe(
          false
        );
      });

      it('should evaluate <= with datemath on the right side', () => {
        const kql = 'timestamp <= now';
        const nowIso = dateMath.parse('now')!.toISOString();
        expect(evaluateKql(kql, { timestamp: nowIso })).toBe(true);
        expect(evaluateKql(kql, { timestamp: '2025-01-14T00:00:00.000Z' })).toBe(true);
        expect(evaluateKql(kql, { timestamp: '2025-01-16T00:00:00.000Z' })).toBe(false);
      });

      it('should match range with datemath against any element in an array field', () => {
        const kql = 'timestamps >= now-7d';
        // now-7d is 2025-01-08T12:00:00Z
        expect(
          evaluateKql(kql, { timestamps: ['2025-01-01T00:00:00.000Z', '2025-01-10T00:00:00.000Z'] })
        ).toBe(true);
        expect(
          evaluateKql(kql, { timestamps: ['2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z'] })
        ).toBe(false);
      });
    });

    describe('fallback for non-datemath strings', () => {
      it('should still compare plain strings normally', () => {
        const kql = 'status: active';
        expect(evaluateKql(kql, { status: 'active' })).toBe(true);
        expect(evaluateKql(kql, { status: 'inactive' })).toBe(false);
      });

      it('should treat invalid datemath starting with "now" as raw string', () => {
        // "now-invalidunit" is not a valid datemath expression, should fall back to raw string
        const kql = 'label: now-invalidunit';
        expect(evaluateKql(kql, { label: 'now-invalidunit' })).toBe(true);
        expect(evaluateKql(kql, { label: 'something-else' })).toBe(false);
      });

      it('should not parse ISO date strings as datemath', () => {
        // Plain ISO strings without || should remain as raw strings
        const kql = 'date: "2025-01-15T12:00:00.000Z"';
        expect(evaluateKql(kql, { date: '2025-01-15T12:00:00.000Z' })).toBe(true);
        expect(evaluateKql(kql, { date: '2025-01-16T00:00:00.000Z' })).toBe(false);
      });
    });
  });

  describe('logical expressions', () => {
    it('should evaluate AND expressions correctly', () => {
      const kql = 'status: active and isActive: true';
      expect(evaluateKql(kql, { status: 'active', isActive: true })).toBe(true);
      expect(evaluateKql(kql, { status: 'inactive', isActive: true })).toBe(false);
    });

    it('should evaluate OR expressions correctly', () => {
      const kql = 'status: active or status: inactive';
      expect(evaluateKql(kql, { status: 'inactive' })).toBe(true);
      expect(evaluateKql(kql, { status: 'pending' })).toBe(false);
    });

    it('should evaluate NOT expressions correctly', () => {
      const kql = 'not status: inactive';
      expect(evaluateKql(kql, { status: 'active' })).toBe(true);
      expect(evaluateKql(kql, { status: 'inactive' })).toBe(false);
    });

    it('should evaluate complex expressions with AND, OR, and NOT', () => {
      const kql = 'status: active and (isActive: true or isActive: false)';
      expect(evaluateKql(kql, { status: 'active', isActive: true })).toBe(true);
      expect(evaluateKql(kql, { status: 'active', isActive: false })).toBe(true);
      expect(evaluateKql(kql, { status: 'inactive', isActive: true })).toBe(false);
    });
  });
});
