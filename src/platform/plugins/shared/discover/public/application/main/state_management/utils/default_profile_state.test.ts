/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fieldList } from '@kbn/data-views-plugin/common';
import { buildDataViewMock } from '@kbn/discover-utils/src/__mocks__';
import { createContextAwarenessMocks } from '../../../../context_awareness/__mocks__';
import { EMPTY_CONTEXT_AWARENESS_TOOLKIT } from '../../../../context_awareness/toolkit';
import { dataViewWithTimefieldMock } from '../../../../__mocks__/data_view_with_timefield';
import {
  DEFAULT_PROFILE_STATE_FIELDS,
  type DefaultProfileStateField,
  type DefaultProfileStateFields,
} from '../redux';
import { getDefaultProfileState, getFieldsToReset } from './default_profile_state';

const emptyDataView = buildDataViewMock({
  name: 'emptyDataView',
  fields: fieldList(),
});
const { profilesManagerMock, scopedEbtManagerMock } = createContextAwarenessMocks();
const scopedProfilesManager = profilesManagerMock.createScopedProfilesManager({
  scopedEbtManager: scopedEbtManagerMock,
  toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
});

scopedProfilesManager.resolveDataSourceProfile({});

const createDefaultProfileState = (fieldsToReset: DefaultProfileStateFields) => ({
  resetId: 'test',
  fieldsToReset,
  snapshotsByProfileId: {},
});

const getResetByField = (fieldsToReset: DefaultProfileStateField[]) => ({
  columns: fieldsToReset.includes('columns'),
  rowHeight: fieldsToReset.includes('rowHeight'),
  breakdownField: fieldsToReset.includes('breakdownField'),
  hideChart: fieldsToReset.includes('hideChart'),
  hideTable: fieldsToReset.includes('hideTable'),
  hideSidebar: fieldsToReset.includes('hideSidebar'),
});

describe('getDefaultProfileState', () => {
  describe('getPreFetchState', () => {
    it('should return expected breakdownField', () => {
      const appStateWithBreakdownField = getDefaultProfileState({
        scopedProfilesManager,
        defaultProfileState: createDefaultProfileState(['breakdownField']),
        dataView: dataViewWithTimefieldMock,
      }).getPreFetchState();
      expect(appStateWithBreakdownField).toEqual({
        breakdownField: 'extension',
      });

      const appStateWithoutBreakdownField = getDefaultProfileState({
        scopedProfilesManager,
        defaultProfileState: createDefaultProfileState(['breakdownField']),
        dataView: emptyDataView,
      }).getPreFetchState();

      expect(appStateWithoutBreakdownField).toBeUndefined();
    });

    it('should return expected hideChart', () => {
      const appStateWithHideChart = getDefaultProfileState({
        scopedProfilesManager,
        defaultProfileState: createDefaultProfileState(['hideChart']),
        dataView: dataViewWithTimefieldMock,
      }).getPreFetchState();

      expect(appStateWithHideChart).toEqual({
        hideChart: true,
      });

      const appStateWithoutHideChart = getDefaultProfileState({
        scopedProfilesManager,
        defaultProfileState: createDefaultProfileState('none'),
        dataView: emptyDataView,
      }).getPreFetchState();

      expect(appStateWithoutHideChart).toBeUndefined();
    });

    it('should return expected hideTable', () => {
      let appState = getDefaultProfileState({
        scopedProfilesManager,
        defaultProfileState: createDefaultProfileState(['hideTable']),
        dataView: dataViewWithTimefieldMock,
      }).getPreFetchState();
      expect(appState).toEqual({
        hideTable: false,
      });
      appState = getDefaultProfileState({
        scopedProfilesManager,
        defaultProfileState: createDefaultProfileState('none'),
        dataView: dataViewWithTimefieldMock,
      }).getPreFetchState();
      expect(appState).toEqual(undefined);
    });
  });

  describe('getPostFetchState', () => {
    it('should return expected columns', () => {
      const appStateFromDataView = getDefaultProfileState({
        scopedProfilesManager,
        defaultProfileState: createDefaultProfileState(['columns']),
        dataView: dataViewWithTimefieldMock,
      }).getPostFetchState({
        defaultColumns: ['messsage', 'bytes'],
        esqlQueryColumns: undefined,
      });

      expect(appStateFromDataView).toEqual({
        columns: ['message', 'extension', 'bytes'],
        grid: {
          columns: {
            extension: {
              width: 200,
            },
            message: {
              width: 100,
            },
          },
        },
      });

      const appStateFromEsqlColumns = getDefaultProfileState({
        scopedProfilesManager,
        defaultProfileState: createDefaultProfileState(['columns']),
        dataView: emptyDataView,
      }).getPostFetchState({
        defaultColumns: ['messsage', 'bytes'],
        esqlQueryColumns: [
          { id: '1', name: 'foo', meta: { type: 'string' } },
          { id: '2', name: 'bar', meta: { type: 'string' } },
        ],
      });
      expect(appStateFromEsqlColumns).toEqual({
        columns: ['foo', 'bar'],
        grid: {
          columns: {
            foo: {
              width: 300,
            },
          },
        },
      });
    });

    it('should return expected rowHeight', () => {
      const appState = getDefaultProfileState({
        scopedProfilesManager,
        defaultProfileState: createDefaultProfileState(['rowHeight']),
        dataView: dataViewWithTimefieldMock,
      }).getPostFetchState({
        defaultColumns: [],
        esqlQueryColumns: undefined,
      });
      expect(appState).toEqual({
        rowHeight: 3,
      });
    });

    it('should return undefined', () => {
      const appState = getDefaultProfileState({
        scopedProfilesManager,
        defaultProfileState: createDefaultProfileState('none'),
        dataView: dataViewWithTimefieldMock,
      }).getPostFetchState({
        defaultColumns: [],
        esqlQueryColumns: undefined,
      });
      expect(appState).toBeUndefined();
    });
  });
});

describe('getFieldsToReset', () => {
  it('should return none when no fields should reset', () => {
    expect(getFieldsToReset(getResetByField([]))).toBe('none');
  });

  it('should return all when all fields should reset', () => {
    expect(getFieldsToReset(getResetByField([...DEFAULT_PROFILE_STATE_FIELDS]))).toBe('all');
  });

  it('should return only selected fields', () => {
    expect(getFieldsToReset(getResetByField(['columns', 'breakdownField']))).toEqual([
      'columns',
      'breakdownField',
    ]);
  });
});
