/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import {
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPageHeader,
  EuiSpacer,
  EuiTab,
  EuiTabs,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useHistory, useParams } from 'react-router-dom';

import { EntityAnalyticsToggle } from '../components/entity_analytics_toggle';
import { ENTITY_ANALYTICS } from '../../app/translations';
import { RiskEnginePrivilegesCallOut } from '../components/risk_engine_privileges_callout';
import { useMissingRiskEnginePrivileges } from '../hooks/use_missing_risk_engine_privileges';
import { useConfigurableRiskEngineSettings } from '../components/risk_score_management/hooks/risk_score_configurable_risk_engine_settings_hooks';
import { RiskScoreTab } from '../components/risk_score_management/risk_score_tab';
import { AssetCriticalityTab } from '../components/asset_criticality/asset_criticality_tab';
import { WatchlistsTab } from '../components/watchlists/watchlists_tab';
import { EntityResolutionTab } from '../components/entity_resolution';
import { EntityStoreMissingPrivilegesCallout } from '../components/entity_store/components/entity_store_missing_privileges_callout';
import { EngineStatus } from '../components/entity_store/components/engines_status';
import { ClearEntityDataButton } from '../components/entity_store/components/clear_entity_data_button';
import { useIsExperimentalFeatureEnabled } from '../../common/hooks/use_experimental_features';
import { useHasEntityResolutionLicense } from '../../common/hooks/use_has_entity_resolution_license';
import {
  useDeleteEntityStoreMutation,
  useEntityStoreStatus,
} from '../components/entity_store/hooks/use_entity_store';
import { useEntityEnginePrivileges } from '../components/entity_store/hooks/use_entity_engine_privileges';
import { ENTITY_ANALYTICS_MANAGEMENT_PATH } from '../../../common/constants';
import { userHasRiskEngineReadPermissions, safeErrorMessage } from '../common';
import {
  ENTITY_ANALYTICS_MANAGEMENT_PAGE_TEST_ID,
  ENTITY_ANALYTICS_MANAGEMENT_PAGE_TITLE_TEST_ID,
  ENTITY_ANALYTICS_MANAGEMENT_TABS_TEST_ID,
  RISK_SCORE_TAB_TEST_ID,
  ASSET_CRITICALITY_TAB_TEST_ID,
  WATCHLISTS_TAB_TEST_ID,
  ENGINE_STATUS_TAB_TEST_ID,
} from '../test_ids';

export enum TabId {
  RiskScore = 'risk_score',
  AssetCriticality = 'asset_criticality',
  Watchlists = 'watchlists',
  EntityResolution = 'entity_resolution',
  Status = 'status',
}

const VALID_TABS = Object.values(TabId);

const isEntityStoreInstalled = (status?: string) => status && status !== 'not_installed';
const canDeleteEntityEngine = (status?: string) =>
  !['not_installed', 'installing'].includes(status || '');

export const EntityAnalyticsManagementPage = () => {
  const riskEnginePrivileges = useMissingRiskEnginePrivileges();

  const riskEngineSettings = useConfigurableRiskEngineSettings();
  const {
    savedRiskEngineSettings,
    selectedRiskEngineSettings,
    selectedSettingsMatchSavedSettings,
    resetSelectedSettings,
    saveSelectedSettingsMutation,
    setSelectedDateSetting,
    toggleSelectedClosedAlertsSetting,
    isLoadingRiskEngineSettings,
    toggleScoreRetainment,
    setAlertFilters,
    getUIAlertFilters,
  } = riskEngineSettings;

  const handleSaveToggleSettings = useCallback(async () => {
    if (selectedRiskEngineSettings) {
      await saveSelectedSettingsMutation.mutateAsync(selectedRiskEngineSettings);
    }
  }, [selectedRiskEngineSettings, saveSelectedSettingsMutation]);

  const isWatchlistsEnabled = useIsExperimentalFeatureEnabled('entityAnalyticsWatchlistEnabled');
  const hasEntityResolutionLicense = useHasEntityResolutionLicense();

  const entityStoreStatus = useEntityStoreStatus();
  const { data: entityEnginePrivileges, isLoading: isLoadingPrivileges } =
    useEntityEnginePrivileges();
  const deleteEntityStoreMutation = useDeleteEntityStoreMutation();

  const userHasRiskEnginePrivileges =
    !riskEnginePrivileges.isLoading &&
    'hasAllRequiredPrivileges' in riskEnginePrivileges &&
    riskEnginePrivileges.hasAllRequiredPrivileges;

  const userHasEntityStorePrivileges = entityEnginePrivileges?.has_all_required ?? false;
  const hasAllRequiredPrivileges = userHasRiskEnginePrivileges || userHasEntityStorePrivileges;

  const canRunEngine =
    (!riskEnginePrivileges.isLoading &&
      (riskEnginePrivileges.hasAllRequiredPrivileges ||
        (!riskEnginePrivileges.hasAllRequiredPrivileges &&
          riskEnginePrivileges.missingPrivileges?.clusterPrivileges?.run?.length === 0))) ||
    false;

  const hasReadPermissions = userHasRiskEngineReadPermissions(riskEnginePrivileges);

  const shouldDisplayEngineStatusTab =
    isEntityStoreInstalled(entityStoreStatus.data?.status) &&
    entityEnginePrivileges?.has_all_required;

  const history = useHistory();
  const { tab } = useParams<{ tab?: string }>();

  const selectedTabId = useMemo(() => {
    if (tab && VALID_TABS.includes(tab as TabId)) {
      return tab as TabId;
    }
    return TabId.RiskScore;
  }, [tab]);

  const handleTabChange = useCallback(
    (tabId: TabId) => {
      history.push(`${ENTITY_ANALYTICS_MANAGEMENT_PATH}/${tabId}`);
    },
    [history]
  );

  const isStatusDataLoading = entityStoreStatus.isLoading || isLoadingPrivileges;

  useEffect(() => {
    if (selectedTabId === TabId.Status && !isStatusDataLoading && !shouldDisplayEngineStatusTab) {
      history.replace(`${ENTITY_ANALYTICS_MANAGEMENT_PATH}/${TabId.RiskScore}`);
    }
    if (selectedTabId === TabId.EntityResolution && !hasEntityResolutionLicense) {
      history.replace(`${ENTITY_ANALYTICS_MANAGEMENT_PATH}/${TabId.RiskScore}`);
    }
  }, [
    shouldDisplayEngineStatusTab,
    isStatusDataLoading,
    hasEntityResolutionLicense,
    selectedTabId,
    history,
  ]);

  const deleteError = safeErrorMessage(deleteEntityStoreMutation.error);

  return (
    <>
      <RiskEnginePrivilegesCallOut privileges={riskEnginePrivileges} />
      <EuiPageHeader
        data-test-subj={ENTITY_ANALYTICS_MANAGEMENT_PAGE_TEST_ID}
        pageTitle={
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
            <EuiFlexItem
              data-test-subj={ENTITY_ANALYTICS_MANAGEMENT_PAGE_TITLE_TEST_ID}
              grow={false}
            >
              {ENTITY_ANALYTICS}
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <EuiFlexGroup justifyContent="center" alignItems="center" gutterSize="m">
                <EntityAnalyticsToggle
                  selectedSettingsMatchSavedSettings={selectedSettingsMatchSavedSettings}
                  onSaveSettings={handleSaveToggleSettings}
                  isSavingSettings={saveSelectedSettingsMutation.isLoading}
                  hasAllRequiredPrivileges={hasAllRequiredPrivileges}
                  isPrivilegesLoading={riskEnginePrivileges.isLoading}
                />
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        }
      />

      {!entityEnginePrivileges || entityEnginePrivileges.has_all_required ? null : (
        <>
          <EuiSpacer size="l" />
          <EntityStoreMissingPrivilegesCallout privileges={entityEnginePrivileges} />
          <EuiSpacer size="l" />
        </>
      )}

      {deleteError && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut
            announceOnMount
            title={
              <FormattedMessage
                id="xpack.securitySolution.entityAnalytics.entityAnalyticsManagementPage.errors.deleteErrorTitle"
                defaultMessage="There was a problem deleting the entity store"
              />
            }
            color="danger"
            iconType="alert"
          >
            <p>{deleteError}</p>
          </EuiCallOut>
        </>
      )}

      {canDeleteEntityEngine(entityStoreStatus.data?.status) &&
        entityEnginePrivileges?.has_all_required && (
          <>
            <EuiSpacer size="m" />
            <EuiFlexGroup justifyContent="flexEnd">
              <EuiFlexItem grow={false}>
                <ClearEntityDataButton
                  onDelete={async () => {
                    await deleteEntityStoreMutation.mutateAsync();
                  }}
                  isDeleting={deleteEntityStoreMutation.isLoading}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </>
        )}

      <EuiSpacer size="m" />

      <EuiTabs data-test-subj={ENTITY_ANALYTICS_MANAGEMENT_TABS_TEST_ID}>
        <EuiTab
          key={TabId.RiskScore}
          isSelected={selectedTabId === TabId.RiskScore}
          onClick={() => handleTabChange(TabId.RiskScore)}
          data-test-subj={RISK_SCORE_TAB_TEST_ID}
        >
          <FormattedMessage
            id="xpack.securitySolution.entityAnalytics.entityAnalyticsManagementPage.riskScore.tabTitle"
            defaultMessage="Entity Risk Score"
          />
        </EuiTab>
        <EuiTab
          key={TabId.AssetCriticality}
          isSelected={selectedTabId === TabId.AssetCriticality}
          onClick={() => handleTabChange(TabId.AssetCriticality)}
          data-test-subj={ASSET_CRITICALITY_TAB_TEST_ID}
        >
          <FormattedMessage
            id="xpack.securitySolution.entityAnalytics.entityAnalyticsManagementPage.assetCriticality.tabTitle"
            defaultMessage="Asset Criticality"
          />
        </EuiTab>
        {isWatchlistsEnabled && (
          <EuiTab
            key={TabId.Watchlists}
            isSelected={selectedTabId === TabId.Watchlists}
            onClick={() => handleTabChange(TabId.Watchlists)}
            data-test-subj={WATCHLISTS_TAB_TEST_ID}
          >
            <FormattedMessage
              id="xpack.securitySolution.entityAnalytics.entityAnalyticsManagementPage.watchlists.tabTitle"
              defaultMessage="Watchlists"
            />
          </EuiTab>
        )}
        {hasEntityResolutionLicense && (
          <EuiTab
            key={TabId.EntityResolution}
            isSelected={selectedTabId === TabId.EntityResolution}
            onClick={() => handleTabChange(TabId.EntityResolution)}
            data-test-subj="entityResolutionTab"
          >
            <FormattedMessage
              id="xpack.securitySolution.entityAnalytics.entityAnalyticsManagementPage.entityResolution.tabTitle"
              defaultMessage="Entity Resolution"
            />
          </EuiTab>
        )}
        {shouldDisplayEngineStatusTab && (
          <EuiTab
            key={TabId.Status}
            isSelected={selectedTabId === TabId.Status}
            onClick={() => handleTabChange(TabId.Status)}
            data-test-subj={ENGINE_STATUS_TAB_TEST_ID}
          >
            <FormattedMessage
              id="xpack.securitySolution.entityAnalytics.entityAnalyticsManagementPage.engineStatus.tabTitle"
              defaultMessage="Engine Status"
            />
          </EuiTab>
        )}
      </EuiTabs>

      <EuiSpacer size="s" />

      <div hidden={selectedTabId !== TabId.RiskScore}>
        <RiskScoreTab
          canRunEngine={canRunEngine}
          hasReadPermissions={hasReadPermissions}
          isPrivilegesLoading={riskEnginePrivileges.isLoading}
          savedRiskEngineSettings={savedRiskEngineSettings}
          selectedRiskEngineSettings={selectedRiskEngineSettings}
          selectedSettingsMatchSavedSettings={selectedSettingsMatchSavedSettings}
          resetSelectedSettings={resetSelectedSettings}
          onSaveSettings={(settings) => saveSelectedSettingsMutation.mutateAsync(settings)}
          isSavingSettings={saveSelectedSettingsMutation.isLoading}
          setSelectedDateSetting={setSelectedDateSetting}
          toggleSelectedClosedAlertsSetting={toggleSelectedClosedAlertsSetting}
          isLoadingRiskEngineSettings={isLoadingRiskEngineSettings}
          toggleScoreRetainment={toggleScoreRetainment}
          setAlertFilters={setAlertFilters}
          getUIAlertFilters={getUIAlertFilters}
        />
      </div>

      <div hidden={selectedTabId !== TabId.AssetCriticality}>
        <AssetCriticalityTab />
      </div>

      {isWatchlistsEnabled && (
        <div hidden={selectedTabId !== TabId.Watchlists}>
          <WatchlistsTab />
        </div>
      )}

      {hasEntityResolutionLicense && (
        <div hidden={selectedTabId !== TabId.EntityResolution}>
          <EntityResolutionTab />
        </div>
      )}

      {shouldDisplayEngineStatusTab && (
        <div hidden={selectedTabId !== TabId.Status}>
          <EngineStatus />
        </div>
      )}
    </>
  );
};

EntityAnalyticsManagementPage.displayName = 'EntityAnalyticsManagementPage';
