/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import styled from '@emotion/styled';

import { EuiCallOut, EuiCheckbox, EuiFormRow, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import type { DataViewBase } from '@kbn/es-query';
import type { ExceptionListType } from '@kbn/securitysolution-io-ts-list-types';
import type { ExceptionsBuilderReturnExceptionItem } from '@kbn/securitysolution-list-utils';

import { useSignalIndex } from '../../../../../detections/containers/detection_engine/alerts/use_signal_index';
import { useFetchIndex } from '../../../../../common/containers/source';
import type { Status } from '../../../../../../common/api/detection_engine';
import type { RuntimeFieldType } from '../../../../../../common/api/detection_engine/signals/set_signal_status/set_signals_status_route.gen';
import { collectRuntimeFieldTypes, entryHasNonEcsType, shouldDisableBulkClose } from './utils';
import * as i18n from './translations';
import type { AlertData } from '../../../utils/types';

const FlyoutCheckboxesSection = styled.section`
  overflow-y: inherit;
  height: auto;
  .euiFlyoutBody__overflowContent {
    padding-top: 0;
  }
`;

const SectionHeader = styled(EuiTitle)`
  font-weight: ${({ theme }) => theme.euiTheme.font.weight.semiBold};
`;

interface ExceptionsFlyoutAlertsActionsComponentProps {
  exceptionListItems: ExceptionsBuilderReturnExceptionItem[];
  exceptionListType: ExceptionListType;
  shouldBulkCloseAlert: boolean;
  disableBulkClose: boolean;
  alertData?: AlertData;
  alertStatus?: Status;
  isAlertDataLoading?: boolean;
  shouldCloseSingleAlert?: boolean;
  /**
   * The rule's source-index data view. Used to look up the ES type of each
   * non-ECS field referenced in the exception so the parent can pass an
   * accurate `runtimeFields` map to bulk-close. Omit for callers without a
   * rule context (e.g. endpoint exceptions); the runtimeFields callback
   * still fires with default `keyword` types for any non-ECS fields.
   */
  sourceIndexPatterns?: DataViewBase;
  onUpdateBulkCloseIndex: (arg: string[] | undefined) => void;
  onBulkCloseCheckboxChange: (arg: boolean) => void;
  onSingleAlertCloseCheckboxChange?: (arg: boolean) => void;
  onDisableBulkClose: (arg: boolean) => void;
  /**
   * Fires when the runtime-field map (and whether any fields fell back to
   * `keyword`) changes.
   */
  onRuntimeFieldsChange?: (
    runtimeFields: Record<string, RuntimeFieldType>,
    hasUntypedFields: boolean
  ) => void;
}

const ExceptionItemsFlyoutAlertsActionsComponent: React.FC<
  ExceptionsFlyoutAlertsActionsComponentProps
> = ({
  isAlertDataLoading,
  exceptionListItems,
  exceptionListType,
  shouldCloseSingleAlert,
  shouldBulkCloseAlert,
  disableBulkClose,
  alertData,
  alertStatus,
  sourceIndexPatterns,
  onDisableBulkClose,
  onUpdateBulkCloseIndex,
  onBulkCloseCheckboxChange,
  onSingleAlertCloseCheckboxChange,
  onRuntimeFieldsChange,
}): JSX.Element => {
  const { loading: isSignalIndexLoading, signalIndexName } = useSignalIndex();
  const memoSignalIndexName = useMemo(
    () => (signalIndexName !== null ? [signalIndexName] : []),
    [signalIndexName]
  );

  // The alerts wildcard data view is used purely to detect when the exception
  // references fields that are not on the alerts index — typically runtime or
  // non-ECS fields defined on the rule's source indices. When that's the case,
  // bulk-close still proceeds (server resolves via runtime-field synthesis),
  // but we surface a warning callout to set expectations about coverage.
  const [isSignalIndexPatternLoading, { indexPatterns: signalIndexPatterns }] =
    useFetchIndex(memoSignalIndexName);

  const handleBulkCloseCheckbox = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      onBulkCloseCheckboxChange(event.currentTarget.checked);
    },
    [onBulkCloseCheckboxChange]
  );

  const handleCloseSingleAlertCheckbox = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      if (onSingleAlertCloseCheckboxChange != null) {
        onSingleAlertCloseCheckboxChange(event.currentTarget.checked);
      }
    },
    [onSingleAlertCloseCheckboxChange]
  );

  useEffect(() => {
    onUpdateBulkCloseIndex(
      shouldBulkCloseAlert && memoSignalIndexName != null ? memoSignalIndexName : undefined
    );
  }, [memoSignalIndexName, onUpdateBulkCloseIndex, shouldBulkCloseAlert]);

  useEffect((): void => {
    if (disableBulkClose === true) {
      onBulkCloseCheckboxChange(false);
    }
  }, [disableBulkClose, onBulkCloseCheckboxChange]);

  useEffect((): void => {
    onDisableBulkClose(shouldDisableBulkClose({ items: exceptionListItems }));
  }, [onDisableBulkClose, exceptionListItems]);

  const showRuntimeFieldWarning = useMemo(
    () =>
      shouldBulkCloseAlert &&
      isSignalIndexPatternLoading === false &&
      entryHasNonEcsType(exceptionListItems, signalIndexPatterns),
    [shouldBulkCloseAlert, isSignalIndexPatternLoading, exceptionListItems, signalIndexPatterns]
  );

  // Compute the runtime-field map for any non-ECS field the exception
  // references and hand it back to the parent flyout so it can be forwarded
  // to bulk-close. If we can't resolve a field's type against the rule's
  // source indices (rule drift, source indices reconfigured), it falls back
  // to `keyword` and we propagate the `hasUntypedFields` flag so the warning
  // callout below can escalate its wording.
  const runtimeFieldResolution = useMemo(() => {
    if (
      !shouldBulkCloseAlert ||
      isSignalIndexPatternLoading ||
      signalIndexPatterns == null ||
      sourceIndexPatterns == null
    ) {
      return { runtimeFields: {} as Record<string, RuntimeFieldType>, hasUntypedFields: false };
    }
    return collectRuntimeFieldTypes(exceptionListItems, sourceIndexPatterns, signalIndexPatterns);
  }, [
    shouldBulkCloseAlert,
    isSignalIndexPatternLoading,
    signalIndexPatterns,
    sourceIndexPatterns,
    exceptionListItems,
  ]);

  useEffect(() => {
    if (onRuntimeFieldsChange != null) {
      onRuntimeFieldsChange(
        runtimeFieldResolution.runtimeFields,
        runtimeFieldResolution.hasUntypedFields
      );
    }
  }, [onRuntimeFieldsChange, runtimeFieldResolution]);

  return (
    <FlyoutCheckboxesSection>
      <SectionHeader size="xs">
        <h3>{i18n.CLOSE_ALERTS_SECTION_TITLE}</h3>
      </SectionHeader>
      <EuiSpacer size="s" />
      {alertData != null && alertStatus !== 'closed' && (
        <EuiFormRow fullWidth>
          <EuiCheckbox
            data-test-subj="closeAlertOnAddExceptionCheckbox"
            id="close-alert-on-add-add-exception-checkbox"
            label={i18n.SINGLE_ALERT_CLOSE_LABEL}
            checked={shouldCloseSingleAlert}
            onChange={handleCloseSingleAlertCheckbox}
            disabled={isSignalIndexLoading || isAlertDataLoading}
          />
        </EuiFormRow>
      )}
      <EuiFormRow fullWidth>
        <EuiCheckbox
          data-test-subj="bulkCloseAlertOnAddExceptionCheckbox"
          id="bulk-close-alert-on-add-add-exception-checkbox"
          label={disableBulkClose ? i18n.BULK_CLOSE_LABEL_DISABLED : i18n.BULK_CLOSE_LABEL}
          checked={shouldBulkCloseAlert}
          onChange={handleBulkCloseCheckbox}
          disabled={disableBulkClose || isSignalIndexLoading || isAlertDataLoading}
        />
      </EuiFormRow>
      {showRuntimeFieldWarning && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            announceOnMount
            data-test-subj="bulkCloseRuntimeFieldWarning"
            size="s"
            color="warning"
            iconType="warning"
            title={i18n.BULK_CLOSE_RUNTIME_FIELD_WARNING_TITLE}
          >
            <p>{i18n.BULK_CLOSE_RUNTIME_FIELD_WARNING_BODY}</p>
            {runtimeFieldResolution.hasUntypedFields && (
              <p>{i18n.BULK_CLOSE_RUNTIME_FIELD_WARNING_UNTYPED_BODY}</p>
            )}
          </EuiCallOut>
        </>
      )}
      {exceptionListType === 'endpoint' && (
        <>
          <EuiSpacer size="s" />
          <EuiText data-test-subj="addExceptionEndpointText" color="subdued" size="s">
            {i18n.ENDPOINT_QUARANTINE_TEXT}
          </EuiText>
        </>
      )}
    </FlyoutCheckboxesSection>
  );
};

export const ExceptionItemsFlyoutAlertsActions = React.memo(
  ExceptionItemsFlyoutAlertsActionsComponent
);

ExceptionItemsFlyoutAlertsActions.displayName = 'ExceptionItemsFlyoutAlertsActions';
