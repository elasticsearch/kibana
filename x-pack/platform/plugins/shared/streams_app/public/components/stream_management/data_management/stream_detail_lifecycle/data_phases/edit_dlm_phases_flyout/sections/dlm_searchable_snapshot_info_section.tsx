/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiText, EuiTitle, useGeneratedHtmlId } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import {
  FrozenDefaultRepositoryRequiredCallout,
  SearchableSnapshotRepositoryInfo,
} from '@kbn/data-lifecycle-phases';

export interface DlmSearchableSnapshotInfoSectionProps {
  dataTestSubj: string;
  manageRepositoriesHref?: string;
  defaultRepositoryName?: string;
  onCreateDefaultRepository?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const DlmSearchableSnapshotInfoSection = ({
  dataTestSubj,
  manageRepositoriesHref,
  defaultRepositoryName,
  onCreateDefaultRepository,
  onRefresh,
  isRefreshing,
}: DlmSearchableSnapshotInfoSectionProps) => {
  const titleId = useGeneratedHtmlId({ prefix: `${dataTestSubj}DlmSearchableSnapshotTitle` });

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="s"
      data-test-subj={`${dataTestSubj}DlmSearchableSnapshotInfo`}
    >
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiTitle size="xxs">
                <h3 id={titleId}>
                  {i18n.translate('xpack.streams.editDlmPhasesFlyout.searchableSnapshotTitle', {
                    defaultMessage: 'Searchable snapshot',
                  })}
                </h3>
              </EuiTitle>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      {defaultRepositoryName ? (
        <EuiText size="s" color="subdued">
          <SearchableSnapshotRepositoryInfo
            defaultRepository={defaultRepositoryName}
            manageRepositoriesHref={manageRepositoriesHref}
          />
        </EuiText>
      ) : (
        <FrozenDefaultRepositoryRequiredCallout
          onCreateDefaultRepository={onCreateDefaultRepository}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          calloutTestSubj={`${dataTestSubj}FrozenDefaultRepositoryRequiredCallout`}
          createButtonTestSubj={`${dataTestSubj}CreateDefaultRepositoryButton`}
          refreshButtonTestSubj={`${dataTestSubj}RefreshDefaultRepositoryButton`}
        />
      )}
    </EuiFlexGroup>
  );
};
