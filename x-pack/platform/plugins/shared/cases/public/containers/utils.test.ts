/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  valueToUpdateIsSettings,
  valueToUpdateIsStatus,
  createUpdateSuccessToaster,
  constructAssigneesFilter,
  constructReportersFilter,
  constructCustomFieldsFilter,
  getIncrementalIdSearchOverrides,
} from './utils';

import type { CaseUI } from './types';
import { CustomFieldTypes } from '../../common/types/domain';

const caseBeforeUpdate = {
  comments: [
    {
      type: 'alert',
    },
  ],
  settings: {
    syncAlerts: true,
    extractObservables: false,
  },
} as CaseUI;

const caseAfterUpdate = { title: 'My case' } as CaseUI;

describe('utils', () => {
  describe('valueToUpdateIsSettings', () => {
    it('returns true if key is settings', () => {
      expect(valueToUpdateIsSettings('settings', 'value')).toBe(true);
    });

    it('returns false if key is NOT settings', () => {
      expect(valueToUpdateIsSettings('tags', 'value')).toBe(false);
    });
  });

  describe('valueToUpdateIsStatus', () => {
    it('returns true if key is status', () => {
      expect(valueToUpdateIsStatus('status', 'value')).toBe(true);
    });

    it('returns false if key is NOT status', () => {
      expect(valueToUpdateIsStatus('tags', 'value')).toBe(false);
    });
  });

  describe('createUpdateSuccessToaster', () => {
    it('creates the correct toast when sync alerts is turned on and case has alerts', () => {
      // We remove the id as is randomly generated
      const toast = createUpdateSuccessToaster(
        { ...caseBeforeUpdate, settings: { syncAlerts: false, extractObservables: false } },
        caseAfterUpdate,
        'settings',
        {
          syncAlerts: true,
          extractObservables: false,
        }
      );

      expect(toast).toEqual({
        title: 'Detections in "My case" have been synced',
        className: 'eui-textBreakWord',
      });
    });

    it('creates the correct toast when extract observables is turned on', () => {
      const toast = createUpdateSuccessToaster(
        { ...caseBeforeUpdate, settings: { syncAlerts: false, extractObservables: false } },
        caseAfterUpdate,
        'settings',
        {
          syncAlerts: false,
          extractObservables: true,
        }
      );

      expect(toast).toEqual({
        title: 'Auto-extract observables setting in "My case" have been updated',
        className: 'eui-textBreakWord',
      });
    });

    it('creates the correct toast when sync alerts is turned on and case does NOT have alerts', () => {
      // We remove the id as is randomly generated
      const toast = createUpdateSuccessToaster(
        { ...caseBeforeUpdate, comments: [] },
        caseAfterUpdate,
        'settings',
        {
          syncAlerts: true,
          extractObservables: false,
        }
      );

      expect(toast).toEqual({
        title: 'Updated "My case"',
        className: 'eui-textBreakWord',
      });
    });

    it('creates the correct toast when sync alerts is turned off and case has alerts', () => {
      // We remove the id as is randomly generated
      const toast = createUpdateSuccessToaster(caseBeforeUpdate, caseAfterUpdate, 'settings', {
        syncAlerts: false,
        extractObservables: false,
      });

      expect(toast).toEqual({
        title: 'Updated "My case"',
        className: 'eui-textBreakWord',
      });
    });

    it('creates the correct toast when the status change, case has alerts, and sync alerts is on', () => {
      // We remove the id as is randomly generated
      const toast = createUpdateSuccessToaster(
        caseBeforeUpdate,
        caseAfterUpdate,
        'status',
        'closed'
      );

      expect(toast).toEqual({
        title: 'Updated "My case"',
        text: 'Updated the statuses of attached alerts.',
        className: 'eui-textBreakWord',
      });
    });

    it('creates the correct toast when the status change, case has alerts, and sync alerts is off', () => {
      // We remove the id as is randomly generated
      const toast = createUpdateSuccessToaster(
        { ...caseBeforeUpdate, settings: { syncAlerts: false, extractObservables: true } },
        caseAfterUpdate,
        'status',
        'closed'
      );

      expect(toast).toEqual({
        title: 'Updated "My case"',
        className: 'eui-textBreakWord',
      });
    });

    it('creates the correct toast when the status change, case does NOT have alerts, and sync alerts is on', () => {
      // We remove the id as is randomly generated
      const toast = createUpdateSuccessToaster(
        { ...caseBeforeUpdate, comments: [] },
        caseAfterUpdate,
        'status',
        'closed'
      );

      expect(toast).toEqual({
        title: 'Updated "My case"',
        className: 'eui-textBreakWord',
      });
    });

    it('creates the correct toast if not a status or a setting', () => {
      // We remove the id as is randomly generated
      const toast = createUpdateSuccessToaster(
        caseBeforeUpdate,
        caseAfterUpdate,
        'title',
        'My new title'
      );

      expect(toast).toEqual({
        title: 'Updated "My case"',
        className: 'eui-textBreakWord',
      });
    });
  });

  describe('constructAssigneesFilter', () => {
    it('returns an empty object if the array is empty', () => {
      expect(constructAssigneesFilter([])).toEqual({});
    });

    it('returns none for null values in the assignees array', () => {
      expect(constructAssigneesFilter([null, '123'])).toEqual({ assignees: ['none', '123'] });
    });
  });

  describe('constructReportersFilter', () => {
    it('returns an empty object if the array is empty', () => {
      expect(constructReportersFilter([])).toEqual({});
    });

    it('returns the reporters correctly', () => {
      expect(
        constructReportersFilter([
          { username: 'test', full_name: 'Test', email: 'elastic@elastic.co' },
          {
            username: 'test2',
            full_name: 'Test 2',
            email: 'elastic@elastic.co',
            profile_uid: '123',
          },
        ])
      ).toEqual({ reporters: ['test', '123'] });
    });
  });

  describe('constructCustomFieldsFilter', () => {
    it('returns an empty object if the customFields is empty', () => {
      expect(constructCustomFieldsFilter({})).toEqual({});
    });

    it('returns the customFields correctly', () => {
      expect(
        constructCustomFieldsFilter({
          '957846f4-a792-45a2-bc9a-c028973dfdde': {
            type: CustomFieldTypes.TOGGLE,
            options: ['on'],
          },
          'dbeb8e9c-240b-4adb-b83e-e645e86c07ed': {
            type: CustomFieldTypes.TOGGLE,
            options: ['off'],
          },
          'c1f0c0a0-2aaf-11ec-8d3d-0242ac130003': {
            type: CustomFieldTypes.TOGGLE,
            options: [],
          },
          'e0e8c50a-8d65-4f00-b6f0-d8a131fd34b4': {
            type: CustomFieldTypes.TOGGLE,
            options: ['on', 'off'],
          },
        })
      ).toEqual({
        customFields: {
          '957846f4-a792-45a2-bc9a-c028973dfdde': [true],
          'dbeb8e9c-240b-4adb-b83e-e645e86c07ed': [false],
          'e0e8c50a-8d65-4f00-b6f0-d8a131fd34b4': [true, false],
        },
      });
    });
  });

  describe('getIncrementalIdSearchOverrides', () => {
    it('returns an empty object if the search is not an incremental id search', () => {
      const shouldReturnEmpty = [
        '',
        ' ',
        'test',
        '123',
        'abc',
        '#abc',
        '##123',
        '##123##',
        '#123 abc',
      ];

      shouldReturnEmpty.forEach((search) => {
        expect(getIncrementalIdSearchOverrides(search)).toEqual({});
      });
    });

    it('returns the correct overrides for an incremental id search', () => {
      expect(getIncrementalIdSearchOverrides('#123')).toEqual({
        searchFields: ['cases.incremental_id.text'],
        search: '123',
      });
      expect(getIncrementalIdSearchOverrides('   #123   ')).toEqual({
        searchFields: ['cases.incremental_id.text'],
        search: '123',
      });
    });
  });

  describe('parseExtendedFieldSearch', () => {
    const { parseExtendedFieldSearch } = jest.requireActual('./utils');

    it('returns empty filters and original text when no field:value pairs', () => {
      expect(parseExtendedFieldSearch('some text')).toEqual({
        extendedFieldFilters: [],
        freeText: 'some text',
      });
    });

    it('extracts a single field:value pair', () => {
      expect(parseExtendedFieldSearch('priority:high')).toEqual({
        extendedFieldFilters: [{ label: 'priority', value: 'high' }],
        freeText: '',
      });
    });

    it('extracts multiple field:value pairs with AND semantics', () => {
      expect(parseExtendedFieldSearch('priority:high region:emea')).toEqual({
        extendedFieldFilters: [
          { label: 'priority', value: 'high' },
          { label: 'region', value: 'emea' },
        ],
        freeText: '',
      });
    });

    it('separates free text from field:value pairs', () => {
      expect(parseExtendedFieldSearch('priority:high some text')).toEqual({
        extendedFieldFilters: [{ label: 'priority', value: 'high' }],
        freeText: 'some text',
      });
    });

    it('handles quoted values with colons inside', () => {
      expect(parseExtendedFieldSearch('notes:"value:with:colons"')).toEqual({
        extendedFieldFilters: [{ label: 'notes', value: 'value:with:colons' }],
        freeText: '',
      });
    });

    it('handles mixed quoted and unquoted values with free text', () => {
      expect(parseExtendedFieldSearch('priority:high notes:"some:value" free text here')).toEqual({
        extendedFieldFilters: [
          { label: 'priority', value: 'high' },
          { label: 'notes', value: 'some:value' },
        ],
        freeText: 'free text here',
      });
    });

    it('returns empty for empty string', () => {
      expect(parseExtendedFieldSearch('')).toEqual({
        extendedFieldFilters: [],
        freeText: '',
      });
    });

    it('extracts a quoted multi-word label', () => {
      expect(parseExtendedFieldSearch('"Effort Level":high')).toEqual({
        extendedFieldFilters: [{ label: 'Effort Level', value: 'high' }],
        freeText: '',
      });
    });

    it('extracts a quoted multi-word label with a quoted value', () => {
      expect(parseExtendedFieldSearch('"Effort Level":"very high"')).toEqual({
        extendedFieldFilters: [{ label: 'Effort Level', value: 'very high' }],
        freeText: '',
      });
    });

    it('mixes quoted multi-word label with unquoted single-word label', () => {
      expect(parseExtendedFieldSearch('"Effort Level":high priority:critical')).toEqual({
        extendedFieldFilters: [
          { label: 'Effort Level', value: 'high' },
          { label: 'priority', value: 'critical' },
        ],
        freeText: '',
      });
    });

    it('preserves free text alongside quoted multi-word label filter', () => {
      expect(parseExtendedFieldSearch('"Effort Level":high some free text')).toEqual({
        extendedFieldFilters: [{ label: 'Effort Level', value: 'high' }],
        freeText: 'some free text',
      });
    });
  });
});
