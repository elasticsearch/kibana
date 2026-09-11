/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutFooter,
  EuiSpacer,
  EuiText,
  type EuiFlyoutProps,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import {
  EditDataLifecycleFlyoutBody,
  EditFailedDataLifecycleFlyoutBody,
  FlyoutWithTabs,
  type DataLifecycleMethod,
  type IlmPolicyForFlyout,
  type NonEmptyFlyoutTabs,
  buildDataLifecycleApplyPayload,
  buildFailedDataLifecycleApplyPayload,
  type DataLifecycleApplyPayload,
  type FailedDataLifecycleApplyPayload,
} from '@kbn/data-lifecycle-phases';
import { DlmPhasesSelector, DeletePhaseCard } from '../dlm_phases_selector';
import type {
  DlmPhasesSelectorProps,
  DlmPhaseDuration,
  SerializedDlmPhases,
  DlmPhasesSelectorValue,
} from '../dlm_phases_selector';
import {
  mergeDefaultValue,
  serializeDlmPhases,
  validateDurations,
} from '../dlm_phases_selector/utils/duration_utils';
import { editDataLifecycleFlyoutStrings as strings } from './strings';

type TabId = 'successful_data' | 'failed_data';

const TABS: NonEmptyFlyoutTabs<TabId> = [
  { id: 'successful_data', label: strings.successfulDataTabLabel },
  { id: 'failed_data', label: strings.failedDataTabLabel },
];

export interface EditDataLifecycleFlyoutOnApplyArgs {
  successfulData: DataLifecycleApplyPayload | undefined;
  failedData?: FailedDataLifecycleApplyPayload;
}

export interface EditDataLifecycleFlyoutProps {
  onClose: () => void;
  onApply: (args: EditDataLifecycleFlyoutOnApplyArgs) => void;
  initialTabId?: TabId;
  container?: EuiFlyoutProps['container'];
  /**
   * When true, only the Delete phase is shown in the DLM phase selector.
   * The Frozen phase and Hot phase are hidden (Serverless deployments).
   */
  isServerless?: boolean;

  // ---- Successful data ----
  successfulData: {
    /** Rendered above the successful data editor, e.g. a warning that the lifecycle is not applied. */
    notice?: ReactNode;
    inheritLifecycle: boolean;
    onInheritLifecycleChange?: (next: boolean) => void;
    inheritLabel?: string;
    indexTemplateHref?: string;
    /**
     * DLM phase selector configuration.
     * `isDisabled`, `serverless`, and `onChange` are controlled internally —
     * use `onApply` to receive the final durations.
     */
    dlm?: Omit<DlmPhasesSelectorProps, 'isDisabled' | 'serverless' | 'onChange'>;
    /**
     * When provided, shows the lifecycle method picker (DLM vs ILM) and the ILM policy selector.
     * Omit on Serverless or when only DLM is available.
     */
    ilm?: {
      method: DataLifecycleMethod;
      onMethodChange: (next: DataLifecycleMethod) => void;
      policies: IlmPolicyForFlyout[];
      selectedPolicyName?: string;
      onPolicySelect: (name: string) => void;
      onPolicyInspect?: (name: string) => void;
      canManageIlm?: boolean;
      hasExistingIlmPolicy?: boolean;
    };
  };

  // ---- Failed data ----
  failedData: {
    inheritLifecycle: boolean;
    onInheritLifecycleChange?: (next: boolean) => void;
    inheritLabel?: string;
    indexTemplateHref?: string;
    failureStoreEnabled: boolean;
    onFailureStoreChange: (next: boolean) => void;
    deletePhaseDefaultValue?: DlmPhaseDuration;
  };
}

/**
 * Combined "Edit data lifecycle" flyout for Index Management.
 *
 * - **Successful data tab**: `EditDataLifecycleFlyoutBody` + `DlmPhasesSelector`
 * - **Failed data tab**: `EditFailedDataLifecycleFlyoutBody` + `DeletePhaseCard`
 */
export const EditDataLifecycleFlyout = ({
  onClose,
  onApply,
  initialTabId,
  container,
  isServerless = false,
  successfulData,
  failedData,
}: EditDataLifecycleFlyoutProps) => {
  const { euiTheme } = useEuiTheme();
  const failedDeletePhaseCardId = useGeneratedHtmlId({
    prefix: 'editDataLifecycle-failedDeletePhase',
  });

  const forceFailedDeletePhaseEnabled = isServerless && failedData.failureStoreEnabled;

  const { ilm } = successfulData;
  const effectiveMethod = ilm?.method ?? 'dlm';

  const [isDlmValid, setIsDlmValid] = useState(true);
  const dlmSerializedRef = useRef<SerializedDlmPhases>({});
  const [dlmValue, setDlmValue] = useState<DlmPhasesSelectorValue | undefined>(undefined);
  const hasUserModifiedDlmRef = useRef(false);
  const hasUserModifiedSuccessfulDataRef = useRef(false);
  const [failedDeletePhase, setFailedDeletePhase] = useState<DlmPhaseDuration>(
    () => failedData.deletePhaseDefaultValue ?? { enabled: false, value: '60', unit: 'd' }
  );
  const hasUserModifiedFailedDeletePhaseRef = useRef(false);
  const hasUserModifiedFailedDataRef = useRef(false);

  const dlmDefaultValueKey = useMemo(
    () => JSON.stringify(successfulData.dlm?.defaultValue ?? null),
    [successfulData.dlm?.defaultValue]
  );

  useEffect(() => {
    if (!successfulData.dlm) {
      return;
    }

    if (hasUserModifiedDlmRef.current) {
      return;
    }

    const nextValue = mergeDefaultValue(successfulData.dlm.defaultValue);
    setDlmValue(nextValue);
    dlmSerializedRef.current = serializeDlmPhases(nextValue);
    setIsDlmValid(validateDurations(nextValue, successfulData.dlm.maximumRetentionPeriod).isValid);
  }, [dlmDefaultValueKey, successfulData.dlm]);

  const failedDeletePhaseDefaultValueKey = useMemo(
    () => JSON.stringify(failedData.deletePhaseDefaultValue ?? null),
    [failedData.deletePhaseDefaultValue]
  );

  useEffect(() => {
    if (hasUserModifiedFailedDeletePhaseRef.current) {
      return;
    }

    if (failedData.deletePhaseDefaultValue) {
      setFailedDeletePhase(failedData.deletePhaseDefaultValue);
    }
  }, [failedDeletePhaseDefaultValueKey, failedData.deletePhaseDefaultValue]);

  useEffect(() => {
    if (!forceFailedDeletePhaseEnabled || failedData.inheritLifecycle) {
      return;
    }

    setFailedDeletePhase((prev) => (prev.enabled ? prev : { ...prev, enabled: true }));
  }, [failedData.inheritLifecycle, forceFailedDeletePhaseEnabled]);

  const handleApply = (selectedTabId: TabId) => {
    const { frozen_after: frozenAfter, data_retention: dataRetention } = dlmSerializedRef.current;
    const shouldApplySuccessfulData =
      selectedTabId === 'successful_data' || hasUserModifiedSuccessfulDataRef.current;
    const successfulPayload = shouldApplySuccessfulData
      ? buildDataLifecycleApplyPayload({
          inheritLifecycle: successfulData.inheritLifecycle,
          method: effectiveMethod,
          ilmPolicyName: ilm?.selectedPolicyName,
          frozenAfter,
          dataRetention,
        })
      : undefined;

    const { enabled, value, unit } = failedDeletePhase;
    const effectiveFailedDeletePhaseEnabled = forceFailedDeletePhaseEnabled ? true : enabled;
    // When the user is not inheriting, we always persist the failure store retention shown in
    // the flyout (the effective/default value if untouched). Otherwise Elasticsearch would
    // resolve it from the template (`default_failures_retention`) and the saved configuration
    // would be (incorrectly) interpreted as inherited.
    const shouldPersistFailedRetentionOverride = failedData.failureStoreEnabled === true;
    const shouldApplyFailedData =
      selectedTabId === 'failed_data' || hasUserModifiedFailedDataRef.current;
    const failedPayload = shouldApplyFailedData
      ? buildFailedDataLifecycleApplyPayload({
          inheritLifecycle: failedData.inheritLifecycle,
          failureStoreEnabled: failedData.failureStoreEnabled,
          retention:
            shouldPersistFailedRetentionOverride && effectiveFailedDeletePhaseEnabled
              ? `${value}${unit}`
              : undefined,
          // In stateful, an unchecked Delete phase means "disable retention" (keep indefinitely).
          // Serverless does not support this, so we only set it when explicitly allowed.
          retentionDisabled:
            !isServerless &&
            shouldPersistFailedRetentionOverride &&
            !effectiveFailedDeletePhaseEnabled
              ? true
              : undefined,
        })
      : undefined;

    onApply({ successfulData: successfulPayload, failedData: failedPayload });
  };

  const isApplyDisabled = (selectedTabId: TabId) => {
    const appliesSuccessfulData =
      selectedTabId === 'successful_data' || hasUserModifiedSuccessfulDataRef.current;

    return (
      appliesSuccessfulData &&
      ((!successfulData.inheritLifecycle &&
        effectiveMethod === 'ilm' &&
        !ilm?.selectedPolicyName) ||
        (!successfulData.inheritLifecycle && effectiveMethod === 'dlm' && !isDlmValid))
    );
  };

  const footerStyles = useMemo(
    () => css`
      padding: ${euiTheme.size.m} ${euiTheme.size.l};
    `,
    [euiTheme.size.m, euiTheme.size.l]
  );

  const getFooter = (selectedTabId: TabId) => (
    <EuiFlyoutFooter>
      <EuiFlexGroup
        justifyContent="spaceBetween"
        alignItems="center"
        gutterSize="s"
        responsive={false}
        css={footerStyles}
      >
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty onClick={onClose} flush="left" size="s">
            {strings.cancelButton}
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            size="s"
            onClick={() => handleApply(selectedTabId)}
            disabled={isApplyDisabled(selectedTabId)}
            data-test-subj="editDataLifecycleFlyoutApplyButton"
          >
            {strings.applyButton}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlyoutFooter>
  );

  const dlmContent =
    successfulData.dlm != null && effectiveMethod === 'dlm' ? (
      <>
        <EuiText size="xs">
          <strong>{strings.dataPhasesTitle}</strong>
        </EuiText>
        <EuiSpacer size="xs" />
        <DlmPhasesSelector
          {...successfulData.dlm}
          defaultValue={
            successfulData.inheritLifecycle
              ? successfulData.dlm.defaultValue
              : dlmValue
              ? { frozen: dlmValue.frozen, delete: dlmValue.delete }
              : successfulData.dlm.defaultValue
          }
          isDisabled={successfulData.inheritLifecycle}
          serverless={isServerless}
          onChange={(value, serialized, isValid) => {
            hasUserModifiedDlmRef.current = true;
            hasUserModifiedSuccessfulDataRef.current = true;
            setDlmValue(value);
            dlmSerializedRef.current = serialized;
            setIsDlmValid(isValid);
          }}
        />
      </>
    ) : undefined;

  const failedDeletePhaseContent = (
    <>
      <EuiText size="xs">
        <strong>{strings.dataPhasesTitle}</strong>
      </EuiText>
      <EuiSpacer size="xs" />
      <DeletePhaseCard
        id={failedDeletePhaseCardId}
        duration={
          // When inheriting, preview the template's configuration instead of the
          // data stream's own (possibly user-edited) value.
          failedData.inheritLifecycle
            ? failedData.deletePhaseDefaultValue ?? { enabled: false, value: '60', unit: 'd' }
            : forceFailedDeletePhaseEnabled
            ? { ...failedDeletePhase, enabled: true }
            : failedDeletePhase
        }
        isCardDisabled={failedData.inheritLifecycle}
        // In serverless the failure store delete phase cannot be disabled, so the toggle is
        // hidden regardless of whether the lifecycle is inherited from the index template.
        hideToggle={forceFailedDeletePhaseEnabled}
        isFormDisabled={failedData.inheritLifecycle}
        onChange={(next) => {
          if (forceFailedDeletePhaseEnabled && next.enabled === false) {
            return;
          }
          hasUserModifiedFailedDeletePhaseRef.current = true;
          hasUserModifiedFailedDataRef.current = true;
          setFailedDeletePhase(next);
        }}
      />
    </>
  );

  const inheritLink =
    successfulData.indexTemplateHref !== undefined
      ? { href: successfulData.indexTemplateHref, label: strings.viewIndexTemplateLabel }
      : undefined;

  const failedInheritLink =
    failedData.indexTemplateHref !== undefined
      ? { href: failedData.indexTemplateHref, label: strings.viewIndexTemplateLabel }
      : undefined;

  return (
    <FlyoutWithTabs
      title={strings.title}
      tabsAriaLabel={strings.tabsAriaLabel}
      tabs={TABS}
      initialTabId={initialTabId}
      onClose={onClose}
      size={400}
      type="overlay"
      container={container}
    >
      {(selectedTabId) => (
        <>
          {selectedTabId === 'successful_data' && successfulData.notice}
          {selectedTabId === 'successful_data' && (
            <EditDataLifecycleFlyoutBody
              inherit={
                inheritLink !== undefined || successfulData.onInheritLifecycleChange !== undefined
                  ? {
                      value: successfulData.inheritLifecycle,
                      onChange: (next) => {
                        hasUserModifiedSuccessfulDataRef.current = true;
                        successfulData.onInheritLifecycleChange?.(next);
                      },
                      label: successfulData.inheritLabel ?? strings.inheritLabel,
                      link: inheritLink,
                    }
                  : undefined
              }
              method={
                ilm
                  ? {
                      value: ilm.method,
                      onChange: (next) => {
                        hasUserModifiedSuccessfulDataRef.current = true;
                        ilm.onMethodChange(next);
                      },
                    }
                  : undefined
              }
              ilm={
                ilm
                  ? {
                      policies: ilm.policies,
                      selectedPolicyName: ilm.selectedPolicyName,
                      onSelect: (policyName) => {
                        hasUserModifiedSuccessfulDataRef.current = true;
                        ilm.onPolicySelect(policyName);
                      },
                      onInspect: ilm.onPolicyInspect,
                      canManage: ilm.canManageIlm,
                      hasExistingPolicy: ilm.hasExistingIlmPolicy,
                    }
                  : undefined
              }
              dataStreamLifecycleContent={dlmContent}
            />
          )}
          {selectedTabId === 'failed_data' && (
            <EditFailedDataLifecycleFlyoutBody
              inherit={
                failedInheritLink !== undefined || failedData.onInheritLifecycleChange !== undefined
                  ? {
                      value: failedData.inheritLifecycle,
                      onChange: (next) => {
                        hasUserModifiedFailedDataRef.current = true;
                        failedData.onInheritLifecycleChange?.(next);
                      },
                      label: failedData.inheritLabel ?? strings.inheritLabel,
                      link: failedInheritLink,
                    }
                  : undefined
              }
              failureStore={{
                value: failedData.failureStoreEnabled,
                onChange: (next) => {
                  hasUserModifiedFailedDataRef.current = true;
                  failedData.onFailureStoreChange(next);
                },
              }}
              retentionContent={failedDeletePhaseContent}
            />
          )}
          {getFooter(selectedTabId)}
        </>
      )}
    </FlyoutWithTabs>
  );
};
