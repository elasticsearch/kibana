/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiTitle,
  EuiSpacer,
  EuiFlexItem,
  EuiFlexGroup,
  EuiTabs,
  EuiTab,
  useEuiTheme,
  useEuiMinBreakpoint,
  type EuiPageHeaderProps,
  EuiLoadingSpinner,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { InventoryItemType } from '@kbn/metrics-data-access-plugin/common/inventory_models/types';
import type { DataSchemaFormat } from '@kbn/metrics-data-access-plugin/common';
import { i18n } from '@kbn/i18n';
import { HostHeaderTitle } from './host_header_title';

type Props = Pick<EuiPageHeaderProps, 'tabs' | 'title' | 'rightSideItems'> & {
  entityType: InventoryItemType;
  loading: boolean;
  schema?: DataSchemaFormat | null;
  headingId?: string;
};

export const FlyoutHeader = ({
  title,
  tabs = [],
  rightSideItems = [],
  entityType,
  loading,
  schema,
  headingId,
}: Props) => {
  const { euiTheme } = useEuiTheme();

  return (
    <>
      <EuiFlexGroup gutterSize="m" justifyContent="spaceBetween" direction="row">
        <EuiFlexItem
          grow
          css={css`
            overflow: hidden;
            & h4 {
              text-overflow: ellipsis;
              overflow: hidden;
              white-space: nowrap;
              width: calc(100%);
            }
          `}
        >
          <EuiTitle size="xs">
            {loading ? (
              <EuiLoadingSpinner size="m" />
            ) : (
              <h4
                id={headingId}
                aria-label={i18n.translate('xpack.infra.assetDetails.flyout.ariaLabel', {
                  defaultMessage: '{entityType} {title} details',
                  values: { entityType, title },
                })}
              >
                {entityType === 'host' ? <HostHeaderTitle title={title} schema={schema} /> : title}
              </h4>
            )}
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem
          grow={false}
          css={css`
            align-items: flex-start;
            ${useEuiMinBreakpoint('m')} {
              align-items: flex-end;
            }
          `}
        >
          <EuiFlexGroup
            gutterSize="m"
            responsive={false}
            justifyContent="flexEnd"
            alignItems="center"
            css={css`
              margin-right: ${euiTheme.size.l};
            `}
          >
            {rightSideItems?.map((item, index) => (
              <EuiFlexItem key={index} grow={false}>
                {item}
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiTabs
        bottomBorder
        css={css`
          margin-bottom: calc(-1 * (${euiTheme.size.l} + 1px));
        `}
        size="s"
      >
        {tabs.map(({ label, ...tab }, index) => (
          <EuiTab key={tab['data-test-subj'] ?? index} {...tab}>
            {label}
          </EuiTab>
        ))}
      </EuiTabs>
    </>
  );
};
