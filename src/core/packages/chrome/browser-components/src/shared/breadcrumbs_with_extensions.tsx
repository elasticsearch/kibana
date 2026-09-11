/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PropsWithChildren } from 'react';
import React, { Suspense, useMemo } from 'react';
import { EuiFlexGroup, useEuiTheme } from '@elastic/eui';
import classnames from 'classnames';
import { css } from '@emotion/react';
import { useBreadcrumbsAppendExtensions } from './chrome_hooks';

export const BreadcrumbsWithExtensionsWrapper = ({ children }: PropsWithChildren) => {
  const { euiTheme } = useEuiTheme();
  const breadcrumbsAppendExtensions = useBreadcrumbsAppendExtensions();

  const styles = useMemo(
    () => css`
      overflow: hidden; // enables text-ellipsis in the last breadcrumb
      .euiHeaderBreadcrumbs,
      .euiBreadcrumbs {
        // stop breadcrumbs from growing.
        // this makes the extension appear right next to the last breadcrumb
        flex-grow: 0;
        margin-right: 0;

        overflow: hidden; // enables text-ellipsis in the last breadcrumb
      }

      .header__breadcrumbsAppendExtension--first {
        margin-inline-start: ${euiTheme.size.xxs};
      }

      .header__breadcrumbsAppendExtension--last {
        flex-grow: 1;
      }
    `,
    [euiTheme]
  );

  return breadcrumbsAppendExtensions.length === 0 ? (
    <>{children}</>
  ) : (
    <EuiFlexGroup
      responsive={false}
      wrap={false}
      alignItems={'center'}
      gutterSize={'none'}
      css={styles}
    >
      {children}
      {breadcrumbsAppendExtensions.map((breadcrumbsAppendExtension, index) => {
        const isFirst = index === 0;
        const isLast = breadcrumbsAppendExtensions.length - 1 === index;
        return (
          <div
            key={index}
            className={classnames({
              'header__breadcrumbsAppendExtension--first': isFirst,
              'header__breadcrumbsAppendExtension--last': isLast,
            })}
          >
            <Suspense fallback={null}>{breadcrumbsAppendExtension.content}</Suspense>
          </div>
        );
      })}
    </EuiFlexGroup>
  );
};
