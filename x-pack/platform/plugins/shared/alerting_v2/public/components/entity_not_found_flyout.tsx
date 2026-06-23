/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButton,
  EuiEmptyPrompt,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

const FLYOUT_TITLE_ID = 'entityNotFoundFlyoutTitle';

interface Props {
  title: string;
  body: string;
  onClose: () => void;
}

export const EntityNotFoundFlyout = ({ title, body, onClose }: Props) => (
  <EuiFlyout
    type="push"
    size="s"
    onClose={onClose}
    aria-labelledby={FLYOUT_TITLE_ID}
    data-test-subj="entityNotFoundFlyout"
  >
    <EuiFlyoutHeader hasBorder>
      <EuiTitle size="s">
        <h2 id={FLYOUT_TITLE_ID}>{title}</h2>
      </EuiTitle>
    </EuiFlyoutHeader>
    <EuiFlyoutBody>
      <EuiEmptyPrompt
        iconType="warning"
        color="warning"
        title={<h3>{title}</h3>}
        body={<p>{body}</p>}
      />
    </EuiFlyoutBody>
    <EuiFlyoutFooter>
      <EuiButton onClick={onClose} data-test-subj="entityNotFoundFlyoutCloseButton">
        {i18n.translate('xpack.alertingV2.entityNotFoundFlyout.closeButton', {
          defaultMessage: 'Close',
        })}
      </EuiButton>
    </EuiFlyoutFooter>
  </EuiFlyout>
);
