/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { MemoryRouter } from 'react-router-dom';
import { Route } from '@kbn/shared-ux-router';
import { EntityAnalyticsManagementPage } from './entity_analytics_management_page';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { ENTITY_ANALYTICS_MANAGEMENT_PATH } from '../../../common/constants';
import { ENGINE_DESCRIPTOR_CREATE_PRIVILEGE } from '@kbn/entity-store/common';

import {
  ENTITY_ANALYTICS_MANAGEMENT_PAGE_TITLE_TEST_ID,
  RISK_SCORE_TAB_TEST_ID,
  ASSET_CRITICALITY_TAB_TEST_ID,
  WATCHLISTS_TAB_TEST_ID,
  ENGINE_STATUS_TAB_TEST_ID,
} from '../test_ids';
import { useHasEntityResolutionLicense } from '../../common/hooks/use_has_entity_resolution_license';

const mockAddSuccess = jest.fn();
const mockAddError = jest.fn();
jest.mock('../../common/hooks/use_app_toasts', () => ({
  useAppToasts: () => ({
    addSuccess: mockAddSuccess,
    addError: mockAddError,
  }),
}));

jest.mock('../api/api', () => ({
  useEntityAnalyticsRoutes: () => ({
    fetchRiskEngineSettings: () => undefined,
    fetchRiskEngineStatus: () => undefined,
  }),
}));

const mockUseMissingRiskEnginePrivileges = jest
  .fn()
  .mockReturnValue({ isLoading: false, hasAllRequiredPrivileges: true });
jest.mock('../hooks/use_missing_risk_engine_privileges', () => ({
  useMissingRiskEnginePrivileges: () => mockUseMissingRiskEnginePrivileges(),
}));

const mockUseIsExperimentalFeatureEnabled = jest.fn().mockReturnValue(false);
jest.mock('../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: (...args: unknown[]) =>
    mockUseIsExperimentalFeatureEnabled(...args),
}));

jest.mock('../api/hooks/use_risk_engine_status', () => ({
  useRiskEngineStatus: () => ({
    data: {
      risk_engine_status: 'NOT_INSTALLED',
    },
    isFetching: false,
  }),
}));

jest.mock('../../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      docLinks: {
        links: {
          securitySolution: {
            entityAnalytics: {
              assetCriticality: 'https://example.com',
            },
          },
        },
      },
    },
  }),
}));

jest.mock('../../common/hooks/use_has_entity_resolution_license', () => ({
  useHasEntityResolutionLicense: jest.fn(() => false),
}));

jest.mock('../../helper_hooks', () => ({
  useHasSecurityCapability: () => true,
}));

jest.mock('../components/asset_criticality/use_asset_criticality', () => ({
  useAssetCriticalityPrivileges: () => ({
    isLoading: false,
    data: {
      has_write_permissions: true,
      privileges: { elasticsearch: { index: {} } },
    },
  }),
}));

const mockUseEntityStoreStatus = jest.fn().mockReturnValue({
  data: { status: 'not_installed', engines: [] },
});
const mockUseDeleteEntityStoreMutation = jest.fn().mockReturnValue({
  isLoading: false,
  isError: false,
  error: null,
  mutateAsync: jest.fn(),
});
jest.mock('../components/entity_store/hooks/use_entity_store', () => ({
  useEntityStoreStatus: (...args: unknown[]) => mockUseEntityStoreStatus(...args),
  useDeleteEntityStoreMutation: (...args: unknown[]) => mockUseDeleteEntityStoreMutation(...args),
}));

const withStopPrivileges = {
  install_privileges: {
    kibana: { [ENGINE_DESCRIPTOR_CREATE_PRIVILEGE]: true },
  },
};
const withoutStopPrivileges = {
  install_privileges: {
    kibana: { [ENGINE_DESCRIPTOR_CREATE_PRIVILEGE]: false },
  },
};

const mockUseEntityEnginePrivileges = jest.fn().mockReturnValue({
  data: {
    has_all_required: true,
    has_install_permissions: true,
    ...withStopPrivileges,
  },
});
jest.mock('../components/entity_store/hooks/use_entity_engine_privileges', () => ({
  useEntityEnginePrivileges: (...args: unknown[]) => mockUseEntityEnginePrivileges(...args),
}));

jest.mock('../components/entity_store/components/engines_status', () => ({
  EngineStatus: () => <span data-test-subj="mock-engine-status">{'Mocked Engine Status Tab'}</span>,
}));

jest.mock('../components/watchlists/watchlists_tab', () => ({
  WatchlistsTab: () => <span data-test-subj="mock-watchlists-tab">{'Mocked Watchlists Tab'}</span>,
}));

jest.mock('../components/entity_store/components/entity_store_missing_privileges_callout', () => ({
  EntityStoreMissingPrivilegesCallout: () => (
    <span data-test-subj="entity-store-missing-privileges">
      {'Entity store missing privileges'}
    </span>
  ),
}));

jest.mock(
  '../components/entity_store/components/entity_store_missing_stop_privileges_callout',
  () => ({
    EntityStoreMissingStopPrivilegesCallout: () => (
      <span data-test-subj="entity-store-missing-stop-privileges">
        {'Entity store missing stop privileges'}
      </span>
    ),
  })
);

jest.mock('../components/entity_store/components/clear_entity_data_button', () => ({
  ClearEntityDataButton: () => (
    <span data-test-subj="clear-entity-data-button">{'Clear Entity Data'}</span>
  ),
}));

const mockToggleSelectedClosedAlertsSetting = jest.fn();
const mockToggleScoreRetainment = jest.fn();

const mockUseConfigurableRiskEngineSettings = jest.fn();

jest.mock(
  '../components/risk_score_management/hooks/risk_score_configurable_risk_engine_settings_hooks',
  () => ({
    useConfigurableRiskEngineSettings: () => mockUseConfigurableRiskEngineSettings(),
  })
);

jest.mock('../components/entity_analytics_toggle', () => ({
  EntityAnalyticsToggle: (props: {
    hasEnablementPrivileges: boolean;
    hasStopPrivileges: boolean;
  }) => (
    <span
      data-test-subj="mock-entity-analytics-toggle"
      data-has-enablement-privileges={String(props.hasEnablementPrivileges)}
      data-has-stop-privileges={String(props.hasStopPrivileges)}
    >
      {'Entity analytics toggle'}
    </span>
  ),
}));

jest.mock('../components/entity_resolution', () => ({
  EntityResolutionTab: () => (
    <span data-test-subj="mock-entity-resolution-tab">{'Entity resolution tab'}</span>
  ),
}));
jest.mock('../components/risk_score_management/risk_score_useful_links_section', () => ({
  RiskScoreUsefulLinksSection: () => 'Useful links',
}));
const mockRiskScorePreviewSection = jest
  .fn()
  .mockReturnValue(<p data-test-subj="mock-risk-score-preview">{'Risk score preview'}</p>);
jest.mock('../components/risk_score_management/risk_score_preview_section', () => ({
  RiskScorePreviewSection: (props: never) => mockRiskScorePreviewSection(props),
}));

jest.mock('../components/risk_score_management/alert_filters_kql_bar', () => ({
  AlertFiltersKqlBar: () => 'Alert filters',
}));

jest.mock('../components/asset_criticality_file_uploader/asset_criticality_file_uploader', () => ({
  AssetCriticalityFileUploader: () => (
    <span data-test-subj="mock-asset-criticality-file-uploader">
      {'Asset criticality file uploader'}
    </span>
  ),
}));

const defaultRiskEngineSettings = {
  includeClosedAlerts: false,
  range: {
    start: 'now-30d',
    end: 'now',
  },
  enableResetToZero: true,
  filters: [],
};

const buildConfig = (overrides: Record<string, unknown> = {}) => {
  const {
    selectedRiskEngineSettings: selectedOverrides,
    savedRiskEngineSettings: savedOverrides,
    selectedSettingsMatchSavedSettings,
    ...rest
  } = overrides;

  return {
    selectedRiskEngineSettings: {
      ...defaultRiskEngineSettings,
      ...(selectedOverrides as Record<string, unknown> | undefined),
    },
    savedRiskEngineSettings: {
      ...defaultRiskEngineSettings,
      ...(savedOverrides as Record<string, unknown> | undefined),
    },
    selectedSettingsMatchSavedSettings:
      (selectedSettingsMatchSavedSettings as boolean | undefined) ?? true,
    resetSelectedSettings: () => {},
    saveSelectedSettingsMutation: {
      mutateAsync: () => {},
      isLoading: false,
    },
    isLoadingRiskEngineSettings: false,
    setSelectedDateSetting: () => {},
    toggleSelectedClosedAlertsSetting: mockToggleSelectedClosedAlertsSetting,
    toggleScoreRetainment: mockToggleScoreRetainment,
    setAlertFilters: () => {},
    getUIAlertFilters: () => [],
    ...rest,
  };
};

describe('EntityAnalyticsManagementPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useHasEntityResolutionLicense as jest.Mock).mockReturnValue(false);
    mockUseConfigurableRiskEngineSettings.mockReturnValue(buildConfig());
    mockUseIsExperimentalFeatureEnabled.mockReturnValue(false);
    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'not_installed', engines: [] },
    });
    mockUseEntityEnginePrivileges.mockReturnValue({
      data: {
        has_all_required: true,
        has_install_permissions: true,
        ...withStopPrivileges,
      },
    });
    mockUseMissingRiskEnginePrivileges.mockReturnValue({
      isLoading: false,
      hasAllRequiredPrivileges: true,
    });
    mockUseDeleteEntityStoreMutation.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      mutateAsync: jest.fn(),
    });
  });

  const pageComponent = (initialTab?: string) => {
    const initialPath = initialTab
      ? `${ENTITY_ANALYTICS_MANAGEMENT_PATH}/${initialTab}`
      : ENTITY_ANALYTICS_MANAGEMENT_PATH;

    return (
      <IntlProvider locale="en">
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Route path={`${ENTITY_ANALYTICS_MANAGEMENT_PATH}/:tab?`}>
              <EntityAnalyticsManagementPage />
            </Route>
          </MemoryRouter>
        </QueryClientProvider>
      </IntlProvider>
    );
  };

  it('renders page title and tabs', () => {
    render(pageComponent());
    expect(screen.getByTestId(ENTITY_ANALYTICS_MANAGEMENT_PAGE_TITLE_TEST_ID)).toBeInTheDocument();
    expect(screen.getByTestId(RISK_SCORE_TAB_TEST_ID)).toBeInTheDocument();
    expect(screen.getByTestId(ASSET_CRITICALITY_TAB_TEST_ID)).toBeInTheDocument();
  });

  it('shows the Resolution tab when license is active', () => {
    (useHasEntityResolutionLicense as jest.Mock).mockReturnValue(true);
    render(pageComponent());
    expect(screen.getByTestId('entityResolutionTab')).toBeInTheDocument();
  });

  it('hides the Resolution tab when license is inactive', () => {
    (useHasEntityResolutionLicense as jest.Mock).mockReturnValue(false);
    render(pageComponent());
    expect(screen.queryByTestId('entityResolutionTab')).not.toBeInTheDocument();
  });

  it('has the risk score tab selected by default with content visible', () => {
    render(pageComponent());
    expect(screen.getByTestId('mock-entity-analytics-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('mock-risk-score-preview')).toBeInTheDocument();
  });

  it('toggles the save bar when making changes to the closed alerts toggle', () => {
    const { rerender } = render(pageComponent());

    expect(screen.queryByTestId('riskScoreSaveButton')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('includeClosedAlertsSwitch'));
    expect(mockToggleSelectedClosedAlertsSetting).toHaveBeenCalled();

    mockUseConfigurableRiskEngineSettings.mockReturnValue(
      buildConfig({
        selectedSettingsMatchSavedSettings: false,
        selectedRiskEngineSettings: {
          includeClosedAlerts: true,
        },
      })
    );
    rerender(pageComponent());
    expect(screen.getByTestId('riskScoreSaveButton')).toBeInTheDocument();
  });

  it('calls the preview section with the toggle button selection as it changes', () => {
    const { rerender } = render(pageComponent());

    expect(mockRiskScorePreviewSection).toHaveBeenCalledWith({
      alertFilters: [],
      from: 'now-30d',
      to: 'now',
      includeClosedAlerts: false,
      hasReadPermissions: true,
      isPrivilegesLoading: false,
    });

    fireEvent.click(screen.getByTestId('includeClosedAlertsSwitch'));
    expect(mockToggleSelectedClosedAlertsSetting).toHaveBeenCalled();

    mockUseConfigurableRiskEngineSettings.mockReturnValue(
      buildConfig({
        selectedSettingsMatchSavedSettings: false,
        selectedRiskEngineSettings: {
          includeClosedAlerts: true,
        },
      })
    );
    rerender(pageComponent());
    expect(mockRiskScorePreviewSection).toHaveBeenCalledWith({
      alertFilters: [],
      from: 'now-30d',
      to: 'now',
      includeClosedAlerts: true,
      hasReadPermissions: true,
      isPrivilegesLoading: false,
    });
  });

  it('switches to Asset Criticality tab when clicked', () => {
    render(pageComponent());
    fireEvent.click(screen.getByTestId(ASSET_CRITICALITY_TAB_TEST_ID));
    expect(screen.getByTestId('mock-asset-criticality-file-uploader')).toBeInTheDocument();
  });

  it('shows the Engine Status tab when entity store is installed with privileges', () => {
    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'running', engines: [{ type: 'host' }] },
    });
    mockUseEntityEnginePrivileges.mockReturnValue({
      data: {
        has_all_required: true,
        has_install_permissions: true,
        ...withStopPrivileges,
      },
    });

    render(pageComponent());
    expect(screen.getByTestId(ENGINE_STATUS_TAB_TEST_ID)).toBeInTheDocument();
  });

  it('does not show Engine Status tab when entity store is not installed', () => {
    render(pageComponent());
    expect(screen.queryByTestId(ENGINE_STATUS_TAB_TEST_ID)).not.toBeInTheDocument();
  });

  it('shows entity store missing privileges callout when privileges are insufficient', () => {
    mockUseEntityEnginePrivileges.mockReturnValue({
      data: {
        has_all_required: false,
        has_install_permissions: false,
        ...withoutStopPrivileges,
      },
    });

    render(pageComponent());
    expect(screen.getByTestId('entity-store-missing-privileges')).toBeInTheDocument();
  });

  it('hides the enable privileges callout when Entity Analytics is already on', () => {
    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'running', engines: [{ type: 'host' }] },
    });
    mockUseEntityEnginePrivileges.mockReturnValue({
      data: {
        has_all_required: false,
        has_install_permissions: false,
        ...withoutStopPrivileges,
      },
    });

    render(pageComponent());
    expect(screen.queryByTestId('entity-store-missing-privileges')).not.toBeInTheDocument();
    expect(screen.getByTestId('entity-store-missing-stop-privileges')).toBeInTheDocument();
  });

  it('shows stop privileges callout when Entity Analytics is on but stop privileges are missing', () => {
    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'running', engines: [{ type: 'host' }] },
    });
    mockUseEntityEnginePrivileges.mockReturnValue({
      data: {
        has_all_required: false,
        has_install_permissions: false,
        ...withoutStopPrivileges,
      },
    });

    render(pageComponent());
    expect(screen.getByTestId('entity-store-missing-stop-privileges')).toBeInTheDocument();
  });

  it('does not show stop privileges callout when Entity Analytics is on and stop privileges exist', () => {
    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'running', engines: [{ type: 'host' }] },
    });
    mockUseEntityEnginePrivileges.mockReturnValue({
      data: {
        has_all_required: false,
        has_install_permissions: false,
        ...withStopPrivileges,
      },
    });

    render(pageComponent());
    expect(screen.queryByTestId('entity-store-missing-stop-privileges')).not.toBeInTheDocument();
  });

  it('shows the Clear Entity Data button when entity store is installed with privileges', () => {
    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'running', engines: [{ type: 'host' }] },
    });
    mockUseEntityEnginePrivileges.mockReturnValue({
      data: {
        has_all_required: true,
        has_install_permissions: true,
        ...withStopPrivileges,
      },
    });

    render(pageComponent());
    expect(screen.getByTestId('clear-entity-data-button')).toBeInTheDocument();
  });

  it('does not show the Clear Entity Data button when entity store is not installed', () => {
    render(pageComponent());
    expect(screen.queryByTestId('clear-entity-data-button')).not.toBeInTheDocument();
  });

  it('shows the Watchlists tab when the feature flag is enabled', () => {
    mockUseIsExperimentalFeatureEnabled.mockImplementation(
      (flag: string) => flag === 'entityAnalyticsWatchlistEnabled'
    );
    render(pageComponent());
    expect(screen.getByTestId(WATCHLISTS_TAB_TEST_ID)).toBeInTheDocument();
  });

  it('does not show the Watchlists tab when the feature flag is disabled', () => {
    render(pageComponent());
    expect(screen.queryByTestId(WATCHLISTS_TAB_TEST_ID)).not.toBeInTheDocument();
  });

  it('switches to Watchlists tab when clicked', () => {
    mockUseIsExperimentalFeatureEnabled.mockImplementation(
      (flag: string) => flag === 'entityAnalyticsWatchlistEnabled'
    );
    render(pageComponent());
    fireEvent.click(screen.getByTestId(WATCHLISTS_TAB_TEST_ID));
    expect(screen.getByTestId('mock-watchlists-tab')).toBeInTheDocument();
  });

  // The toggle enables both the risk score maintainer and the Entity Store in one action, so
  // enablement requires BOTH privilege sets (an OR would let an install-only user flip it and then
  // hit a risk engine 500). OFF derives stop privileges from install_privileges.kibana (SO write), not full install.
  describe('Entity Analytics toggle gating', () => {
    const missingRiskEnginePrivileges = {
      isLoading: false,
      hasAllRequiredPrivileges: false,
      missingPrivileges: {
        clusterPrivileges: { enable: [], run: [] },
        indexPrivileges: [],
      },
    };

    it('grants enablement when the user has both risk engine and entity store install privileges', () => {
      mockUseMissingRiskEnginePrivileges.mockReturnValue({
        isLoading: false,
        hasAllRequiredPrivileges: true,
      });
      mockUseEntityEnginePrivileges.mockReturnValue({
        data: {
          has_all_required: false,
          has_install_permissions: true,
          ...withStopPrivileges,
        },
      });
      render(pageComponent());
      expect(screen.getByTestId('mock-entity-analytics-toggle')).toHaveAttribute(
        'data-has-enablement-privileges',
        'true'
      );
      expect(screen.getByTestId('mock-entity-analytics-toggle')).toHaveAttribute(
        'data-has-stop-privileges',
        'true'
      );
    });

    it('denies enablement when the user has entity store install privileges but is missing risk engine privileges', () => {
      mockUseMissingRiskEnginePrivileges.mockReturnValue(missingRiskEnginePrivileges);
      mockUseEntityEnginePrivileges.mockReturnValue({
        data: {
          has_all_required: false,
          has_install_permissions: true,
          ...withStopPrivileges,
        },
      });
      render(pageComponent());
      expect(screen.getByTestId('mock-entity-analytics-toggle')).toHaveAttribute(
        'data-has-enablement-privileges',
        'false'
      );
      expect(screen.getByTestId('mock-entity-analytics-toggle')).toHaveAttribute(
        'data-has-stop-privileges',
        'true'
      );
    });

    it('denies enablement when the user has risk engine privileges but is missing entity store install privileges', () => {
      mockUseMissingRiskEnginePrivileges.mockReturnValue({
        isLoading: false,
        hasAllRequiredPrivileges: true,
      });
      mockUseEntityEnginePrivileges.mockReturnValue({
        data: {
          has_all_required: false,
          has_install_permissions: false,
          ...withStopPrivileges,
        },
      });
      render(pageComponent());
      expect(screen.getByTestId('mock-entity-analytics-toggle')).toHaveAttribute(
        'data-has-enablement-privileges',
        'false'
      );
      expect(screen.getByTestId('mock-entity-analytics-toggle')).toHaveAttribute(
        'data-has-stop-privileges',
        'true'
      );
    });

    it('denies stop privileges when engine descriptor write is missing', () => {
      mockUseEntityEnginePrivileges.mockReturnValue({
        data: {
          has_all_required: false,
          has_install_permissions: false,
          ...withoutStopPrivileges,
        },
      });
      render(pageComponent());
      expect(screen.getByTestId('mock-entity-analytics-toggle')).toHaveAttribute(
        'data-has-stop-privileges',
        'false'
      );
    });
  });
});
