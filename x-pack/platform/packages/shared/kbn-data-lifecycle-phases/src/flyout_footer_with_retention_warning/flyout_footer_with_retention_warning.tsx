/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutFooter,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { getFlyoutFooterWithRetentionWarningStyles } from './styles';
import { getIlmPolicySummaryStats } from '../edit_data_lifecycle_flyout/ilm_policy_summary_stats';
import type { IlmPolicyForFlyout } from '../edit_data_lifecycle_flyout/types';
import { flyoutFooterWithRetentionWarningStrings as footerStrings } from './strings';

/**
 * Returns true when the selected ILM policy contains downsampling steps that
 * cannot be applied because the target stream is not a time series.
 */
export const useRetentionWarning = ({
  ilmPolicies,
  selectedIlmPolicyName,
  canUseDownsampling = true,
  inheritLifecycle = false,
}: {
  ilmPolicies: IlmPolicyForFlyout[];
  selectedIlmPolicyName?: string;
  canUseDownsampling?: boolean;
  inheritLifecycle?: boolean;
}): boolean => {
  return useMemo(() => {
    if (inheritLifecycle || !selectedIlmPolicyName) return false;

    const policy = ilmPolicies.find((p) => p.name === selectedIlmPolicyName);
    if (!policy) return false;

    const { downsampleStepCount } = getIlmPolicySummaryStats(policy.phases);
    return !canUseDownsampling && downsampleStepCount > 0;
  }, [ilmPolicies, selectedIlmPolicyName, canUseDownsampling, inheritLifecycle]);
};

export interface FlyoutFooterWithRetentionWarningProps {
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Label for the apply/confirm button. Defaults to "Apply". */
  applyLabel?: string;
  onCancel: () => void;
  onApply: () => void;
  isApplyDisabled?: boolean;
  /** When true, renders the downsampling warning callout above the action buttons. */
  showWarning?: boolean;
}

/**
 * Standalone flyout footer that combines an optional downsampling warning callout
 * with Cancel / Apply action buttons.
 */
export const FlyoutFooterWithRetentionWarning = ({
  cancelLabel = footerStrings.cancelButton,
  applyLabel = footerStrings.applyButton,
  onCancel,
  onApply,
  isApplyDisabled = false,
  showWarning = false,
}: FlyoutFooterWithRetentionWarningProps) => {
  const { euiTheme } = useEuiTheme();
  const styles = getFlyoutFooterWithRetentionWarningStyles({ euiTheme });

  return (
    <EuiFlyoutFooter>
      {showWarning && (
        <EuiCallOut
          title={footerStrings.downsamplingNotAppliedTitle}
          color="primary"
          size="s"
          announceOnMount
          css={styles.callout}
          data-test-subj="flyoutFooter-downsamplingNotAppliedCallout"
        >
          <EuiText size="s">{footerStrings.downsamplingNotAppliedBody}</EuiText>
        </EuiCallOut>
      )}

      <EuiFlexGroup
        justifyContent="spaceBetween"
        alignItems="center"
        responsive={false}
        css={styles.padding}
      >
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            onClick={onCancel}
            flush="left"
            data-test-subj="dataLifecycleFlyoutCancelButton"
          >
            {cancelLabel}
          </EuiButtonEmpty>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            onClick={onApply}
            disabled={isApplyDisabled}
            data-test-subj="dataLifecycleFlyoutApplyButton"
          >
            {applyLabel}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlyoutFooter>
  );
};
