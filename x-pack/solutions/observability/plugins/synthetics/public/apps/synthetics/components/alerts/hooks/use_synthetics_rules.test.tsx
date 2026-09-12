/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import React from 'react';
import * as redux from 'react-redux-v7';
import { useSyntheticsRules } from './use_synthetics_rules';
import {
  selectSyntheticsAlerts,
  selectSyntheticsAlertsLoading,
  selectSyntheticsAlertsLoaded,
} from '../../../state/alert_rules/selectors';
import { selectAlertFlyoutVisibility, selectIsNewRule } from '../../../state/ui/selectors';
import { selectMonitorListState } from '../../../state/monitor_list/selectors';
import { selectDynamicSettings } from '../../../state/settings/selectors';
import {
  enableDefaultAlertingSilentlyAction,
  getDefaultAlertingAction,
} from '../../../state/alert_rules';
import {
  SYNTHETICS_STATUS_RULE,
  SYNTHETICS_TLS_RULE,
} from '../../../../../../common/constants/synthetics_alerts';

// Mock dependencies
jest.mock('react-redux-v7', () => ({
  ...jest.requireActual('react-redux-v7'),
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: jest.fn(),
}));

jest.mock('@kbn/response-ops-rule-form/flyout', () => ({
  RuleFormFlyout: () => <div data-test-subj="rule-form-flyout">Rule Form Flyout</div>,
}));

const mockDispatch = jest.fn();
const mockUseSelector = redux.useSelector as jest.MockedFunction<typeof redux.useSelector>;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const kibanaModule = require('@kbn/kibana-react-plugin/public');
const mockUseKibana = kibanaModule.useKibana as jest.MockedFunction<any>;

const mockUptimeCapabilities = (overrides: { save?: boolean; canManageRules?: boolean } = {}) => ({
  services: {
    application: {
      capabilities: {
        uptime: {
          save: true,
          canManageRules: false,
          ...overrides,
        },
      },
    },
    triggersActionsUi: {
      ruleTypeRegistry: {},
      actionTypeRegistry: {},
    },
  },
});

describe('useSyntheticsRules', () => {
  const baseMockState = {
    defaultAlerting: {
      data: {
        statusRule: { id: 'status-rule-1', name: 'Status Rule' },
        tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
      },
      loading: false,
      success: true,
    },
    ui: {
      ruleFlyoutVisible: null,
      isNewRuleFlyout: false,
    },
    dynamicSettings: {
      settings: {
        defaultStatusRuleEnabled: true,
        defaultTLSRuleEnabled: true,
      },
    },
    monitorList: {
      loaded: true,
      data: {
        absoluteTotal: 5,
      },
    },
  };

  // Helper function to setup mock selectors with a given state
  const setupMockSelectors = (state: any) => {
    mockUseSelector.mockImplementation((selector: any) => {
      if (selector === selectSyntheticsAlerts) {
        return selectSyntheticsAlerts(state);
      }
      if (selector === selectSyntheticsAlertsLoading) {
        return selectSyntheticsAlertsLoading(state);
      }
      if (selector === selectSyntheticsAlertsLoaded) {
        return selectSyntheticsAlertsLoaded(state);
      }
      if (selector === selectAlertFlyoutVisibility) {
        return selectAlertFlyoutVisibility(state);
      }
      if (selector === selectIsNewRule) {
        return selectIsNewRule(state);
      }
      if (selector === selectMonitorListState) {
        return selectMonitorListState(state);
      }
      if (selector === selectDynamicSettings) {
        return selectDynamicSettings(state);
      }
      return undefined;
    });
  };

  // Helper function to create state variations
  const createState = (overrides: any) => ({
    ...baseMockState,
    ...overrides,
  });

  // Helper wrapper component
  const TestWrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, {}, children);

  beforeEach(() => {
    jest.clearAllMocks();
    (redux.useDispatch as jest.Mock).mockReturnValue(mockDispatch);

    // Default mock implementations
    mockUseKibana.mockReturnValue(mockUptimeCapabilities());

    // Setup default mock selectors
    setupMockSelectors(baseMockState);
  });

  it('returns expected structure with default rules', () => {
    const { result } = renderHook(() => useSyntheticsRules(false), {
      wrapper: TestWrapper,
    });

    expect(result.current).toMatchObject({
      loading: false,
      defaultRules: {
        statusRule: { id: 'status-rule-1', name: 'Status Rule' },
        tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
      },
      EditAlertFlyout: null,
      NewRuleFlyout: null,
    });
  });

  it('dispatches enableDefaultAlertingSilentlyAction when the user can save and popover opens', () => {
    mockUseKibana.mockReturnValue(mockUptimeCapabilities({ save: true }));

    const stateWithoutRules = createState({
      defaultAlerting: {
        data: undefined,
        loading: false,
        success: null,
      },
    }) as any;

    setupMockSelectors(stateWithoutRules);

    renderHook(() => useSyntheticsRules(true), {
      wrapper: TestWrapper,
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: enableDefaultAlertingSilentlyAction.get().type,
        meta: { dispatchedAt: expect.any(Number) },
      })
    );
  });

  it('dispatches enableDefaultAlertingSilentlyAction when the user can manage rules and popover opens', () => {
    mockUseKibana.mockReturnValue(mockUptimeCapabilities({ save: false, canManageRules: true }));

    const stateWithoutRules = createState({
      defaultAlerting: {
        data: undefined,
        loading: false,
        success: null,
      },
    }) as any;

    setupMockSelectors(stateWithoutRules);

    renderHook(() => useSyntheticsRules(true), {
      wrapper: TestWrapper,
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: enableDefaultAlertingSilentlyAction.get().type,
        meta: { dispatchedAt: expect.any(Number) },
      })
    );
  });

  it('dispatches getDefaultAlertingAction when the user cannot manage rules and popover opens', () => {
    mockUseKibana.mockReturnValue(mockUptimeCapabilities({ save: false, canManageRules: false }));

    const stateWithoutRules = createState({
      defaultAlerting: {
        data: undefined,
        loading: false,
        success: null,
      },
    }) as any;

    setupMockSelectors(stateWithoutRules);

    renderHook(() => useSyntheticsRules(true), {
      wrapper: TestWrapper,
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: getDefaultAlertingAction.get().type,
        meta: { dispatchedAt: expect.any(Number) },
      })
    );
  });

  it('returns NewRuleFlyout as null when isNewRule is false', () => {
    const stateWithEditFlyout = createState({
      ui: {
        ruleFlyoutVisible: SYNTHETICS_STATUS_RULE,
        isNewRuleFlyout: false,
      },
    }) as any;

    setupMockSelectors(stateWithEditFlyout);

    const { result } = renderHook(() => useSyntheticsRules(false), {
      wrapper: TestWrapper,
    });

    expect(result.current.NewRuleFlyout).toBeNull();
  });

  it('returns NewRuleFlyout as null when alertFlyoutVisible is null', () => {
    const stateWithNoFlyout = createState({
      ui: {
        ruleFlyoutVisible: null,
        isNewRuleFlyout: true,
      },
    }) as any;

    setupMockSelectors(stateWithNoFlyout);

    const { result } = renderHook(() => useSyntheticsRules(false), {
      wrapper: TestWrapper,
    });

    expect(result.current.NewRuleFlyout).toBeNull();
  });

  it('returns NewRuleFlyout component when isNewRule is true and alertFlyoutVisible is set for status rule', () => {
    const stateWithNewStatusRuleFlyout = createState({
      ui: {
        ruleFlyoutVisible: SYNTHETICS_STATUS_RULE,
        isNewRuleFlyout: true,
      },
    }) as any;

    setupMockSelectors(stateWithNewStatusRuleFlyout);

    const { result } = renderHook(() => useSyntheticsRules(false), {
      wrapper: TestWrapper,
    });

    expect(result.current.NewRuleFlyout).not.toBeNull();
    expect(result.current.EditAlertFlyout).toBeNull();
  });

  it('returns NewRuleFlyout component when isNewRule is true and alertFlyoutVisible is set for TLS rule', () => {
    const stateWithNewTlsRuleFlyout = createState({
      ui: {
        ruleFlyoutVisible: SYNTHETICS_TLS_RULE,
        isNewRuleFlyout: true,
      },
    }) as any;

    setupMockSelectors(stateWithNewTlsRuleFlyout);

    const { result } = renderHook(() => useSyntheticsRules(false), {
      wrapper: TestWrapper,
    });

    expect(result.current.NewRuleFlyout).not.toBeNull();
    expect(result.current.EditAlertFlyout).toBeNull();
  });

  it('returns EditAlertFlyout as null when isNewRule is true', () => {
    const stateWithNewRule = createState({
      ui: {
        ruleFlyoutVisible: SYNTHETICS_STATUS_RULE,
        isNewRuleFlyout: true,
      },
    }) as any;

    setupMockSelectors(stateWithNewRule);

    const { result } = renderHook(() => useSyntheticsRules(false), {
      wrapper: TestWrapper,
    });

    expect(result.current.EditAlertFlyout).toBeNull();
  });

  it('returns EditAlertFlyout as null when alertFlyoutVisible is null', () => {
    const stateWithNoFlyout = createState({
      ui: {
        ruleFlyoutVisible: null,
        isNewRuleFlyout: false,
      },
    }) as any;

    setupMockSelectors(stateWithNoFlyout);

    const { result } = renderHook(() => useSyntheticsRules(false), {
      wrapper: TestWrapper,
    });

    expect(result.current.EditAlertFlyout).toBeNull();
  });

  it('returns EditAlertFlyout as null when status rule does not exist', () => {
    const stateWithoutStatusRule = createState({
      defaultAlerting: {
        data: {
          statusRule: null,
          tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
        },
        loading: false,
        success: true,
      },
      ui: {
        ruleFlyoutVisible: SYNTHETICS_STATUS_RULE,
        isNewRuleFlyout: false,
      },
    }) as any;

    setupMockSelectors(stateWithoutStatusRule);

    const { result } = renderHook(() => useSyntheticsRules(false), {
      wrapper: TestWrapper,
    });

    expect(result.current.EditAlertFlyout).toBeNull();
  });

  it('returns EditAlertFlyout as null when TLS rule does not exist', () => {
    const stateWithoutTlsRule = createState({
      defaultAlerting: {
        data: {
          statusRule: { id: 'status-rule-1', name: 'Status Rule' },
          tlsRule: null,
        },
        loading: false,
        success: true,
      },
      ui: {
        ruleFlyoutVisible: SYNTHETICS_TLS_RULE,
        isNewRuleFlyout: false,
      },
    }) as any;

    setupMockSelectors(stateWithoutTlsRule);

    const { result } = renderHook(() => useSyntheticsRules(false), {
      wrapper: TestWrapper,
    });

    expect(result.current.EditAlertFlyout).toBeNull();
  });

  it('returns EditAlertFlyout component when status rule exists and isNewRule is false', () => {
    const stateWithStatusRule = createState({
      ui: {
        ruleFlyoutVisible: SYNTHETICS_STATUS_RULE,
        isNewRuleFlyout: false,
      },
    }) as any;

    setupMockSelectors(stateWithStatusRule);

    const { result } = renderHook(() => useSyntheticsRules(false), {
      wrapper: TestWrapper,
    });

    expect(result.current.EditAlertFlyout).not.toBeNull();
    expect(result.current.NewRuleFlyout).toBeNull();
  });

  it('returns EditAlertFlyout component when TLS rule exists and isNewRule is false', () => {
    const stateWithTlsRule = createState({
      ui: {
        ruleFlyoutVisible: SYNTHETICS_TLS_RULE,
        isNewRuleFlyout: false,
      },
    }) as any;

    setupMockSelectors(stateWithTlsRule);

    const { result } = renderHook(() => useSyntheticsRules(false), {
      wrapper: TestWrapper,
    });

    expect(result.current.EditAlertFlyout).not.toBeNull();
    expect(result.current.NewRuleFlyout).toBeNull();
  });

  it('does not dispatch when isOpen is true, one rule exists but the other is null, and success is true', () => {
    // This test verifies the hook doesn't keep trying to fetch rules when the API
    // has already returned a partial result (one rule exists, one is null)
    const stateWithPartialRules = createState({
      defaultAlerting: {
        data: {
          statusRule: { id: 'status-rule-1', name: 'Status Rule' },
          tlsRule: null,
        },
        loading: false,
        success: true, // API call completed successfully
      },
    }) as any;

    setupMockSelectors(stateWithPartialRules);

    renderHook(() => useSyntheticsRules(true), {
      wrapper: TestWrapper,
    });

    // Should not dispatch because:
    // 1. rulesLoaded is true (success: true)
    // 2. At least one rule exists (statusRule)
    // This prevents infinite loops when API returns partial results
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch when isOpen is true, TLS rule exists but status rule is null, and success is true', () => {
    // Test the reverse scenario - TLS rule exists but status rule is null
    const stateWithPartialRules = createState({
      defaultAlerting: {
        data: {
          statusRule: null,
          tlsRule: { id: 'tls-rule-1', name: 'TLS Rule' },
        },
        loading: false,
        success: true, // API call completed successfully
      },
    }) as any;

    setupMockSelectors(stateWithPartialRules);

    renderHook(() => useSyntheticsRules(true), {
      wrapper: TestWrapper,
    });

    // Should not dispatch because:
    // 1. rulesLoaded is true (success: true)
    // 2. At least one rule exists (tlsRule)
    // This prevents infinite loops when API returns partial results
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
