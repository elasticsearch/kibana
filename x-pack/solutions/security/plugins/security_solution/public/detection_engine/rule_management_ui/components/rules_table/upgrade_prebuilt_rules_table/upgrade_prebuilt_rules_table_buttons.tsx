/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSplitButton,
} from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';
import { useBoolean } from '@kbn/react-hooks';
import type { RuleUpgradeState } from '../../../../rule_management/model/prebuilt_rule_upgrade';
import * as i18n from './translations';
import { useUpgradePrebuiltRulesTableContext } from './upgrade_prebuilt_rules_table_context';
import { usePrebuiltRulesCustomizationStatus } from '../../../../rule_management/logic/prebuilt_rules/use_prebuilt_rules_customization_status';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';
import { useForceUpgradeToTargetModal } from './use_force_upgrade_to_target_modal';

interface UpgradePrebuiltRulesTableButtonsProps {
  selectedRules: RuleUpgradeState[];
}

export const UpgradePrebuiltRulesTableButtons = ({
  selectedRules,
}: UpgradePrebuiltRulesTableButtonsProps) => {
  const {
    state: {
      hasRulesToUpgrade,
      loadingRules,
      isRefetching,
      isInitializingPrebuiltRulesPackage,
      allRulesCustomizationCounts,
    },
    actions: {
      upgradeRules,
      upgradeAllRules,
      upgradeRulesToTarget,
      upgradeAllRulesToTarget,
      getSelectedRulesCustomizationCounts,
    },
  } = useUpgradePrebuiltRulesTableContext();
  const { isRulesCustomizationEnabled } = usePrebuiltRulesCustomizationStatus();
  const canEditRules = useUserPrivileges().rulesPrivileges.rules.edit;

  const numberOfSelectedRules = selectedRules.length ?? 0;
  const shouldDisplayUpgradeSelectedRulesButton = numberOfSelectedRules > 0;

  const isRuleUpgrading = loadingRules.length > 0;
  const isRequestInProgress = isRuleUpgrading || isRefetching || isInitializingPrebuiltRulesPackage;

  const doAllSelectedRulesHaveConflicts =
    isRulesCustomizationEnabled &&
    selectedRules.every(
      ({ hasNonSolvableUnresolvedConflicts }) => hasNonSolvableUnresolvedConflicts
    );

  const { selectedRulesButtonTooltip, secondaryActionsButtonTooltip, allRulesButtonTooltip } =
    useBulkUpdateButtonsTooltipContent({
      canUserEditRules: canEditRules,
      doAllSelectedRulesHaveConflicts,
      isPrebuiltRulesCustomizationEnabled: isRulesCustomizationEnabled,
    });

  const upgradeSelectedRules = useCallback(
    () => upgradeRules(selectedRules.map((rule) => rule.rule_id)),
    [selectedRules, upgradeRules]
  );

  const { modal: forceUpgradeSelectedRulesToTargetModal, confirmForceUpgradeToTarget } =
    useForceUpgradeToTargetModal({
      dataTestSubj: 'forceUpgradeSelectedRulesToTargetConfirmModal',
    });

  const [isSelectedPopoverOpen, { toggle: toggleSelectedPopover, off: closeSelectedPopover }] =
    useBoolean(false);

  const onUpdateSelectedRulesToTarget = useCallback(async () => {
    closeSelectedPopover();

    const ruleIds = selectedRules.map((rule) => rule.rule_id);
    const counts = getSelectedRulesCustomizationCounts(ruleIds);

    if (!(await confirmForceUpgradeToTarget(counts))) {
      return;
    }

    await upgradeRulesToTarget(ruleIds);
  }, [
    closeSelectedPopover,
    confirmForceUpgradeToTarget,
    getSelectedRulesCustomizationCounts,
    selectedRules,
    upgradeRulesToTarget,
  ]);

  const selectedRulesToTargetMenuItems = useMemo(
    () => [
      <EuiContextMenuItem
        key="upgradeSelectedRulesToTarget"
        onClick={onUpdateSelectedRulesToTarget}
        data-test-subj="upgradeSelectedRulesToTargetAction"
      >
        {i18n.UPDATE_TO_ELASTIC_VERSION}
      </EuiContextMenuItem>,
    ],
    [onUpdateSelectedRulesToTarget]
  );

  const {
    modal: forceUpgradeAllRulesToTargetModal,
    confirmForceUpgradeToTarget: confirmForceUpgradeAllRulesToTarget,
  } = useForceUpgradeToTargetModal({
    dataTestSubj: 'forceUpgradeAllRulesToTargetConfirmModal',
  });

  const [isAllPopoverOpen, { toggle: toggleAllPopover, off: closeAllPopover }] = useBoolean(false);

  const onUpdateAllRulesToTarget = useCallback(async () => {
    closeAllPopover();

    if (!(await confirmForceUpgradeAllRulesToTarget(allRulesCustomizationCounts))) {
      return;
    }

    await upgradeAllRulesToTarget();
  }, [
    allRulesCustomizationCounts,
    closeAllPopover,
    confirmForceUpgradeAllRulesToTarget,
    upgradeAllRulesToTarget,
  ]);

  const allRulesToTargetMenuItems = useMemo(
    () => [
      <EuiContextMenuItem
        key="upgradeAllRulesToTarget"
        onClick={onUpdateAllRulesToTarget}
        data-test-subj="upgradeAllRulesToTargetAction"
      >
        {i18n.UPDATE_TO_ELASTIC_VERSION}
      </EuiContextMenuItem>,
    ],
    [onUpdateAllRulesToTarget]
  );

  return (
    <>
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap={true}>
        {shouldDisplayUpgradeSelectedRulesButton ? (
          <EuiFlexItem grow={false}>
            <EuiSplitButton color="primary" size="m">
              <EuiSplitButton.ActionPrimary
                onClick={upgradeSelectedRules}
                isDisabled={!canEditRules || isRequestInProgress || doAllSelectedRulesHaveConflicts}
                tooltipProps={
                  selectedRulesButtonTooltip ? { content: selectedRulesButtonTooltip } : undefined
                }
                data-test-subj="upgradeSelectedRulesButton"
              >
                <>
                  {i18n.UPDATE_SELECTED_RULES(numberOfSelectedRules)}
                  {isRuleUpgrading ? <EuiLoadingSpinner size="s" /> : undefined}
                </>
              </EuiSplitButton.ActionPrimary>
              <EuiSplitButton.ActionSecondary
                iconType="chevronSingleDown"
                isDisabled={!canEditRules || isRequestInProgress}
                tooltipProps={
                  secondaryActionsButtonTooltip
                    ? { content: secondaryActionsButtonTooltip }
                    : undefined
                }
                aria-label={i18n.UPDATE_SELECTED_RULES_MORE_ACTIONS_ARIA_LABEL}
                data-test-subj="upgradeSelectedRulesButton-secondary"
                onClick={toggleSelectedPopover}
                popoverProps={{
                  isOpen: isSelectedPopoverOpen,
                  closePopover: closeSelectedPopover,
                  panelPaddingSize: 's',
                  anchorPosition: 'downRight',
                  children: <EuiContextMenuPanel items={selectedRulesToTargetMenuItems} />,
                }}
              />
            </EuiSplitButton>
          </EuiFlexItem>
        ) : null}
        <EuiFlexItem grow={false}>
          <EuiSplitButton color="primary" fill size="m">
            <EuiSplitButton.ActionPrimary
              onClick={upgradeAllRules}
              iconType="plusCircle"
              isDisabled={!canEditRules || !hasRulesToUpgrade || isRequestInProgress}
              tooltipProps={allRulesButtonTooltip ? { content: allRulesButtonTooltip } : undefined}
              data-test-subj="upgradeAllRulesButton"
            >
              <>
                {i18n.UPDATE_ALL}
                {isRuleUpgrading ? <EuiLoadingSpinner size="s" /> : undefined}
              </>
            </EuiSplitButton.ActionPrimary>
            <EuiSplitButton.ActionSecondary
              iconType="chevronSingleDown"
              isDisabled={!canEditRules || !hasRulesToUpgrade || isRequestInProgress}
              tooltipProps={
                secondaryActionsButtonTooltip
                  ? { content: secondaryActionsButtonTooltip }
                  : undefined
              }
              aria-label={i18n.UPDATE_ALL_RULES_MORE_ACTIONS_ARIA_LABEL}
              data-test-subj="upgradeAllRulesButton-secondary"
              onClick={toggleAllPopover}
              popoverProps={{
                isOpen: isAllPopoverOpen,
                closePopover: closeAllPopover,
                panelPaddingSize: 's',
                anchorPosition: 'downRight',
                children: <EuiContextMenuPanel items={allRulesToTargetMenuItems} />,
              }}
            />
          </EuiSplitButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      {forceUpgradeSelectedRulesToTargetModal}
      {forceUpgradeAllRulesToTargetModal}
    </>
  );
};

const useBulkUpdateButtonsTooltipContent = ({
  canUserEditRules,
  doAllSelectedRulesHaveConflicts,
  isPrebuiltRulesCustomizationEnabled,
}: {
  canUserEditRules: boolean | null;
  doAllSelectedRulesHaveConflicts: boolean;
  isPrebuiltRulesCustomizationEnabled: boolean;
}) => {
  if (!canUserEditRules) {
    return {
      selectedRulesButtonTooltip: i18n.BULK_UPDATE_BUTTON_TOOLTIP_NO_PERMISSIONS,
      secondaryActionsButtonTooltip: i18n.BULK_UPDATE_BUTTON_TOOLTIP_NO_PERMISSIONS,
      allRulesButtonTooltip: i18n.BULK_UPDATE_BUTTON_TOOLTIP_NO_PERMISSIONS,
    };
  }

  if (!isPrebuiltRulesCustomizationEnabled) {
    return {
      selectedRulesButtonTooltip: undefined,
      secondaryActionsButtonTooltip: undefined,
      allRulesButtonTooltip: undefined,
    };
  }

  if (doAllSelectedRulesHaveConflicts) {
    // The secondary ("Update to Elastic version") action is never conflict-gated (CONF-03),
    // so it must not inherit the primary's conflicts tooltip — that sentence would state a
    // reason that does not apply to the one action that can resolve the conflict.
    return {
      selectedRulesButtonTooltip: i18n.BULK_UPDATE_SELECTED_RULES_BUTTON_TOOLTIP_CONFLICTS,
      secondaryActionsButtonTooltip: undefined,
      allRulesButtonTooltip: undefined,
    };
  }

  return {
    selectedRulesButtonTooltip: undefined,
    secondaryActionsButtonTooltip: undefined,
    allRulesButtonTooltip: undefined,
  };
};
