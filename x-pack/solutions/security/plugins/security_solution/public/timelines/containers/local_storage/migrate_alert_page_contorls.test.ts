/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Storage } from '@kbn/kibana-utils-plugin/public';
import type { NewFormatExplicitInput } from './migrate_alert_page_controls';
import {
  GET_PAGE_FILTER_STORAGE_KEY,
  migrateAlertPageControlsTo816,
} from './migrate_alert_page_controls';
import type { StartPlugins } from '../../../types';
import type { ControlGroupRuntimeState } from '@kbn/control-group-renderer';
import {
  DEFAULT_DSL_OPTIONS_LIST_STATE,
  DEFAULT_PINNED_CONTROL_STATE,
  OPTIONS_LIST_CONTROL,
} from '@kbn/controls-constants';

const OLD_FORMAT = {
  viewMode: 'view',
  id: '5bc0ef0f-c6a9-4eaf-9fc5-9703fcb85482',
  panels: {
    '0': {
      type: OPTIONS_LIST_CONTROL,
      order: 0,
      grow: true,
      width: 'small',
      explicitInput: {
        id: '0',
        dataViewId: 'security_solution_alerts_dv',
        fieldName: 'kibana.alert.workflow_status',
        title: 'Status',
        hideExclude: true,
        hideSort: true,
        hidePanelTitles: true,
        placeholder: '',
        ignoreParentSettings: {
          ignoreValidations: true,
        },
        selectedOptions: ['open'],
        hideActionBar: true,
        persist: true,
        hideExists: true,
        existsSelected: false,
        exclude: false,
      },
    },
    '1': {
      type: OPTIONS_LIST_CONTROL,
      order: 1,
      grow: true,
      width: 'small',
      explicitInput: {
        id: '1',
        dataViewId: 'security_solution_alerts_dv',
        fieldName: 'kibana.alert.severity',
        title: 'Severity',
        hideExclude: true,
        hideSort: true,
        hidePanelTitles: true,
        placeholder: '',
        ignoreParentSettings: {
          ignoreValidations: true,
        },
        selectedOptions: [],
        hideActionBar: true,
        hideExists: true,
        existsSelected: false,
        exclude: false,
      },
    },
    '2': {
      type: OPTIONS_LIST_CONTROL,
      order: 2,
      grow: true,
      width: 'small',
      explicitInput: {
        id: '2',
        dataViewId: 'security_solution_alerts_dv',
        fieldName: 'user.name',
        title: 'User',
        hideExclude: true,
        hideSort: true,
        hidePanelTitles: true,
        placeholder: '',
        ignoreParentSettings: {
          ignoreValidations: true,
        },
        selectedOptions: [],
        existsSelected: false,
        exclude: false,
      },
    },
    '3': {
      type: OPTIONS_LIST_CONTROL,
      order: 3,
      grow: true,
      width: 'small',
      explicitInput: {
        id: '3',
        dataViewId: 'security_solution_alerts_dv',
        fieldName: 'host.name',
        title: 'Host',
        hideExclude: true,
        hideSort: true,
        hidePanelTitles: true,
        placeholder: '',
        ignoreParentSettings: {
          ignoreValidations: true,
        },
        selectedOptions: [],
        existsSelected: false,
        exclude: false,
      },
    },
  },
  defaultControlWidth: 'small',
  defaultControlGrow: true,
  controlStyle: 'oneLine',
  chainingSystem: 'HIERARCHICAL',
  showApplySelections: false,
  ignoreParentSettings: {
    ignoreFilters: false,
    ignoreQuery: false,
    ignoreTimerange: false,
    ignoreValidations: false,
  },
  timeRange: {
    from: '2024-09-10T22:00:00.000Z',
    to: '2024-09-11T21:59:59.999Z',
    mode: 'absolute',
  },
  filters: [
    {
      meta: {
        alias: null,
        negate: true,
        disabled: false,
        type: 'exists',
        key: 'kibana.alert.building_block_type',
        index: 'security-solution-default',
      },
      query: {
        exists: {
          field: 'kibana.alert.building_block_type',
        },
      },
    },
  ],
  query: {
    query: '',
    language: 'kuery',
  },
};

const NEW_FORMAT = {
  initialChildControlState: {
    '0': {
      ...DEFAULT_DSL_OPTIONS_LIST_STATE,
      ...DEFAULT_PINNED_CONTROL_STATE,
      type: OPTIONS_LIST_CONTROL,
      order: 0,
      display_settings: {
        hide_exclude: true,
        hide_sort: true,
        hide_action_bar: true,
        hide_exists: true,
        placeholder: '',
      },
      width: 'small',
      data_view_id: 'security_solution_alerts_dv',
      title: 'Status',
      field_name: 'kibana.alert.workflow_status',
      selected_options: ['open'],
      persist: true,
    },
    '1': {
      ...DEFAULT_DSL_OPTIONS_LIST_STATE,
      ...DEFAULT_PINNED_CONTROL_STATE,
      type: OPTIONS_LIST_CONTROL,
      order: 1,
      display_settings: {
        hide_exclude: true,
        hide_sort: true,
        hide_action_bar: true,
        hide_exists: true,
        placeholder: '',
      },
      width: 'small',
      data_view_id: 'security_solution_alerts_dv',
      title: 'Severity',
      field_name: 'kibana.alert.severity',
      persist: false,
    },
    '2': {
      ...DEFAULT_DSL_OPTIONS_LIST_STATE,
      ...DEFAULT_PINNED_CONTROL_STATE,
      type: OPTIONS_LIST_CONTROL,
      order: 2,
      display_settings: {
        hide_exclude: true,
        hide_sort: true,
        hide_action_bar: false,
        hide_exists: false,
        placeholder: '',
      },
      width: 'small',
      data_view_id: 'security_solution_alerts_dv',
      title: 'User',
      field_name: 'user.name',
      persist: false,
    },
    '3': {
      ...DEFAULT_DSL_OPTIONS_LIST_STATE,
      ...DEFAULT_PINNED_CONTROL_STATE,
      type: OPTIONS_LIST_CONTROL,
      order: 3,
      display_settings: {
        hide_exclude: true,
        hide_sort: true,
        hide_action_bar: false,
        hide_exists: false,
        placeholder: '',
      },
      width: 'small',
      data_view_id: 'security_solution_alerts_dv',
      title: 'Host',
      field_name: 'host.name',
      persist: false,
    },
  },
  ignoreParentSettings: {
    ignoreValidations: false,
  },
} as unknown as ControlGroupRuntimeState<NewFormatExplicitInput>;
const storage = new Storage(localStorage);

const mockPlugins = {
  spaces: {
    getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
  },
} as unknown as StartPlugins;

describe('migrateAlertPageControlsTo816', () => {
  beforeEach(() => {
    storage.clear();
  });
  describe('Default space', () => {
    beforeEach(() => {
      if (mockPlugins.spaces?.getActiveSpace) {
        mockPlugins.spaces.getActiveSpace = jest.fn().mockResolvedValue({ id: 'default' });
      }
    });
    it('should migrate the old format to the new format', async () => {
      storage.set(GET_PAGE_FILTER_STORAGE_KEY(), OLD_FORMAT);
      await migrateAlertPageControlsTo816(storage, mockPlugins);
      const migrated = storage.get(GET_PAGE_FILTER_STORAGE_KEY());
      expect(migrated).toMatchObject(NEW_FORMAT);
    });

    it('should be a no-op if the new format already exists', async () => {
      storage.set(GET_PAGE_FILTER_STORAGE_KEY(), NEW_FORMAT);
      await migrateAlertPageControlsTo816(storage, mockPlugins);
      const migrated = storage.get(GET_PAGE_FILTER_STORAGE_KEY());
      expect(migrated).toMatchObject(NEW_FORMAT);
    });

    it('should be a no-op if no value is present in localstorage for page filters ', async () => {
      await migrateAlertPageControlsTo816(storage, mockPlugins);
      const migrated = storage.get(GET_PAGE_FILTER_STORAGE_KEY());
      expect(migrated).toBeNull();
    });

    it('should convert custom old format correctly', async () => {
      const MODIFIED_OLD_FORMAT = structuredClone(OLD_FORMAT);
      MODIFIED_OLD_FORMAT.panels['0'].explicitInput.hideExists = true;
      MODIFIED_OLD_FORMAT.chainingSystem = 'NONE';
      storage.set(GET_PAGE_FILTER_STORAGE_KEY(), MODIFIED_OLD_FORMAT);
      await migrateAlertPageControlsTo816(storage, mockPlugins);
      const migrated = storage.get(GET_PAGE_FILTER_STORAGE_KEY());
      const EXPECTED_NEW_FORMAT = structuredClone(NEW_FORMAT);
      const first = EXPECTED_NEW_FORMAT.initialChildControlState[0];
      expect(migrated).toMatchObject({
        ...EXPECTED_NEW_FORMAT,
        initialChildControlState: {
          ...EXPECTED_NEW_FORMAT.initialChildControlState,
          '0': { ...first, display_settings: { ...first.display_settings, hide_exists: true } },
        },
      });
      expect(migrated).toMatchObject(EXPECTED_NEW_FORMAT);
    });
  });

  describe('Non Default space', () => {
    const nonDefaultSpaceId = 'space1';
    beforeEach(() => {
      if (mockPlugins.spaces?.getActiveSpace) {
        mockPlugins.spaces.getActiveSpace = jest.fn().mockResolvedValue({ id: nonDefaultSpaceId });
      }
    });
    it('should migrate the old format to the new format', async () => {
      storage.set(GET_PAGE_FILTER_STORAGE_KEY(nonDefaultSpaceId), OLD_FORMAT);
      await migrateAlertPageControlsTo816(storage, mockPlugins);
      const migrated = storage.get(GET_PAGE_FILTER_STORAGE_KEY(nonDefaultSpaceId));
      expect(migrated).toMatchObject(NEW_FORMAT);
    });

    it('should be a no-op if the new format already exists', async () => {
      storage.set(GET_PAGE_FILTER_STORAGE_KEY(nonDefaultSpaceId), NEW_FORMAT);
      await migrateAlertPageControlsTo816(storage, mockPlugins);
      const migrated = storage.get(GET_PAGE_FILTER_STORAGE_KEY(nonDefaultSpaceId));
      expect(migrated).toMatchObject(NEW_FORMAT);
    });

    it('should be a no-op if no value is present in localstorage for page filters ', async () => {
      await migrateAlertPageControlsTo816(storage, mockPlugins);
      const migrated = storage.get(GET_PAGE_FILTER_STORAGE_KEY(nonDefaultSpaceId));
      expect(migrated).toBeNull();
    });

    it('should convert custom old format correctly', async () => {
      const MODIFIED_OLD_FORMAT = structuredClone(OLD_FORMAT);
      MODIFIED_OLD_FORMAT.panels['0'].explicitInput.hideExists = true;
      MODIFIED_OLD_FORMAT.chainingSystem = 'NONE';
      storage.set(GET_PAGE_FILTER_STORAGE_KEY(nonDefaultSpaceId), MODIFIED_OLD_FORMAT);
      await migrateAlertPageControlsTo816(storage, mockPlugins);
      const migrated = storage.get(GET_PAGE_FILTER_STORAGE_KEY(nonDefaultSpaceId));
      const EXPECTED_NEW_FORMAT = structuredClone(NEW_FORMAT);
      const first = EXPECTED_NEW_FORMAT.initialChildControlState[0];
      expect(migrated).toMatchObject({
        ...EXPECTED_NEW_FORMAT,
        initialChildControlState: {
          ...EXPECTED_NEW_FORMAT.initialChildControlState,
          '0': { ...first, display_settings: { ...first.display_settings, hide_exists: true } },
        },
      });
    });
  });
});
