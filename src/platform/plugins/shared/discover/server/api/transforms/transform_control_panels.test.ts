/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ESQL_CONTROL } from '@kbn/controls-constants';
import { transformControlPanelsIn, transformControlPanelsOut } from './transform_control_panels';

describe('control panel transforms', () => {
  describe('transformControlPanelsOut', () => {
    it('maps stored controlGroupJson to API control_panels and normalizes legacy type', () => {
      const result = transformControlPanelsOut(
        JSON.stringify({
          c: {
            order: 0,
            type: 'optionsListControl',
            data_view_id: 'logs-*',
            field_name: 'host.name',
          },
          b: {
            order: 2,
            type: 'esqlControl',
            width: 'small',
            grow: false,
            control_type: 'STATIC_VALUES',
            variable_name: 'bar',
            variable_type: 'values',
            available_options: ['a', 'b'],
            selected_options: ['b'],
            single_select: true,
          },
          a: {
            order: 1,
            type: ESQL_CONTROL,
            width: 'medium',
            grow: true,
            control_type: 'STATIC_VALUES',
            variable_name: 'foo',
            variable_type: 'values',
            available_options: ['x', 'y'],
            selected_options: ['x'],
            single_select: true,
          },
        })
      );

      expect(result).toEqual([
        {
          id: 'c',
          type: 'options_list_control',
          width: 'medium',
          grow: false,
          config: {
            data_view_id: 'logs-*',
            field_name: 'host.name',
            use_global_filters: true,
            ignore_validations: false,
            exclude: false,
            exists_selected: false,
            run_past_timeout: false,
            selected_options: [],
            single_select: false,
            search_technique: 'wildcard',
            sort: {
              by: '_count',
              direction: 'desc',
            },
          },
        },
        {
          id: 'a',
          type: ESQL_CONTROL,
          width: 'medium',
          grow: true,
          config: {
            control_type: 'STATIC_VALUES',
            variable_name: 'foo',
            variable_type: 'values',
            available_options: ['x', 'y'],
            selected_options: ['x'],
            single_select: true,
          },
        },
        {
          id: 'b',
          type: ESQL_CONTROL,
          width: 'small',
          grow: false,
          config: {
            control_type: 'STATIC_VALUES',
            variable_name: 'bar',
            variable_type: 'values',
            available_options: ['a', 'b'],
            selected_options: ['b'],
            single_select: true,
          },
        },
      ]);
    });

    it('throws when control JSON is invalid', () => {
      expect(() => transformControlPanelsOut('not-json')).toThrow(
        'controlGroupJson is not valid JSON'
      );
      expect(transformControlPanelsOut(undefined)).toBeUndefined();
    });

    it('throws when stored panel entries are malformed', () => {
      expect(() =>
        transformControlPanelsOut(
          JSON.stringify({
            bad: null,
            good: {
              order: 0,
              type: 'esqlControl',
              control_type: 'STATIC_VALUES',
              variable_name: 'foo',
              variable_type: 'values',
              available_options: ['a'],
              selected_options: ['a'],
              single_select: true,
            },
          })
        )
      ).toThrow('controlGroupJson must be a JSON object');
    });
  });

  describe('transformControlPanelsIn', () => {
    it('maps API control_panels to stored flattened controlGroupJson', () => {
      const result = transformControlPanelsIn([
        {
          id: 'control-1',
          type: ESQL_CONTROL,
          width: 'small',
          grow: true,
          config: {
            control_type: 'STATIC_VALUES',
            variable_name: 'foo',
            variable_type: 'values',
            available_options: ['x', 'y'],
            selected_options: ['y'],
            single_select: true,
          },
        },
      ]);

      expect(result).toBe(
        JSON.stringify({
          'control-1': {
            order: 0,
            type: ESQL_CONTROL,
            width: 'small',
            grow: true,
            control_type: 'STATIC_VALUES',
            variable_name: 'foo',
            variable_type: 'values',
            available_options: ['x', 'y'],
            selected_options: ['y'],
            single_select: true,
          },
        })
      );
    });

    it('returns undefined for empty control arrays', () => {
      expect(transformControlPanelsIn(undefined)).toBeUndefined();
      expect(transformControlPanelsIn([])).toBeUndefined();
    });
  });
});
