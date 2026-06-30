/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EuiIcon, EuiIconTip, EuiSpacer, EuiText } from '@elastic/eui';
import {
  DefaultRepositoryRequiredBadge,
  DefaultSnapshotRepositoryRequiredModal,
  EnterpriseGatingModal,
  EnterpriseLicenseRequiredBadge,
  FrozenDefaultRepositoryRequiredCallout,
  FrozenEnterpriseRequiredCallout,
  SearchableSnapshotRepositoryInfo,
} from '@kbn/data-lifecycle-phases';
import { dlmPhasesSelectorStrings as strings } from '../strings';
import type { DlmPhaseDuration, DlmPhasesSelectorEnterpriseConfig } from '../types';
import { DurationFields } from './duration_fields';
import { PhaseCard } from './phase_card';

export interface FrozenPhaseCardProps {
  id: string;
  color: string;
  duration: DlmPhaseDuration;
  durationError?: string;
  helpText?: React.ReactNode;
  isFormDisabled: boolean;
  defaultSnapshotRepository?: string;
  manageRepositoriesHref?: string;
  hasEnterpriseLicense: boolean;
  hasDefaultSnapshotRepository: boolean;
  canCreateDefaultSnapshotRepository: boolean;
  createDefaultRepositoryUrl: string;
  enterprise: DlmPhasesSelectorEnterpriseConfig;
  onRefreshDefaultSnapshotRepository?: () => void | Promise<void>;
  onChange: (duration: DlmPhaseDuration) => void;
}

export const FrozenPhaseCard = ({
  id,
  color,
  duration,
  durationError,
  helpText,
  isFormDisabled,
  defaultSnapshotRepository,
  manageRepositoriesHref,
  hasEnterpriseLicense,
  hasDefaultSnapshotRepository,
  canCreateDefaultSnapshotRepository,
  createDefaultRepositoryUrl,
  enterprise,
  onRefreshDefaultSnapshotRepository,
  onChange,
}: FrozenPhaseCardProps) => {
  const wasInitiallyActiveRef = useRef(duration.enabled);
  const isRequirementMissing = !hasEnterpriseLicense || !hasDefaultSnapshotRepository;
  const isGraceActive = wasInitiallyActiveRef.current && duration.enabled && isRequirementMissing;
  const showEnterpriseCallout = isGraceActive && !hasEnterpriseLicense;
  const showDefaultRepositoryCallout = isGraceActive && !hasDefaultSnapshotRepository;
  const hasActiveCallout = showEnterpriseCallout || showDefaultRepositoryCallout;

  const [openModal, setOpenModal] = useState<'enterprise' | 'defaultRepository' | undefined>();
  const [isRefreshingDefaultRepository, setIsRefreshingDefaultRepository] = useState(false);

  const closeModal = useCallback(() => setOpenModal(undefined), []);

  useEffect(() => {
    if (hasDefaultSnapshotRepository && openModal === 'defaultRepository') {
      closeModal();
    }
  }, [closeModal, hasDefaultSnapshotRepository, openModal]);

  const openEnterpriseModal = useCallback(() => setOpenModal('enterprise'), []);
  const openCreateDefaultRepositoryModal = canCreateDefaultSnapshotRepository
    ? () => setOpenModal('defaultRepository')
    : undefined;

  const refreshDefaultRepository = useCallback(async () => {
    if (!onRefreshDefaultSnapshotRepository) {
      return;
    }

    setIsRefreshingDefaultRepository(true);

    try {
      await onRefreshDefaultSnapshotRepository();
    } finally {
      setIsRefreshingDefaultRepository(false);
    }
  }, [onRefreshDefaultSnapshotRepository]);

  const disabledBadge =
    isGraceActive || !isRequirementMissing ? undefined : !hasEnterpriseLicense ? (
      <EnterpriseLicenseRequiredBadge onClick={openEnterpriseModal} />
    ) : (
      <DefaultRepositoryRequiredBadge onClick={openCreateDefaultRepositoryModal} />
    );
  const isCardDisabled = isFormDisabled || Boolean(disabledBadge);
  const isDurationFieldsDisabled = isCardDisabled || hasActiveCallout;
  const showConfig = !disabledBadge;

  return (
    <>
      <PhaseCard
        id={id}
        checked={duration.enabled}
        dataTestSubj="dlmPhasesSelectorFrozenPhaseCard"
        disabled={isCardDisabled}
        checkboxAriaLabel={strings.frozenPhaseCheckboxAriaLabel}
        title={strings.frozenPhaseLabel}
        description={strings.frozenPhaseDescription}
        icon={<EuiIcon type="dot" color={color} size="m" aria-hidden />}
        badges={disabledBadge}
        onChange={(checked) => onChange({ ...duration, enabled: checked })}
      >
        {showConfig && (
          <>
            {showEnterpriseCallout && (
              <>
                <FrozenEnterpriseRequiredCallout
                  onUpgradeEnterprise={openEnterpriseModal}
                  calloutTestSubj="frozenEnterpriseRequiredCallout"
                  upgradeButtonTestSubj="frozenUpgradeEnterpriseButton"
                />
                <EuiSpacer size="m" />
              </>
            )}

            <DurationFields
              label={strings.moveAfterLabel}
              phaseLabel={strings.frozenPhaseLabel}
              testSubjectPrefix="frozen"
              duration={duration}
              error={durationError}
              helpText={helpText}
              disabled={isDurationFieldsDisabled}
              onChange={onChange}
            />

            <EuiSpacer size="m" />

            <EuiText size="s" data-test-subj="frozenSearchableSnapshotLabel">
              <strong>
                {strings.searchableSnapshotLabel}{' '}
                <EuiIconTip
                  content={strings.searchableSnapshotTooltip}
                  type="info"
                  color="subdued"
                />
              </strong>
            </EuiText>

            {showDefaultRepositoryCallout ? (
              <>
                <EuiSpacer size="s" />

                <FrozenDefaultRepositoryRequiredCallout
                  createDefaultRepositoryHref={
                    canCreateDefaultSnapshotRepository ? createDefaultRepositoryUrl : undefined
                  }
                  onRefresh={refreshDefaultRepository}
                  isRefreshing={isRefreshingDefaultRepository}
                  calloutTestSubj="frozenDefaultRepositoryRequiredCallout"
                  createButtonTestSubj="frozenCreateDefaultRepositoryButton"
                  refreshButtonTestSubj="frozenRefreshDefaultRepositoryButton"
                />
              </>
            ) : (
              defaultSnapshotRepository && (
                <>
                  <EuiSpacer size="xs" />

                  <EuiText size="s" color="subdued" data-test-subj="frozenSearchableSnapshotInfo">
                    <SearchableSnapshotRepositoryInfo
                      defaultRepository={defaultSnapshotRepository}
                      manageRepositoriesHref={manageRepositoriesHref}
                    />
                  </EuiText>
                </>
              )
            )}
          </>
        )}
      </PhaseCard>

      {openModal === 'enterprise' && (
        <EnterpriseGatingModal
          environment={enterprise.isCloudEnabled ? 'cloud' : 'selfManaged'}
          hasManageSubscriptionPermission={
            enterprise.isCloudEnabled ? true : enterprise.canManageLicense
          }
          trialStatus={enterprise.trialDaysLeft === 0 ? 'expired' : 'notStarted'}
          subscriptionFeaturesUrl={enterprise.subscriptionFeaturesUrl}
          onPrimaryAction={enterprise.onUpgrade}
          onCancel={closeModal}
        />
      )}

      {openModal === 'defaultRepository' && (
        <DefaultSnapshotRepositoryRequiredModal
          createDefaultRepositoryUrl={createDefaultRepositoryUrl}
          isRefreshing={isRefreshingDefaultRepository}
          onCancel={closeModal}
          onRefresh={refreshDefaultRepository}
        />
      )}
    </>
  );
};
