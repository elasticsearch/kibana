/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useService, CoreStart } from '@kbn/core-di-browser';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';
import { useIsRuleManagementABSkillAvailable } from './use_is_rule_management_ab_skill_available';

jest.mock('@kbn/core-di-browser');

const mockUseService = useService as jest.MockedFunction<typeof useService>;
const mockCoreStart = CoreStart as jest.MockedFunction<typeof CoreStart>;

const setupMocks = ({
  agentBuilderShow = true,
  experimentalFeaturesEnabled = true,
}: {
  agentBuilderShow?: boolean;
  experimentalFeaturesEnabled?: boolean;
} = {}) => {
  mockCoreStart.mockImplementation((key: string) => key as any);

  mockUseService.mockImplementation((service: unknown) => {
    if (service === 'uiSettings') {
      return {
        get: (id: string) => {
          if (id === AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID) {
            return experimentalFeaturesEnabled;
          }
          return undefined;
        },
      } as any;
    }
    if (service === 'application') {
      return {
        capabilities: {
          agentBuilder: { show: agentBuilderShow },
        },
      } as any;
    }
    return undefined as any;
  });
};

describe('useIsRuleManagementABSkillAvailable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when agent builder capability is enabled and experimental features are on', () => {
    setupMocks({ agentBuilderShow: true, experimentalFeaturesEnabled: true });

    const { result } = renderHook(() => useIsRuleManagementABSkillAvailable());

    expect(result.current).toBe(true);
  });

  it('returns false when agent builder capability is disabled', () => {
    setupMocks({ agentBuilderShow: false, experimentalFeaturesEnabled: true });

    const { result } = renderHook(() => useIsRuleManagementABSkillAvailable());

    expect(result.current).toBe(false);
  });

  it('returns false when experimental features are disabled', () => {
    setupMocks({ agentBuilderShow: true, experimentalFeaturesEnabled: false });

    const { result } = renderHook(() => useIsRuleManagementABSkillAvailable());

    expect(result.current).toBe(false);
  });

  it('returns false when both are disabled', () => {
    setupMocks({ agentBuilderShow: false, experimentalFeaturesEnabled: false });

    const { result } = renderHook(() => useIsRuleManagementABSkillAvailable());

    expect(result.current).toBe(false);
  });

  it('returns false when agentBuilder capabilities are missing entirely', () => {
    mockCoreStart.mockImplementation((key: string) => key as any);
    mockUseService.mockImplementation((service: unknown) => {
      if (service === 'uiSettings') {
        return {
          get: () => true,
        } as any;
      }
      if (service === 'application') {
        return { capabilities: {} } as any;
      }
      return undefined as any;
    });

    const { result } = renderHook(() => useIsRuleManagementABSkillAvailable());

    expect(result.current).toBe(false);
  });
});
