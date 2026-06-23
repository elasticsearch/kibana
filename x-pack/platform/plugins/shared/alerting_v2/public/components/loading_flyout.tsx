/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiEmptyPrompt, EuiFlyout, EuiFlyoutBody, EuiLoadingSpinner } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

const FLYOUT_TITLE_ID = 'loadingFlyoutTitle';

interface Props {
  onClose: () => void;
}

export const LoadingFlyout = ({ onClose }: Props) => (
  <EuiFlyout
    type="push"
    size="s"
    onClose={onClose}
    aria-labelledby={FLYOUT_TITLE_ID}
    data-test-subj="loadingFlyout"
  >
    <EuiFlyoutBody>
      <EuiEmptyPrompt
        icon={<EuiLoadingSpinner size="xl" />}
        title={
          <h3>
            {i18n.translate('xpack.alertingV2.loadingFlyout.title', {
              defaultMessage: 'Loading…',
            })}
          </h3>
        }
      />
    </EuiFlyoutBody>
  </EuiFlyout>
);
