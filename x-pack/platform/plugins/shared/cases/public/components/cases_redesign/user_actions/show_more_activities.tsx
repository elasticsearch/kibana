/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiText, useEuiTheme } from '@elastic/eui';
import React, { useMemo } from 'react';
import { css } from '@emotion/react';

import * as i18n from './translations';

interface ShowMoreActivitiesProps {
  count: number;
  onClick: () => void;
  isLoading?: boolean;
}

export const ShowMoreActivities = React.memo<ShowMoreActivitiesProps>(
  ({ count, onClick, isLoading = false }) => {
    const { euiTheme } = useEuiTheme();

    const buttonCss = useMemo(
      () => css`
        display: flex;
        align-items: center;
        width: 100%;
        height: ${euiTheme.size.xxl};
        padding: 0 ${euiTheme.size.m};
        background: ${euiTheme.colors.backgroundBaseSubdued};
        border: ${euiTheme.border.thin};
        border-radius: ${euiTheme.border.radius.medium};
        cursor: pointer;

        &:hover {
          background: ${euiTheme.colors.backgroundBaseDisabled};
        }

        &:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
      `,
      [euiTheme]
    );

    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading}
        data-test-subj="cases-show-more-user-actions"
        css={buttonCss}
      >
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="arrowRight" size="s" color="subdued" aria-hidden={true} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s" color="subdued">
              {i18n.MORE_ACTIVITIES(count)}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </button>
    );
  }
);

ShowMoreActivities.displayName = 'ShowMoreActivities';
