/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { EuiButton, EuiToolTip } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

interface Props {
  isSendFeedbackButtonDisabled: boolean;
  isSubmitting: boolean;
  submitFeedback: () => Promise<void>;
}

export const SendFeedbackButton = ({
  isSendFeedbackButtonDisabled,
  isSubmitting,
  submitFeedback,
}: Props) => {
  const handleSubmit = async () => {
    await submitFeedback();
  };

  return (
    <EuiToolTip
      content={
        isSendFeedbackButtonDisabled
          ? i18n.translate('kbnUI.feedback.footer.sendFeedbackButton.tooltip', {
              defaultMessage: 'Answer at least one of the questions in order to send feedback.',
            })
          : undefined
      }
    >
      <EuiButton
        fill
        color="primary"
        data-test-subj="feedbackFooterSendFeedbackButton"
        disabled={isSendFeedbackButtonDisabled}
        isLoading={isSubmitting}
        onClick={handleSubmit}
        iconType="send"
      >
        <FormattedMessage id="kbnUI.feedback.footer.sendFeedbackButton" defaultMessage="Send" />
      </EuiButton>
    </EuiToolTip>
  );
};
