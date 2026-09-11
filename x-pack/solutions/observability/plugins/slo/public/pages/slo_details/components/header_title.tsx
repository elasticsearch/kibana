/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiMarkdownFormat,
  EuiSkeletonText,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { SLOWithSummaryResponse } from '@kbn/slo-schema';
import moment from 'moment';
import React from 'react';
import { SloStateBadge, SloStatusBadge, SloValueBadge } from '../../../components/slo/slo_badges';
import { SloTagsBadge } from '../../../components/slo/slo_badges/slo_tags_badge';
import { SloRemoteBadge } from '../../slos/components/badges/slo_remote_badge';
import { SloInstance } from './instance_selector/slo_instance';

export interface Props {
  slo?: SLOWithSummaryResponse;
  isLoading: boolean;
  /** Hide value/status badges and last-updated; those live on AppHeader for the details page. */
  omitAppHeaderItems?: boolean;
}

export function HeaderTitle({ isLoading, slo, omitAppHeaderItems = false }: Props) {
  if (isLoading || !slo) {
    return <EuiSkeletonText lines={2} data-test-subj="loadingTitle" />;
  }

  return (
    <EuiFlexGroup direction="column" gutterSize="m">
      <EuiFlexGroup
        direction="row"
        gutterSize="s"
        alignItems="center"
        justifyContent="flexStart"
        responsive={false}
        wrap={true}
      >
        {!omitAppHeaderItems && (
          <>
            <SloValueBadge slo={slo} isLoading={isLoading} />
            <SloStatusBadge slo={slo} isLoading={isLoading} />
          </>
        )}
        <SloStateBadge slo={slo} />
        <SloRemoteBadge slo={slo} />
        <SloTagsBadge slo={slo} />
      </EuiFlexGroup>
      {slo.description && (
        <EuiFlexItem grow={true}>
          <EuiText className={'eui-textBreakWord'}>
            <EuiMarkdownFormat textSize="xs" color="subdued">
              {slo.description}
            </EuiMarkdownFormat>
          </EuiText>
        </EuiFlexItem>
      )}
      {!omitAppHeaderItems && (
        <EuiFlexItem grow={false}>
          <EuiMarkdownFormat textSize="xs" color="subdued">
            {i18n.translate('xpack.slo.sloDetails.headerTitle.lastUpdatedLabel', {
              defaultMessage: '**Last updated by** {updatedBy} **on** {updatedAt}',
              values: {
                updatedBy: slo.updatedBy ?? NOT_AVAILABLE_LABEL,
                updatedAt: moment(slo.updatedAt).format('ll'),
              },
            })}
          </EuiMarkdownFormat>
        </EuiFlexItem>
      )}
      <SloInstance slo={slo} />
    </EuiFlexGroup>
  );
}

const NOT_AVAILABLE_LABEL = i18n.translate('xpack.slo.sloDetails.headerTitle.notAvailableLabel', {
  defaultMessage: 'n/a',
});
