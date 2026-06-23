/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopoverTitle,
  EuiToolTip,
} from '@elastic/eui';

interface ClosablePopoverTitleProps {
  children: JSX.Element;
  id?: string;
  onClose: () => void;
}

export function ClosablePopoverTitle({ children, id, onClose }: ClosablePopoverTitleProps) {
  return (
    <EuiPopoverTitle id={id}>
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem>{children}</EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate(
              'xpack.observability.thresholdRule.closablePopoverTitle.closeLabel',
              {
                defaultMessage: 'Close',
              }
            )}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              data-test-subj="o11yClosablePopoverTitleButton"
              iconType="cross"
              color="danger"
              aria-label={i18n.translate(
                'xpack.observability.thresholdRule.closablePopoverTitle.closeLabel',
                {
                  defaultMessage: 'Close',
                }
              )}
              onClick={() => onClose()}
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPopoverTitle>
  );
}
