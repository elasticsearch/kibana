/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiSpacer,
  EuiText,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { InheritLifecycleSection } from '../inherit_lifecycle_section';
import { editFailedDataLifecycleFlyoutStrings as strings } from './strings';
import { getEditFailedDataLifecycleFlyoutBodyStyles } from './styles';

export interface EditFailedDataLifecycleFlyoutBodyInheritConfig {
  value: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  /**
   * Link rendered below the inherit checkbox to navigate to the inheritance source.
   * Always opens in a new tab.
   */
  link?: { label?: string; href: string };
}

export interface EditFailedDataLifecycleFlyoutBodyFailureStoreConfig {
  value: boolean;
  onChange: (next: boolean) => void;
}

export interface EditFailedDataLifecycleFlyoutBodyProps {
  /**
   * Omit to hide the inherit lifecycle section entirely.
   * Use this for root wired streams that cannot inherit from a parent.
   */
  inherit?: EditFailedDataLifecycleFlyoutBodyInheritConfig;
  failureStore: EditFailedDataLifecycleFlyoutBodyFailureStoreConfig;
  /**
   * Optional configuration UI for retention of failed data (Index Management).
   * Streams omit this because failed-data retention is controlled via the successful-data data phases.
   */
  retentionContent?: React.ReactNode;
}

export const EditFailedDataLifecycleFlyoutBody = ({
  inherit,
  failureStore,
  retentionContent,
}: EditFailedDataLifecycleFlyoutBodyProps) => {
  const inheritLifecycle = inherit?.value ?? false;
  const { euiTheme } = useEuiTheme();
  const failureStoreCheckboxId = useGeneratedHtmlId({
    prefix: 'editFailedDataLifecycle-failureStore',
  });

  const styles = getEditFailedDataLifecycleFlyoutBodyStyles({ euiTheme });

  return (
    <EuiFlyoutBody>
      <EuiFlexGroup direction="column" gutterSize="none" responsive={false}>
        <EuiFlexItem grow={false} css={styles.headerSection}>
          {inherit && (
            <>
              <InheritLifecycleSection
                value={inherit.value}
                onChange={inherit.onChange}
                label={inherit.label ?? strings.inheritLabel}
                link={inherit.link}
                checkboxIdPrefix="editFailedDataLifecycle-inheritLifecycle"
              />
              <EuiSpacer size="m" />
            </>
          )}

          <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiCheckbox
                id={failureStoreCheckboxId}
                checked={failureStore.value}
                onChange={(e) => failureStore.onChange(e.target.checked)}
                label={strings.enableFailureStoreLabel}
                disabled={inheritLifecycle}
                data-test-subj="editFailedDataLifecycle-enableFailureStoreCheckbox"
              />
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <EuiText size="s" color="subdued">
                {strings.enableFailureStoreHelpText}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>

          {failureStore.value && retentionContent && (
            <>
              <EuiSpacer size="m" />
              <React.Fragment key={inheritLifecycle ? 'inherited' : 'local'}>
                {retentionContent}
              </React.Fragment>
            </>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlyoutBody>
  );
};
