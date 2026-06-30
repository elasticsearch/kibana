/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { RULE_FORM_ID } from '../constants';
import { ShowRequestModal } from './show_request_modal';

const SHOW_REQUEST_LABEL = i18n.translate('xpack.alertingV2.ruleForm.showRequestLabel', {
  defaultMessage: 'Show request',
});

export interface SubmissionButtonsProps {
  isSubmitting: boolean;
  onCancel?: () => void;
  submitLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  ruleId?: string;
}

export const SubmissionButtons = ({
  isSubmitting,
  onCancel,
  submitLabel,
  cancelLabel,
  ruleId,
}: SubmissionButtonsProps) => {
  const [isShowRequestVisible, setIsShowRequestVisible] = useState(false);

  const onShowRequest = useCallback(() => setIsShowRequestVisible(true), []);
  const onCloseShowRequest = useCallback(() => setIsShowRequestVisible(false), []);

  const defaultSubmitLabel = (
    <FormattedMessage id="xpack.alertingV2.ruleForm.submitLabel" defaultMessage="Save" />
  );

  const defaultCancelLabel = (
    <FormattedMessage id="xpack.alertingV2.ruleForm.cancelLabel" defaultMessage="Cancel" />
  );

  return (
    <>
      <EuiHorizontalRule />
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        {onCancel && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              onClick={onCancel}
              isDisabled={isSubmitting}
              data-test-subj="ruleV2FormCancelButton"
            >
              {cancelLabel ?? defaultCancelLabel}
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="m">
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                onClick={onShowRequest}
                isDisabled={isSubmitting}
                data-test-subj="ruleV2FormShowRequestButton"
              >
                {SHOW_REQUEST_LABEL}
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                type="submit"
                form={RULE_FORM_ID}
                isLoading={isSubmitting}
                fill
                iconType="plusInCircle"
                data-test-subj="ruleV2FormSubmitButton"
              >
                {submitLabel ?? defaultSubmitLabel}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      {isShowRequestVisible && <ShowRequestModal ruleId={ruleId} onClose={onCloseShowRequest} />}
    </>
  );
};
