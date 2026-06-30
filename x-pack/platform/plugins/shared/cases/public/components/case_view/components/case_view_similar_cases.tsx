/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback, useMemo, useState } from 'react';

import { EuiFlexItem, EuiFlexGroup, useEuiTheme } from '@elastic/eui';

import { useGetSimilarCases, initialData } from '../../../containers/use_get_similar_cases';
import type { CaseUI } from '../../../../common/ui/types';

import { CASES_TABLE_PER_PAGE_VALUES, type EuiBasicTableOnChange } from '../../all_cases/types';
import { SimilarCasesTable } from '../../similar_cases/table';
import { KibanaServices } from '../../../common/lib/kibana';
import { SidebarToggleButton } from '../../cases_redesign/case_view/components/sidebar_toggle_button';

interface CaseViewSimilarCasesProps {
  caseData: CaseUI;
}

export const CaseViewSimilarCases = ({ caseData }: CaseViewSimilarCasesProps) => {
  const { euiTheme } = useEuiTheme();
  const isRedesignEnabled = KibanaServices.getConfig()?.casesRedesign?.details ?? false;
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(CASES_TABLE_PER_PAGE_VALUES[0]);

  const { data = initialData, isLoading: isLoadingCases } = useGetSimilarCases({
    caseId: caseData.id,
    page: pageIndex + 1,
    perPage: pageSize,
    enabled: true,
  });

  const tableOnChangeCallback = useCallback(({ page, sort }: EuiBasicTableOnChange) => {
    setPageIndex(page.index);
    setPageSize(page.size);
  }, []);

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
      totalItemCount: data.total ?? 0,
      pageSizeOptions: CASES_TABLE_PER_PAGE_VALUES,
    }),
    [data.total, pageIndex, pageSize]
  );

  return (
    <EuiFlexGroup direction="column" gutterSize="none">
      {isRedesignEnabled && (
        <EuiFlexItem grow={false} css={{ paddingTop: euiTheme.size.s }}>
          <EuiFlexGroup justifyContent="flexEnd" gutterSize="none">
            <EuiFlexItem grow={false}>
              <SidebarToggleButton />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      )}
      <EuiFlexItem>
        <SimilarCasesTable
          isLoading={isLoadingCases}
          cases={data.cases}
          pagination={pagination}
          onChange={tableOnChangeCallback}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

CaseViewSimilarCases.displayName = 'CaseViewSimilarCases';
