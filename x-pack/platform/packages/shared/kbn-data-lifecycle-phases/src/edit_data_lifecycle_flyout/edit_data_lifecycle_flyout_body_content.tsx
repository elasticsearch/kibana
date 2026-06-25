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
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { RetentionSelector } from '../retention_selector';
import type { RetentionOption } from '../retention_selector/types';
import { editDataLifecycleFlyoutStrings as strings } from './strings';
import type { DataLifecycleMethod } from './types';
import { getEditDataLifecycleFlyoutBodyContentStyles } from './styles';
import { LifecycleMethodCard } from './lifecycle_method_card';
import { InheritLifecycleSection } from '../inherit_lifecycle_section';

interface InternalInheritArgs {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /**
   * Link rendered below the inherit checkbox to navigate to the inheritance source.
   * Always opens in a new tab.
   */
  link?: { label?: string; href: string };
}

interface InternalMethodArgs {
  value: DataLifecycleMethod;
  onChange: (next: DataLifecycleMethod) => void;
}

interface InternalIlmArgs {
  retentionOptions: RetentionOption[];
  selectedPolicyName?: string;
  isLoadingInherited?: boolean;
  onSelect: (policyName: string) => void;
  onInspect?: (policyName: string) => void;
}

export interface EditDataLifecycleFlyoutBodyContentProps {
  inheritLifecycle: boolean;
  lifecycleMethod: DataLifecycleMethod;
  showLifecycleMethodPicker: boolean;
  inherit?: InternalInheritArgs;
  method?: InternalMethodArgs;
  ilm?: InternalIlmArgs;
  dataStreamLifecycleContent?: React.ReactNode;
}

export const EditDataLifecycleFlyoutBodyContent = ({
  inheritLifecycle,
  lifecycleMethod,
  showLifecycleMethodPicker,
  inherit,
  method,
  ilm,
  dataStreamLifecycleContent,
}: EditDataLifecycleFlyoutBodyContentProps) => {
  const { euiTheme } = useEuiTheme();

  const styles = getEditDataLifecycleFlyoutBodyContentStyles({
    euiTheme,
    showLifecycleMethodPicker,
    lifecycleMethod,
  });

  return (
    <EuiFlexGroup direction="column" gutterSize="none" responsive={false} css={styles.container}>
      <EuiFlexItem grow={false} css={styles.headerSection}>
        {inherit && (
          <>
            <InheritLifecycleSection
              value={inherit.value}
              onChange={inherit.onChange}
              label={inherit.label}
              link={
                inherit.link
                  ? {
                      label: inherit.link.label ?? strings.viewInheritSourceLink,
                      href: inherit.link.href,
                    }
                  : undefined
              }
              checkboxIdPrefix="editDataLifecycle-inheritLifecycle"
            />

            <EuiSpacer size="m" />
          </>
        )}

        {method && (
          <>
            <EuiTitle size="xxs">
              <h3>{strings.lifecycleMethodTitle}</h3>
            </EuiTitle>

            <EuiSpacer size="s" />

            <EuiFlexGroup direction="column" gutterSize="s" responsive={false}>
              <LifecycleMethodCard
                method="dlm"
                selectedMethod={lifecycleMethod}
                disabled={inheritLifecycle}
                onChange={method.onChange}
              />

              <LifecycleMethodCard
                method="ilm"
                selectedMethod={lifecycleMethod}
                disabled={inheritLifecycle}
                onChange={method.onChange}
              />
            </EuiFlexGroup>
          </>
        )}

        {lifecycleMethod === 'dlm' && dataStreamLifecycleContent && (
          <>
            {showLifecycleMethodPicker && <EuiSpacer size="m" />}
            {dataStreamLifecycleContent}
          </>
        )}

        {showLifecycleMethodPicker && lifecycleMethod === 'ilm' && <EuiSpacer size="m" />}
      </EuiFlexItem>

      {showLifecycleMethodPicker && lifecycleMethod === 'ilm' && (
        <EuiFlexItem>
          {!ilm ? (
            <EuiPanel
              hasBorder
              color="subdued"
              paddingSize="l"
              css={styles.noInheritedPolicyPanel}
              data-test-subj="editDataLifecycle-ilmNotConfiguredPanel"
            >
              <EuiText color="subdued" size="s">
                {strings.ilmNotConfiguredDescription}
              </EuiText>
            </EuiPanel>
          ) : inheritLifecycle && ilm.isLoadingInherited ? (
            <EuiPanel
              hasBorder
              color="subdued"
              paddingSize="l"
              css={styles.noInheritedPolicyPanel}
              data-test-subj="editDataLifecycle-loadingInheritedPanel"
            >
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiLoadingSpinner size="m" />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText color="subdued" size="s">
                    {strings.loadingInheritedDescription}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          ) : inheritLifecycle && !ilm.selectedPolicyName ? (
            <EuiPanel
              hasBorder
              color="subdued"
              paddingSize="l"
              css={styles.noInheritedPolicyPanel}
              data-test-subj="editDataLifecycle-noInheritedPolicyPanel"
            >
              <EuiText color="subdued" size="s">
                {strings.noInheritedPolicyDescription}
              </EuiText>
            </EuiPanel>
          ) : (
            <RetentionSelector
              options={ilm.retentionOptions}
              selectedOptionName={ilm.selectedPolicyName}
              onSelectOption={ilm.onSelect}
              onInspect={ilm.onInspect}
              isDisabled={inheritLifecycle}
              height="full"
              showSearch={!inheritLifecycle}
              listStyle={inheritLifecycle ? 'panel' : 'plain'}
              showRowActions={!inheritLifecycle}
              searchPlaceholder={strings.ilmSearchPlaceholder}
              inspectButtonLabel={strings.inspectPolicyAriaLabel}
            />
          )}
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
