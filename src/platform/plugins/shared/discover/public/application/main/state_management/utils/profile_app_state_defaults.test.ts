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
  PROFILE_APP_STATE_DEFAULT_FIELDS,
  type ProfileAppStateDefaultField,
  type ProfileAppStateDefaultFields,
} from '../redux';
import { getProfileAppStateDefaults, getFieldsToReset } from './profile_app_state_defaults';

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

const createProfileAppStateDefaults = (fieldsToReset: ProfileAppStateDefaultFields) => ({
  resetId: 'test',
  fieldsToReset,
  snapshotsByProfileId: {},
});

const getResetByField = (fieldsToReset: ProfileAppStateDefaultField[]) => ({
  columns: fieldsToReset.includes('columns'),
  rowHeight: fieldsToReset.includes('rowHeight'),
  breakdownField: fieldsToReset.includes('breakdownField'),
  hideChart: fieldsToReset.includes('hideChart'),
  hideTable: fieldsToReset.includes('hideTable'),
  hideSidebar: fieldsToReset.includes('hideSidebar'),
});

describe('getProfileAppStateDefaults', () => {
  describe('getPreFetchState', () => {
    it('should return expected breakdownField', () => {
      const appStateWithBreakdownField = getProfileAppStateDefaults({
        scopedProfilesManager,
        profileAppStateDefaults: createProfileAppStateDefaults(['breakdownField']),
        dataView: dataViewWithTimefieldMock,
      }).getPreFetchState();
      expect(appStateWithBreakdownField).toEqual({
        breakdownField: 'extension',
      });

      const appStateWithoutBreakdownField = getProfileAppStateDefaults({
        scopedProfilesManager,
        profileAppStateDefaults: createProfileAppStateDefaults(['breakdownField']),
        dataView: emptyDataView,
      }).getPreFetchState();

      expect(appStateWithoutBreakdownField).toBeUndefined();
    });

    it('should return expected hideChart', () => {
      const appStateWithHideChart = getProfileAppStateDefaults({
        scopedProfilesManager,
        profileAppStateDefaults: createProfileAppStateDefaults(['hideChart']),
        dataView: dataViewWithTimefieldMock,
      }).getPreFetchState();

      expect(appStateWithHideChart).toEqual({
        hideChart: true,
      });

      const appStateWithoutHideChart = getProfileAppStateDefaults({
        scopedProfilesManager,
        profileAppStateDefaults: createProfileAppStateDefaults('none'),
        dataView: emptyDataView,
      }).getPreFetchState();

      expect(appStateWithoutHideChart).toBeUndefined();
    });

    it('should return expected hideTable', () => {
      let appState = getProfileAppStateDefaults({
        scopedProfilesManager,
        profileAppStateDefaults: createProfileAppStateDefaults(['hideTable']),
        dataView: dataViewWithTimefieldMock,
      }).getPreFetchState();
      expect(appState).toEqual({
        hideTable: false,
      });
      appState = getProfileAppStateDefaults({
        scopedProfilesManager,
        profileAppStateDefaults: createProfileAppStateDefaults('none'),
        dataView: dataViewWithTimefieldMock,
      }).getPreFetchState();
      expect(appState).toEqual(undefined);
    });
  });

  describe('getPostFetchState', () => {
    it('should return expected columns', () => {
      const appStateFromDataView = getProfileAppStateDefaults({
        scopedProfilesManager,
        profileAppStateDefaults: createProfileAppStateDefaults(['columns']),
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

      const appStateFromEsqlColumns = getProfileAppStateDefaults({
        scopedProfilesManager,
        profileAppStateDefaults: createProfileAppStateDefaults(['columns']),
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
      const appState = getProfileAppStateDefaults({
        scopedProfilesManager,
        profileAppStateDefaults: createProfileAppStateDefaults(['rowHeight']),
        dataView: dataViewWithTimefieldMock,
      }).getPostFetchState({
        defaultColumns: [],
        esqlQueryColumns: undefined,
      });
      expect(appState).toEqual({
        rowHeight: 3,
      });
    });

    it('should retain Summary column from profile defaults without a stored width', async () => {
      const { profilesManagerMock: profilesManager, dataSourceProfileProviderMock } =
        createContextAwarenessMocks();

      dataSourceProfileProviderMock.profile.getDefaultAppState = jest.fn(() => () => ({
        columns: [{ name: 'message', width: 100 }, { name: '_source' }],
      }));

      const scopedProfilesManagerWithSummary = profilesManager.createScopedProfilesManager({
        scopedEbtManager: scopedEbtManagerMock,
        toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
      });
      await scopedProfilesManagerWithSummary.resolveDataSourceProfile({});

      const appState = getProfileAppStateDefaults({
        scopedProfilesManager: scopedProfilesManagerWithSummary,
        profileAppStateDefaults: createProfileAppStateDefaults(['columns']),
        dataView: dataViewWithTimefieldMock,
      }).getPostFetchState({
        defaultColumns: [],
        esqlQueryColumns: undefined,
      });

      expect(appState).toEqual({
        columns: ['message', '_source'],
        grid: {
          columns: {
            message: {
              width: 100,
            },
          },
        },
      });
    });

    it('does not apply configured default columns when the profile omits columns', async () => {
      const { profilesManagerMock: profilesManager, dataSourceProfileProviderMock } =
        createContextAwarenessMocks();

      dataSourceProfileProviderMock.profile.getDefaultAppState = jest.fn(() => () => ({}));

      const scopedProfilesManagerWithoutColumns = profilesManager.createScopedProfilesManager({
        scopedEbtManager: scopedEbtManagerMock,
        toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
      });
      await scopedProfilesManagerWithoutColumns.resolveDataSourceProfile({});

      const appState = getProfileAppStateDefaults({
        scopedProfilesManager: scopedProfilesManagerWithoutColumns,
        profileAppStateDefaults: createProfileAppStateDefaults(['columns']),
        dataView: dataViewWithTimefieldMock,
      }).getPostFetchState({
        defaultColumns: ['message', 'bytes'],
        esqlQueryColumns: undefined,
      });

      expect(appState).toBeUndefined();
    });

    it('should return undefined', () => {
      const appState = getProfileAppStateDefaults({
        scopedProfilesManager,
        profileAppStateDefaults: createProfileAppStateDefaults('none'),
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
    expect(getFieldsToReset(getResetByField([...PROFILE_APP_STATE_DEFAULT_FIELDS]))).toBe('all');
  });

  it('should return only selected fields', () => {
    expect(getFieldsToReset(getResetByField(['columns', 'breakdownField']))).toEqual([
      'columns',
      'breakdownField',
    ]);
  });
});
