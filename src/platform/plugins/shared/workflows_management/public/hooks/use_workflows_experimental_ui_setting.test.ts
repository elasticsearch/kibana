/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook } from '@testing-library/react';
import {
  WORKFLOWS_EXPERIMENTAL_FEATURES_SETTING_ID,
  WORKFLOWS_UI_VISUAL_EDITOR_SETTING_ID,
} from '@kbn/workflows/common/constants';
import { useWorkflowsExperimentalUiSetting } from './use_workflows_experimental_ui_setting';

const mockUseUiSetting = jest.fn();

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useUiSetting: (settingId: string, defaultValue?: boolean) =>
    mockUseUiSetting(settingId, defaultValue),
}));

describe('useWorkflowsExperimentalUiSetting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns false when experimental features are disabled', () => {
    mockUseUiSetting.mockImplementation((settingId: string) => {
      if (settingId === WORKFLOWS_EXPERIMENTAL_FEATURES_SETTING_ID) {
        return false;
      }
      return true;
    });

    const { result } = renderHook(() =>
      useWorkflowsExperimentalUiSetting(WORKFLOWS_UI_VISUAL_EDITOR_SETTING_ID)
    );

    expect(result.current).toBe(false);
  });

  it('returns false when experimental features are enabled but the sub-setting is disabled', () => {
    mockUseUiSetting.mockImplementation((settingId: string) => {
      if (settingId === WORKFLOWS_EXPERIMENTAL_FEATURES_SETTING_ID) {
        return true;
      }
      return false;
    });

    const { result } = renderHook(() =>
      useWorkflowsExperimentalUiSetting(WORKFLOWS_UI_VISUAL_EDITOR_SETTING_ID)
    );

    expect(result.current).toBe(false);
  });

  it('returns true when both experimental features and the sub-setting are enabled', () => {
    mockUseUiSetting.mockReturnValue(true);

    const { result } = renderHook(() =>
      useWorkflowsExperimentalUiSetting(WORKFLOWS_UI_VISUAL_EDITOR_SETTING_ID)
    );

    expect(result.current).toBe(true);
  });
});
