/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { EuiButton, EuiFlyout, EuiFlyoutBody, EuiSpacer, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useFormContext, useWatch } from 'react-hook-form';
import type { FormValues } from '../types';
import { useRuleFormMeta } from '../contexts';
import { RuleResultsPreview } from './rule_results_preview';
import { RecoveryResultsPreview } from './recovery_results_preview';

/**
 * Layout-aware wrapper for the rule and recovery results previews.
 *
 * - **Page layout**: Renders both previews inline (for side-by-side placement).
 *   The recovery preview is only shown when the recovery policy type is `'query'`.
 * - **Flyout layout**: Renders a trigger button that opens a nested flyout
 *   containing both previews.
 */
export const RulePreviewPanel = () => {
  const { layout } = useRuleFormMeta();
  const { control } = useFormContext<FormValues>();
  const recoveryStrategy = useWatch({ control, name: 'recoveryStrategy' });
  const showRecoveryPreview = recoveryStrategy === 'query';

  if (layout === 'page') {
    return (
      <>
        <RuleResultsPreview />
        {showRecoveryPreview && (
          <>
            <EuiSpacer size="m" />
            <RecoveryResultsPreview />
          </>
        )}
      </>
    );
  }

  return <FlyoutPreview showRecoveryPreview={showRecoveryPreview} />;
};

const FlyoutPreview = ({ showRecoveryPreview }: { showRecoveryPreview: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);

  const openFlyout = useCallback(() => setIsOpen(true), []);
  const closeFlyout = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <EuiSpacer size="m" />
      <EuiTitle size="xs">
        <h3>
          {i18n.translate('xpack.alertingV2.ruleForm.rulePreviewPanel.sectionTitle', {
            defaultMessage: 'Preview Rule results',
          })}
        </h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiButton
        onClick={openFlyout}
        iconType="inspect"
        color="text"
        data-test-subj="rulePreviewTriggerButton"
      >
        {i18n.translate('xpack.alertingV2.ruleForm.rulePreviewPanel.triggerButton', {
          defaultMessage: 'Preview results',
        })}
      </EuiButton>

      {isOpen && (
        <EuiFlyout
          type="overlay"
          onClose={closeFlyout}
          aria-label={i18n.translate('xpack.alertingV2.ruleForm.rulePreviewPanel.flyoutAriaLabel', {
            defaultMessage: 'Rule results preview',
          })}
          flyoutMenuProps={{
            title: 'Rule results preview',
            hideTitle: true,
          }}
          size="fill"
          minWidth={650}
          ownFocus
          data-test-subj="rulePreviewNestedFlyout"
        >
          <EuiFlyoutBody>
            <EuiSpacer size="m" />
            <RuleResultsPreview />
            {showRecoveryPreview && (
              <>
                <EuiSpacer size="m" />
                <RecoveryResultsPreview />
              </>
            )}
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  );
};
