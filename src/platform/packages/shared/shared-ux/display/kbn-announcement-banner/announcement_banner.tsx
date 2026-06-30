/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { EuiBanner, type EuiBannerProps } from '@elastic/eui';

/**
 * Props for the primary action button. Rendered as an `EuiButton`.
 * `color`, `size` and `fill` are controlled by the component.
 */
export type AnnouncementBannerActionPrimaryProps = NonNullable<
  EuiBannerProps['actionProps']
>['primary'];

/**
 * Props for the secondary action button. Rendered as an `EuiButtonEmpty`.
 * `color`, `size` and `flush` are controlled by the component.
 *
 * It's only rendered in combination with a primary action.
 */
export type AnnouncementBannerActionSecondaryProps = NonNullable<
  EuiBannerProps['actionProps']
>['secondary'];

export type AnnouncementBannerProps = Omit<EuiBannerProps, 'announceOnMount'>;

/**
 * A banner-style announcement with optional media, actions and dismiss button.
 *
 * Layout adapts to the host container via container queries (super narrow,
 * narrow, wide) — there is no `width` prop. The visual scale is controlled by
 * the `size` prop.
 */
export const AnnouncementBanner = (props: AnnouncementBannerProps) => {
  const { 'data-test-subj': dataTestSubj = 'announcementBanner', actionProps, ...rest } = props;

  const hasActions = Boolean(actionProps?.primary);

  return (
    <EuiBanner
      data-test-subj={dataTestSubj}
      actionProps={hasActions ? actionProps : undefined}
      {...rest}
      announceOnMount={false}
    />
  );
};
