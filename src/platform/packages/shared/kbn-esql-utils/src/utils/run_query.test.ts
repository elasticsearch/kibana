/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { ESQLVariableType, type ESQLControlVariable } from '@kbn/esql-types';
import { getStartEndParams, getNamedParams } from './run_query';

describe('run query helpers', () => {
  describe('getStartEndParams', () => {
    it('should return an empty array if there are no time params', () => {
      const time = { from: 'now-15m', to: 'now' };
      const query = 'FROM foo';
      const params = getStartEndParams(query, time);
      expect(params).toEqual([]);
    });

    it('should return an array with the start param if exists at the query', () => {
      const time = { from: 'Jul 5, 2024 @ 08:03:56.849', to: 'Jul 5, 2024 @ 10:03:56.849' };
      const query = 'FROM foo | where time > ?_tstart';
      const params = getStartEndParams(query, time);
      expect(params).toHaveLength(1);
      expect(params[0]).toHaveProperty('_tstart');
    });

    it('should return an array with the end param if exists at the query', () => {
      const time = { from: 'Jul 5, 2024 @ 08:03:56.849', to: 'Jul 5, 2024 @ 10:03:56.849' };
      const query = 'FROM foo | where time < ?_tend';
      const params = getStartEndParams(query, time);
      expect(params).toHaveLength(1);
      expect(params[0]).toHaveProperty('_tend');
    });

    it('should return an array with the end and start params if exist at the query', () => {
      const time = { from: 'Jul 5, 2024 @ 08:03:56.849', to: 'Jul 5, 2024 @ 10:03:56.849' };
      const query = 'FROM foo | where time < ?_tend amd time > ?_tstart';
      const params = getStartEndParams(query, time);
      expect(params).toHaveLength(2);
      expect(params[0]).toHaveProperty('_tstart');
      expect(params[1]).toHaveProperty('_tend');
    });
  });

  describe('getNamedParams', () => {
    it('should return an empty array if there are no params', () => {
      const time = { from: 'now-15m', to: 'now' };
      const query = 'FROM foo';
      const variables: ESQLControlVariable[] = [];
      const params = getNamedParams(query, time, variables);
      expect(params).toEqual([]);
    });

    it('should return the time params if given', () => {
      const time = { from: 'Jul 5, 2024 @ 08:03:56.849', to: 'Jul 5, 2024 @ 10:03:56.849' };
      const query = 'FROM foo | where time < ?_tend amd time > ?_tstart';
      const variables: ESQLControlVariable[] = [];
      const params = getNamedParams(query, time, variables);
      expect(params).toHaveLength(2);
      expect(params[0]).toHaveProperty('_tstart');
      expect(params[1]).toHaveProperty('_tend');
    });

    it('should return only the variables used in the query', () => {
      const time = { from: 'Jul 5, 2024 @ 08:03:56.849', to: 'Jul 5, 2024 @ 10:03:56.849' };
      const query = 'FROM foo | KEEP ??field | WHERE agent.name == ?agent_name';
      const variables = [
        {
          key: 'field',
          value: 'clientip',
          type: ESQLVariableType.FIELDS,
        },
        {
          key: 'interval',
          value: '5 minutes',
          type: ESQLVariableType.TIME_LITERAL,
        },
        {
          key: 'agent_name',
          value: 'go',
          type: ESQLVariableType.VALUES,
        },
        {
          key: 'function',
          value: 'count',
          type: ESQLVariableType.FUNCTIONS,
        },
      ];
      const params = getNamedParams(query, time, variables);
      expect(params).toStrictEqual([
        {
          field: 'clientip',
        },
        {
          agent_name: 'go',
        },
      ]);
    });

    it('should return only the variables used in the query, plus time params', () => {
      const time = { from: 'Jul 5, 2024 @ 08:03:56.849', to: 'Jul 5, 2024 @ 10:03:56.849' };
      const query =
        'FROM foo | KEEP ??field | WHERE agent.name == ?agent_name AND time < ?_tend AND time > ?_tstart';
      const variables = [
        {
          key: 'field',
          value: 'clientip',
          type: ESQLVariableType.FIELDS,
        },
        {
          key: 'interval',
          value: '5 minutes',
          type: ESQLVariableType.TIME_LITERAL,
        },
        {
          key: 'agent_name',
          value: 'go',
          type: ESQLVariableType.VALUES,
        },
        {
          key: 'function',
          value: 'count',
          type: ESQLVariableType.FUNCTIONS,
        },
      ];
      const params = getNamedParams(query, time, variables);
      expect(params).toHaveLength(4);
      expect(params[0]).toHaveProperty('_tstart');
      expect(params[1]).toHaveProperty('_tend');
      expect(params[2]).toStrictEqual({
        field: 'clientip',
      });
      expect(params[3]).toStrictEqual({
        agent_name: 'go',
      });
    });
  });

  it('should work correctly with datemath ranges', () => {
    const time = { from: 'now/d', to: 'now/d' };
    const query = 'FROM foo | where time < ?_tend amd time > ?_tstart';
    const params = getStartEndParams(query, time);
    expect(params).toHaveLength(2);
    expect(params[0]).toHaveProperty('_tstart');
    expect(params[1]).toHaveProperty('_tend');
    expect(params[0]._tstart).not.toEqual(params[1]._tend);
  });
});
