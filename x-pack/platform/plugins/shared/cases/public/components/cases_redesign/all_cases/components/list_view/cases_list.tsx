/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { css } from '@emotion/react';
import type { Pagination } from '@elastic/eui';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiTablePagination,
  EuiSkeletonRectangle,
  EuiEmptyPrompt,
  useEuiTheme,
} from '@elastic/eui';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';

import type { CasesFindResponseUI } from '../../../../../../common/ui/types';
import type { CasesColumnSelection, EuiBasicTableOnChange } from '../../types';
import { CASES_TABLE_PER_PAGE_VALUES } from '../../types';
import { CaseListItem } from './case_list_item';
import { LinkButton } from '../../../../links';
import { useCreateCaseNavigation } from '../../../../../common/navigation';
import { useCasesContext } from '../../../../cases_context/use_cases_context';
import * as i18n from '../../translations';

const LIST_ITEM_HEIGHT = 80;
const SKELETON_COUNT = 5;
const DEFAULT_PAGE_SIZE = 10;

interface CasesListProps {
  data: CasesFindResponseUI;
  userProfiles: Map<string, UserProfileWithAvatar>;
  isLoading: boolean;
  pagination: Pagination;
  onChange: (change: EuiBasicTableOnChange) => void;
  disableActions: boolean;
  selectedFields: CasesColumnSelection[];
}

export const CasesList: React.FC<CasesListProps> = React.memo(
  ({ data, userProfiles, isLoading, pagination, onChange, disableActions, selectedFields }) => {
    const { euiTheme } = useEuiTheme();
    const { permissions } = useCasesContext();
    const { getCreateCaseUrl, navigateToCreateCase } = useCreateCaseNavigation();
    const activePage = useMemo(() => pagination.pageIndex, [pagination.pageIndex]);
    const pageCount = useMemo(
      () => Math.ceil(pagination.totalItemCount / (pagination.pageSize ?? DEFAULT_PAGE_SIZE)),
      [pagination.totalItemCount, pagination.pageSize]
    );

    const handlePageChange = useCallback(
      (pageIndex: number) => {
        onChange({ page: { index: pageIndex, size: pagination.pageSize ?? DEFAULT_PAGE_SIZE } });
      },
      [onChange, pagination.pageSize]
    );

    const handlePageSizeChange = useCallback(
      (pageSize: number) => {
        onChange({ page: { index: 0, size: pageSize } });
      },
      [onChange]
    );

    if (isLoading && data.cases.length === 0) {
      return (
        <EuiFlexGroup
          direction="column"
          gutterSize="none"
          css={css`
            gap: ${euiTheme.size.m};
          `}
          data-test-subj="cases-list-loading"
        >
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <EuiFlexItem key={i}>
              <EuiSkeletonRectangle
                width="100%"
                height={`${LIST_ITEM_HEIGHT}px`}
                borderRadius="m"
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      );
    }

    if (data.cases.length === 0) {
      return (
        <EuiEmptyPrompt
          data-test-subj="cases-list-empty"
          title={<h3>{i18n.NO_CASES}</h3>}
          titleSize="xs"
          body={permissions.create ? i18n.NO_CASES_BODY : i18n.NO_CASES_BODY_READ_ONLY}
          actions={
            permissions.create && (
              <LinkButton
                isDisabled={!permissions.create}
                fill
                size="s"
                onClick={navigateToCreateCase}
                href={getCreateCaseUrl()}
                iconType="plusCircle"
                data-test-subj="cases-list-add-case"
              >
                {i18n.CREATE_CASE_TITLE}
              </LinkButton>
            )
          }
        />
      );
    }

    return (
      <div data-test-subj="cases-list-view">
        <EuiFlexGroup
          direction="column"
          gutterSize="none"
          css={css`
            gap: ${euiTheme.size.m};
          `}
        >
          {data.cases.map((theCase) => (
            <EuiFlexItem key={theCase.id}>
              <CaseListItem
                theCase={theCase}
                userProfiles={userProfiles}
                disableActions={disableActions}
                selectedFields={selectedFields}
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
        <EuiTablePagination
          data-test-subj="cases-list-pagination"
          activePage={activePage}
          itemsPerPage={pagination.pageSize}
          itemsPerPageOptions={CASES_TABLE_PER_PAGE_VALUES}
          pageCount={pageCount}
          onChangePage={handlePageChange}
          onChangeItemsPerPage={handlePageSizeChange}
        />
      </div>
    );
  }
);

CasesList.displayName = 'CasesList';
