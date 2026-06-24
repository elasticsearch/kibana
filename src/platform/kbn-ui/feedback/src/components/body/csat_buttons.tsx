/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import {
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';

const options = Array.from({ length: 5 }, (_, i) => ({
  id: `${i + 1}`,
  label: `${i + 1}`,
}));

interface Props {
  selectedCsatOptionId: string;
  appTitle: string;
  handleChangeCsatOptionId: (optionId: string) => void;
}

export const CsatButtons = ({
  selectedCsatOptionId,
  appTitle,
  handleChangeCsatOptionId,
}: Props) => {
  const { euiTheme } = useEuiTheme();

  const labelsCss = css`
    color: ${euiTheme.colors.textSubdued};
  `;

  const rightLabelCss = css`
    text-align: right;
  `;

  return (
    <EuiFormRow
      label={
        <>
          <EuiText size="s">
            <FormattedMessage
              id="kbnUI.feedback.body.csatButtons.titleText"
              defaultMessage="How satisfied are you with {appTitle}?"
              values={{ appTitle }}
            />
          </EuiText>
          <EuiSpacer size="xs" />
        </>
      }
    >
      <>
        <EuiButtonGroup
          data-test-subj="feedbackCsatButtonGroup"
          options={options}
          legend={i18n.translate('kbnUI.feedback.body.csatButtons.legend', {
            defaultMessage: 'Customer satisfaction rating',
          })}
          type="single"
          onChange={handleChangeCsatOptionId}
          idSelected={selectedCsatOptionId}
          isFullWidth={true}
          buttonSize="compressed"
        />
        <EuiSpacer size="xs" />
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" css={labelsCss}>
          <EuiFlexItem>
            <EuiText size="xs">
              {i18n.translate('kbnUI.feedback.body.csatButtons.veryDissatisfiedLabel', {
                defaultMessage: 'Very dissatisfied',
              })}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem css={rightLabelCss}>
            <EuiText size="xs">
              {i18n.translate('kbnUI.feedback.body.csatButtons.verySatisfiedLabel', {
                defaultMessage: 'Very satisfied',
              })}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    </EuiFormRow>
  );
};
