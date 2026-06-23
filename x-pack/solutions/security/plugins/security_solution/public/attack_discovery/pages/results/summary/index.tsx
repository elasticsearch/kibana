/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSwitch,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';

import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import { AnonymizationSettingsManagement } from '@kbn/elastic-assistant/impl/data_anonymization/settings/anonymization_settings_management';
import { SelectedActions } from './selected_actions';
import { SummaryCount } from './summary_count';
import { ANONYMIZATION_ARIAL_LABEL, SHOW_ANONYMIZED_LABEL } from '../../translations';

interface Props {
  alertsCount: number;
  attackDiscoveriesCount: number;
  isLoading?: boolean;
  lastUpdated: Date | null;
  onToggleShowAnonymized: () => void;
  refetchFindAttackDiscoveries?: () => void;
  selectedAttackDiscoveries: Record<string, boolean>;
  selectedConnectorAttackDiscoveries: AttackDiscoveryAlert[];
  setSelectedAttackDiscoveries: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  showAnonymized: boolean;
}

const SummaryComponent: React.FC<Props> = ({
  alertsCount,
  attackDiscoveriesCount,
  isLoading = false,
  lastUpdated,
  onToggleShowAnonymized,
  refetchFindAttackDiscoveries,
  selectedAttackDiscoveries,
  selectedConnectorAttackDiscoveries,
  setSelectedAttackDiscoveries,
  showAnonymized,
}) => {
  const { euiTheme } = useEuiTheme();

  const [isAnonymizationModalVisible, setIsAnonymizationModalVisible] = useState(false);
  const closeAnonymizationModal = useCallback(() => setIsAnonymizationModalVisible(false), []);
  const showAnonymizationModal = useCallback(() => setIsAnonymizationModalVisible(true), []);

  return (
    <>
      <EuiFlexGroup
        alignItems="center"
        data-test-subj="summary"
        justifyContent="spaceBetween"
        responsive={false}
        wrap={false}
      >
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="none" responsive={false} wrap={true}>
            <EuiFlexItem grow={false}>
              <SummaryCount
                alertsCount={alertsCount}
                attackDiscoveriesCount={attackDiscoveriesCount}
                lastUpdated={lastUpdated}
              />
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <SelectedActions
                refetchFindAttackDiscoveries={refetchFindAttackDiscoveries}
                selectedConnectorAttackDiscoveries={selectedConnectorAttackDiscoveries}
                selectedAttackDiscoveries={selectedAttackDiscoveries}
                setSelectedAttackDiscoveries={setSelectedAttackDiscoveries}
              />
            </EuiFlexItem>

            {isLoading && (
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner
                  css={css`
                    margin-left: ${euiTheme.size.s};
                  `}
                  size="s"
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiFlexGroup
            alignItems="center"
            data-test-subj="anonymizationGroup"
            gutterSize="s"
            responsive={false}
            wrap={false}
          >
            <EuiFlexItem grow={false}>
              <EuiSwitch
                checked={showAnonymized}
                compressed={true}
                data-test-subj="toggleAnonymized"
                label={SHOW_ANONYMIZED_LABEL}
                onChange={onToggleShowAnonymized}
              />
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <EuiToolTip content={ANONYMIZATION_ARIAL_LABEL} disableScreenReaderOutput>
                <EuiButtonIcon
                  aria-label={ANONYMIZATION_ARIAL_LABEL}
                  data-test-subj="anonymizationSettings"
                  iconType="gear"
                  onClick={showAnonymizationModal}
                  size="s"
                  color="text"
                />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      {isAnonymizationModalVisible && (
        <AnonymizationSettingsManagement modalMode onClose={closeAnonymizationModal} />
      )}
    </>
  );
};

SummaryComponent.displayName = 'Summary';

export const Summary = React.memo(SummaryComponent);
