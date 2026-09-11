/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DashboardSavedObjectAttributes } from '../../dashboard_saved_object';
import type { getDashboardStateSchema } from '../dashboard_state_schemas';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';

jest.mock('../transforms', () => ({
  transformDashboardIn: jest.fn(),
  transformDashboardOut: jest.fn(),
}));

jest.mock('../scope_tooling', () => ({
  stripUnmappedKeys: jest.fn(),
}));

import { stripUnmappedKeys } from '../scope_tooling';
import { transformDashboardIn, transformDashboardOut } from '../transforms';
import { sanitize } from './sanitize';

const mockedTransformDashboardIn = jest.mocked(transformDashboardIn);
const mockedTransformDashboardOut = jest.mocked(transformDashboardOut);
const mockedStripUnmappedKeys = jest.mocked(stripUnmappedKeys);

describe('sanitize', () => {
  const baseDashboardState: DashboardState = {
    title: 'my dashboard',
    panels: [],
    pinned_panels: [],
    options: {
      auto_apply_filters: false,
      hide_panel_titles: false,
      hide_panel_borders: false,
      use_margins: true,
      sync_colors: false,
      sync_tooltips: false,
      sync_cursor: false,
    },
  };

  const storedAttributes: DashboardSavedObjectAttributes = {
    title: 'stored',
    description: '',
    kibanaSavedObjectMeta: {},
    panelsJSON: '[]',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('preserves incoming access_control', async () => {
    const incomingDashboardState = {
      ...baseDashboardState,
      access_control: { access_mode: 'write_restricted' as const },
    };

    mockedTransformDashboardIn.mockReturnValue({ attributes: storedAttributes, references: [] });
    mockedTransformDashboardOut.mockReturnValue({
      dashboardState: baseDashboardState,
      warnings: [],
    });
    mockedStripUnmappedKeys.mockReturnValue({
      data: baseDashboardState,
      warnings: [],
    });

    const dashboardStateSchema = {
      parse: jest.fn().mockReturnValue(baseDashboardState),
    };

    const result = await sanitize(
      dashboardStateSchema as unknown as ReturnType<typeof getDashboardStateSchema>,
      incomingDashboardState
    );

    expect(result.data.access_control).toEqual({ access_mode: 'write_restricted' });
    expect(result).not.toHaveProperty('warnings');
  });

  test('includes warnings when transforms or stripping produce warnings', async () => {
    const transformWarning = {
      type: 'dropped_panel' as const,
      message: 'Transform warning',
      panel_type: 'transform_panel',
      panel_config: { someKey: 'someValue' },
    };
    const scopeWarning = {
      type: 'dropped_panel' as const,
      message: 'Scope warning',
      panel_type: 'scope_panel',
      panel_config: { otherKey: 'otherValue' },
    };

    mockedTransformDashboardIn.mockReturnValue({ attributes: storedAttributes, references: [] });
    mockedTransformDashboardOut.mockReturnValue({
      dashboardState: baseDashboardState,
      warnings: [transformWarning],
    });
    mockedStripUnmappedKeys.mockReturnValue({
      data: baseDashboardState,
      warnings: [scopeWarning],
    });

    const dashboardStateSchema = {
      parse: jest.fn().mockReturnValue(baseDashboardState),
    };

    const result = await sanitize(
      dashboardStateSchema as unknown as ReturnType<typeof getDashboardStateSchema>,
      baseDashboardState
    );

    expect(result.warnings).toEqual([transformWarning, scopeWarning]);
  });
});
