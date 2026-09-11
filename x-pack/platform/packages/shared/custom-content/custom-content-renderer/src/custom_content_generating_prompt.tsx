/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiLoadingElastic, EuiSpacer, EuiText, EuiTitle, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';

/**
 * Shown while the agent is generating or updating the panel. Rendered as an overlay so it works
 * both for a brand new empty panel and when regenerating a panel that already has content.
 */
export const CustomContentGeneratingPrompt = () => {
  const { euiTheme } = useEuiTheme();

  return (
    <div
      css={css({
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: euiTheme.size.l,
        backgroundColor: euiTheme.colors.emptyShade,
      })}
      data-test-subj="customContentGeneratingPrompt"
    >
      <EuiLoadingElastic size="xxl" />
      <EuiSpacer size="m" />
      <EuiTitle size="xs">
        <h3>
          {i18n.translate('xpack.customContent.generating.title', {
            defaultMessage: 'Generating your panel',
          })}
        </h3>
      </EuiTitle>
      <EuiSpacer size="xs" />
      <EuiText size="s" color="subdued">
        <p>
          {i18n.translate('xpack.customContent.generating.body', {
            defaultMessage: 'This may take a few moments while the agent builds your panel.',
          })}
        </p>
      </EuiText>
    </div>
  );
};
