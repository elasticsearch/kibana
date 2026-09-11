/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiLoadingSpinner,
  EuiText,
} from '@elastic/eui';

import { RiskScorePreviewSection } from './risk_score_preview_section';
import { RiskScoreUsefulLinksSection } from './risk_score_useful_links_section';
import { RiskScoreConfigurationSection } from './risk_score_configuration_section';
import { RiskScoreSaveBar } from './risk_score_save_bar';
import { RiskScoreGeneralSection } from './risk_score_general_section';
import { useIsExperimentalFeatureEnabled } from '../../../common/hooks/use_experimental_features';
import * as i18n from '../../translations';
import type { RiskScoreConfiguration, UIAlertFilter } from './common';

interface RiskScoreTabProps {
  hasReadPermissions: boolean;
  isPrivilegesLoading: boolean;
  savedRiskEngineSettings?: RiskScoreConfiguration;
  selectedRiskEngineSettings?: RiskScoreConfiguration;
  selectedSettingsMatchSavedSettings: boolean;
  resetSelectedSettings: () => void;
  onSaveSettings: (settings: RiskScoreConfiguration) => Promise<void>;
  isSavingSettings: boolean;
  setSelectedDateSetting: (range: { start: string; end: string }) => void;
  toggleSelectedClosedAlertsSetting: () => void;
  isLoadingRiskEngineSettings: boolean;
  toggleScoreRetainment: () => void;
  setAlertFilters: (filters: UIAlertFilter[]) => void;
  getUIAlertFilters: () => UIAlertFilter[];
}

export const RiskScoreTab: React.FC<RiskScoreTabProps> = ({
  hasReadPermissions,
  isPrivilegesLoading,
  savedRiskEngineSettings,
  selectedRiskEngineSettings,
  selectedSettingsMatchSavedSettings,
  resetSelectedSettings,
  onSaveSettings,
  isSavingSettings,
  setSelectedDateSetting,
  toggleSelectedClosedAlertsSetting,
  isLoadingRiskEngineSettings,
  toggleScoreRetainment,
  setAlertFilters,
  getUIAlertFilters,
}) => {
  const riskScoreResetToZeroIsEnabled = useIsExperimentalFeatureEnabled(
    'enableRiskScoreResetToZero'
  );

  return (
    <>
      <EuiFlexGroup gutterSize="xl" alignItems="flexStart">
        {!selectedRiskEngineSettings && (
          <EuiFlexItem>
            <EuiLoadingSpinner size="m" />
            <EuiText size="s">
              <p>{i18n.LOADING_RISK_ENGINE_SETTINGS}</p>
            </EuiText>
          </EuiFlexItem>
        )}
        {selectedRiskEngineSettings && (
          <>
            <EuiFlexItem grow={2}>
              {riskScoreResetToZeroIsEnabled && (
                <RiskScoreGeneralSection
                  riskEngineSettings={selectedRiskEngineSettings}
                  toggleScoreRetainment={toggleScoreRetainment}
                />
              )}
              <RiskScoreConfigurationSection
                selectedRiskEngineSettings={selectedRiskEngineSettings}
                setSelectedDateSetting={setSelectedDateSetting}
                toggleSelectedClosedAlertsSetting={toggleSelectedClosedAlertsSetting}
                onAlertFiltersChange={setAlertFilters}
                uiAlertFilters={getUIAlertFilters()}
              />
              <EuiHorizontalRule />
              <RiskScoreUsefulLinksSection />
            </EuiFlexItem>
            <EuiFlexItem grow={2}>
              <RiskScorePreviewSection
                hasReadPermissions={hasReadPermissions}
                isPrivilegesLoading={isPrivilegesLoading}
                includeClosedAlerts={selectedRiskEngineSettings.includeClosedAlerts}
                from={selectedRiskEngineSettings.range.start}
                to={selectedRiskEngineSettings.range.end}
                alertFilters={selectedRiskEngineSettings.filters}
              />
            </EuiFlexItem>
          </>
        )}
      </EuiFlexGroup>
      {((savedRiskEngineSettings && !selectedSettingsMatchSavedSettings) ||
        (!savedRiskEngineSettings &&
          selectedRiskEngineSettings &&
          selectedRiskEngineSettings.filters &&
          selectedRiskEngineSettings.filters.length > 0)) && (
        <RiskScoreSaveBar
          resetSelectedSettings={resetSelectedSettings}
          saveSelectedSettings={() => {
            if (selectedRiskEngineSettings) {
              onSaveSettings(selectedRiskEngineSettings);
            }
          }}
          isLoading={isLoadingRiskEngineSettings || isSavingSettings}
        />
      )}
    </>
  );
};
