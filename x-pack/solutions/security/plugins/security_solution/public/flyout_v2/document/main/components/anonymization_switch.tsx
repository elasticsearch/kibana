/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiSwitchEvent } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiIconTip, EuiSwitch, EuiToolTip } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

export const DOCUMENT_SUMMARY_ANONYMIZE_TOGGLE_TEST_ID =
  'document-flyout-ai-summary-anonymize-toggle';

/**
 * Conditionally wrap a component
 */
const ConditionalWrap = ({
  condition,
  wrap,
  children,
}: {
  condition: boolean;
  wrap: (children: React.ReactElement) => React.ReactElement;
  children: React.ReactElement;
}) => (condition ? wrap(children) : children);

export interface AnonymizationSwitchProps {
  /**
   * If true, the switch is enabled. If false, the switch is wrapped with a
   * tooltip explaining why it is disabled.
   */
  hasSummary: boolean;
  /**
   * Current value of the anonymization toggle. When `undefined` (the active
   * Kibana space id has not yet been resolved) the switch is not rendered,
   * preserving the EASE flyout's original behaviour.
   */
  showAnonymizedValues: boolean | undefined;
  /**
   * Setter for the anonymization toggle. The shared section component owns
   * the underlying state via `useAnonymizationToggle` and forwards both the
   * value and the setter to this presentational switch.
   */
  setShowAnonymizedValues: React.Dispatch<React.SetStateAction<boolean | undefined>>;
}

/**
 * Toggle switch rendered inside the AI summary section's options menu.
 *
 * Enables the user to toggle between displaying anonymized vs original field
 * values in the rendered AI summary text. The shared section component owns
 * the underlying state and passes the value/setter as props so the switch
 * stays context-agnostic and can render inside any of the three flyouts that
 * surface the AI summary section.
 */
export const AnonymizationSwitch = memo(
  ({ hasSummary, showAnonymizedValues, setShowAnonymizedValues }: AnonymizationSwitchProps) => {
    const onChangeShowAnonymizedValues = useCallback(
      (e: EuiSwitchEvent) => {
        setShowAnonymizedValues(e.target.checked);
      },
      [setShowAnonymizedValues]
    );

    if (showAnonymizedValues === undefined) {
      return null;
    }

    return (
      <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
        <EuiFlexItem grow={false}>
          <ConditionalWrap
            condition={!hasSummary}
            wrap={(children) => (
              <EuiToolTip
                position="top"
                key={'disabled-anonymize-values-tooltip'}
                content={
                  <FormattedMessage
                    id="xpack.securitySolution.flyout.settings.anonymizeValues.disabled.tooltip"
                    defaultMessage="The alert summary has not generated, and does not contain anonymized fields."
                  />
                }
              >
                {children}
              </EuiToolTip>
            )}
          >
            <EuiSwitch
              data-test-subj={DOCUMENT_SUMMARY_ANONYMIZE_TOGGLE_TEST_ID}
              checked={showAnonymizedValues}
              compressed
              disabled={!hasSummary}
              label={i18n.translate('xpack.securitySolution.flyout.settings.anonymizeValues', {
                defaultMessage: 'Show anonymized values',
              })}
              onChange={onChangeShowAnonymizedValues}
            />
          </ConditionalWrap>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiIconTip
            position="top"
            key={'anonymize-values-tooltip'}
            content={
              <FormattedMessage
                id="xpack.securitySolution.flyout.settings.anonymizeValues.tooltip"
                defaultMessage="Toggle to reveal or obfuscate field values in your alert summary. The data sent to the LLM is still anonymized based on settings in Configurations > AI Settings > Anonymization."
              />
            }
            type="info"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
);

AnonymizationSwitch.displayName = 'AnonymizationSwitch';
