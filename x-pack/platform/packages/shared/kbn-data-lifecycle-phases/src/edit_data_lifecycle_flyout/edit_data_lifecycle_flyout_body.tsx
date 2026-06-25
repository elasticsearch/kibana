/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useRef } from 'react';
import { EuiFlyoutBody } from '@elastic/eui';
import { editDataLifecycleFlyoutStrings as strings } from './strings';
import type { DataLifecycleMethod, IlmPolicyForFlyout } from './types';
import { getIlmPolicySummaryStats } from './ilm_policy_summary_stats';
import { EditDataLifecycleFlyoutBodyContent } from './edit_data_lifecycle_flyout_body_content';
import { editDataLifecycleFlyoutBodyStyles as styles } from './styles';

const EMPTY_ILM_POLICIES: IlmPolicyForFlyout[] = [];

export interface EditDataLifecycleFlyoutBodyInheritConfig {
  value: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  /**
   * Link rendered below the inherit checkbox to navigate to the inheritance source.
   * Always opens in a new tab.
   */
  link?: { label?: string; href: string };
}

export interface EditDataLifecycleFlyoutBodyMethodConfig {
  value: DataLifecycleMethod;
  onChange: (next: DataLifecycleMethod) => void;
}

export interface EditDataLifecycleFlyoutBodyIlmConfig {
  policies: IlmPolicyForFlyout[];
  selectedPolicyName?: string;
  isLoadingInherited?: boolean;
  onSelect: (policyName: string) => void;
  onInspect?: (policyName: string) => void;
}

export interface EditDataLifecycleFlyoutBodyProps {
  /**
   * Omit to hide the inherit lifecycle section entirely.
   * Use this for root wired streams that cannot inherit from a parent.
   */
  inherit?: EditDataLifecycleFlyoutBodyInheritConfig;
  /**
   * Omit to hide the lifecycle-method picker entirely (e.g. serverless),
   * where only Data Stream Lifecycle is available.
   */
  method?: EditDataLifecycleFlyoutBodyMethodConfig;
  /**
   * ILM configuration.
   *
   * - When `method` is provided, this should also be provided (use an empty
   *   `policies` array if policies are still loading).
   * - Provide this even when `method.value === 'dlm'` so the user can switch to
   *   ILM without refetching policies.
   */
  ilm?: EditDataLifecycleFlyoutBodyIlmConfig;
  /**
   * Optional configuration UI shown when Data Stream Lifecycle is active.
   * Streams omit this because DLM is always saved as infinite retention there;
   * Index Management can provide its data phase configuration.
   */
  dataStreamLifecycleContent?: React.ReactNode;
}

export const EditDataLifecycleFlyoutBody = (props: EditDataLifecycleFlyoutBodyProps) => {
  const inheritLifecycle = props.inherit?.value ?? false;
  const lifecycleMethod = props.method?.value ?? 'dlm';
  const showLifecycleMethodPicker = props.method !== undefined;

  const ilmPolicies = props.ilm?.policies ?? EMPTY_ILM_POLICIES;
  const selectedIlmPolicyName = props.ilm?.selectedPolicyName;

  const dataStreamLifecycleContentForUi = props.dataStreamLifecycleContent ? (
    // Force a remount when toggling inheritance so uncontrolled inputs can't keep a locally edited value.
    <React.Fragment key={inheritLifecycle ? 'inherited' : 'local'}>
      {props.dataStreamLifecycleContent}
    </React.Fragment>
  ) : undefined;

  // Capture the selected policy from when the flyout opened so it stays visible
  // at the top while the user browses alternatives.
  const pinnedPolicyNameRef = useRef<string | undefined>(selectedIlmPolicyName);
  const pinnedPolicyName = pinnedPolicyNameRef.current;

  const retentionOptions = useMemo(
    () =>
      ilmPolicies.map((policy) => {
        const { deleteAfter, phaseCount, downsampleStepCount } = getIlmPolicySummaryStats(
          policy.phases
        );
        return {
          name: policy.name,
          descriptionParts: [
            deleteAfter ?? strings.retentionInfinity,
            strings.phasesLabel(phaseCount),
            ...(downsampleStepCount > 0 ? [strings.downsampleStepsLabel(downsampleStepCount)] : []),
          ],
          inspectable: policy.serializedPolicy !== undefined,
        };
      }),
    [ilmPolicies]
  );

  // Sort options so the initially selected policy is always pinned at the top.
  // `pinnedPolicyName` is captured once and never updated, so changing
  // `ilm.selectedPolicyName` mid-session does not re-pin.
  const sortedRetentionOptions = useMemo(() => {
    if (!pinnedPolicyName) return retentionOptions;
    const pinnedIdx = retentionOptions.findIndex((o) => o.name === pinnedPolicyName);
    if (pinnedIdx <= 0) return retentionOptions;
    const result = [...retentionOptions];
    const [pinned] = result.splice(pinnedIdx, 1);
    result.unshift(pinned);
    return result;
  }, [retentionOptions, pinnedPolicyName]);

  const visibleRetentionOptions = useMemo(() => {
    if (!inheritLifecycle) return sortedRetentionOptions;
    // When inheriting, only the inherited policy should appear. The empty-list
    // case (no inherited policy) is handled upstream by a no-policy panel.
    return sortedRetentionOptions.filter((option) => option.name === selectedIlmPolicyName);
  }, [inheritLifecycle, sortedRetentionOptions, selectedIlmPolicyName]);

  return (
    <EuiFlyoutBody
      css={
        lifecycleMethod === 'ilm' && showLifecycleMethodPicker ? styles.overflowHidden : undefined
      }
    >
      <EditDataLifecycleFlyoutBodyContent
        inheritLifecycle={inheritLifecycle}
        lifecycleMethod={lifecycleMethod}
        showLifecycleMethodPicker={showLifecycleMethodPicker}
        inherit={
          props.inherit
            ? {
                value: props.inherit.value,
                onChange: props.inherit.onChange,
                label: props.inherit.label ?? strings.inheritLabel,
                link: props.inherit.link,
              }
            : undefined
        }
        method={props.method}
        ilm={
          lifecycleMethod === 'ilm' && props.ilm
            ? {
                retentionOptions: visibleRetentionOptions,
                selectedPolicyName: selectedIlmPolicyName,
                isLoadingInherited: props.ilm.isLoadingInherited,
                onSelect: props.ilm.onSelect,
                onInspect: props.ilm.onInspect,
              }
            : undefined
        }
        dataStreamLifecycleContent={dataStreamLifecycleContentForUi}
      />
    </EuiFlyoutBody>
  );
};
