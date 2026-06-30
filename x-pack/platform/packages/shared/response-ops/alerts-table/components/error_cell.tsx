/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import { EuiCodeBlock, EuiFlexGroup, EuiFlexItem, EuiIcon, EuiSpacer, EuiText } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

// Here we force the error callout to be the same height as the cell content
// so that the error detail gets hidden in the overflow area and only shown in
// the cell popover
const errorCalloutStyles = css`
  height: 1lh;
`;

/**
 * An error callout that displays the error stack in a code block
 */
export const ErrorCell = ({ error }: { error: Error }) => (
  <>
    <EuiFlexGroup
      gutterSize="s"
      alignItems="center"
      css={errorCalloutStyles}
      data-test-subj="errorCell"
    >
      <EuiFlexItem grow={false}>
        <EuiIcon type="error" color="danger" aria-hidden={true} />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiText
          color="subdued"
          size="xs"
          css={css`
            line-height: unset;
          `}
        >
          <strong>
            <FormattedMessage
              id="xpack.triggersActionsUI.sections.alertTable.viewError"
              defaultMessage="An error occurred"
            />
          </strong>
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer />
    <EuiCodeBlock isCopyable>{error.stack}</EuiCodeBlock>
  </>
);
