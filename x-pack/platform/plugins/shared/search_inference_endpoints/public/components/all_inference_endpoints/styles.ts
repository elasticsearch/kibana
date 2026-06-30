/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import type { UseEuiTheme } from '@elastic/eui';

export const GroupByFilterButton = ({ euiTheme }: UseEuiTheme) =>
  css({
    width: `${euiTheme.base * 10}px`,
  });

export const GroupBySelectableContainer = ({ euiTheme }: UseEuiTheme) =>
  css({
    width: `${euiTheme.base * 10}px`,
  });

export const ServiceIcon = ({ euiTheme }: UseEuiTheme) =>
  css({
    marginRight: euiTheme.size.s,
  });

export const StatItemStyles = ({ euiTheme }: UseEuiTheme) =>
  css({
    '&:not(:last-child)': {
      borderRight: euiTheme.border.thin,
      paddingRight: euiTheme.size.m,
    },
  });

export const UsageScanText = ({ euiTheme }: UseEuiTheme) =>
  css({
    fontWeight: euiTheme.font.weight.bold,
  });

export const DeleteConfirmText = ({ euiTheme }: UseEuiTheme) =>
  css({
    fontFamily: euiTheme.font.family,
    fontWeight: euiTheme.font.weight.bold,
  });

export const EndpointInfoContainer = () =>
  css({
    '&:hover .copyButton': {
      opacity: 1,
    },
  });

export const getCopyButtonStyles =
  (visible: boolean) =>
  ({ euiTheme }: UseEuiTheme) =>
    css({
      opacity: visible ? 1 : 0,
      transition: `opacity ${euiTheme.animation.fast} ease-in-out`,

      '&:focus': {
        opacity: 1,
      },
    });

export const SearchContainerStyles = ({ euiTheme }: UseEuiTheme) => css`
  width: ${euiTheme.base * 25}px;
`;
