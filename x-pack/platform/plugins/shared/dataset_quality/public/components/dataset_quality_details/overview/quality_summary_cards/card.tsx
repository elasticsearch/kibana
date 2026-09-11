/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiCard,
  useEuiTheme,
  EuiIconTip,
  EuiStat,
  EuiText,
  EuiSpacer,
  EuiThemeProvider,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import React from 'react';
import { css } from '@emotion/react';

export function Card({
  isDisabled,
  isSelected,
  title,
  titleTooltipContent,
  kpiValue,
  footer,
  onClick,
  isLoading = false,
  dataTestSubjTitle,
}: {
  isDisabled?: boolean;
  isSelected?: boolean;
  title: string;
  titleTooltipContent?: React.ReactNode;
  kpiValue: string;
  footer: React.ReactNode;
  onClick?: () => void;
  isLoading?: boolean;
  dataTestSubjTitle?: string;
}) {
  const { euiTheme } = useEuiTheme();
  const isCardDisabled = Boolean(isDisabled) || Boolean(isSelected);
  const isClickable = Boolean(onClick) && !isCardDisabled;

  const cardStyle = css`
    height: 100%;
    min-width: 300px;
    border-radius: ${euiTheme.border.radius.medium};
    border: ${isSelected
      ? `${euiTheme.border.width.thin} solid ${euiTheme.colors.borderStrongPrimary}`
      : 'none'};
    background-color: ${isSelected ? euiTheme.colors.backgroundLightPrimary : 'inherit'};
    cursor: ${isClickable ? 'pointer' : 'default'};
  `;

  const dataTestSubject = `datasetQualityDetailsSummaryKpiCard-${dataTestSubjTitle || title}`;
  const displayKpiValue = isLoading ? '--' : kpiValue;

  const content = (
    <>
      <EuiStat
        title={
          <span data-test-subj={`datasetQualityDetailsSummaryKpiValue-${title}`}>
            {displayKpiValue}
          </span>
        }
        titleColor={isSelected ? 'primary' : 'default'}
        titleSize="m"
        descriptionElement="div"
        css={css`
          color: ${isSelected ? euiTheme.colors.textPrimary : euiTheme.colors.textParagraph};
        `}
        description={
          <>
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap={false}>
              <EuiFlexItem grow={false}>
                <EuiText
                  size="s"
                  css={css`
                    font-weight: ${euiTheme.font.weight.semiBold};
                  `}
                >
                  {title}
                </EuiText>
              </EuiFlexItem>
              {titleTooltipContent && (
                <EuiFlexItem grow={false}>
                  <EuiIconTip
                    type="info"
                    content={
                      <EuiThemeProvider colorMode="dark">{titleTooltipContent}</EuiThemeProvider>
                    }
                    size="m"
                  />
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
            <EuiSpacer size="xs" />
          </>
        }
        textAlign="left"
      >
        <EuiSpacer size="xs" />

        {footer}
      </EuiStat>
    </>
  );

  return (
    <EuiCard
      display="plain"
      hasBorder={false}
      paddingSize="m"
      isDisabled={onClick ? isCardDisabled : undefined}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      css={cardStyle}
      aria-pressed={isClickable ? isSelected : undefined}
      title={content}
      titleElement="span"
      textAlign="left"
      aria-label={title}
      data-test-subj={dataTestSubject}
    />
  );
}
