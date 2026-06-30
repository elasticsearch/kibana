/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CriteriaWithPagination, EuiBasicTableColumn } from '@elastic/eui';
import { EuiFlexGroup } from '@elastic/eui';
import { EuiFieldSearch } from '@elastic/eui';
import { EuiToolTip } from '@elastic/eui';
import { EuiButtonIcon } from '@elastic/eui';
import { EuiSpacer } from '@elastic/eui';
import { EuiBasicTable, EuiText, EuiIconTip } from '@elastic/eui';
import React, { useCallback, useMemo, useState } from 'react';
import { FormattedDate, FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

import { EmptyPolicyNameHint } from '../../../../../components/uninstall_command_flyout/empty_policy_name_hint';

import { ApiKeyField } from '../../../../../components/api_key_field';
import type { UninstallTokenMetadata } from '../../../../../../common/types/models/uninstall_token';
import {
  getUninstallTokenValue,
  useGetUninstallTokens,
} from '../../../../../hooks/use_request/uninstall_tokens';
import { useBreadcrumbs, usePagination } from '../../../hooks';
import { DefaultLayout } from '../../../layouts';
import { UninstallCommandFlyout } from '../../../components';

import {
  ACTIONS_TITLE,
  CREATED_AT_TITLE,
  VIEW_UNINSTALL_COMMAND_LABEL,
  POLICY_ID_TITLE,
  SEARCH_BY_POLICY_ID_OR_NAME_PLACEHOLDER,
  TOKEN_TITLE,
  POLICY_NAME_TITLE,
  SEARCH_BY_POLICY_ID_OR_NAME_HINT,
} from './translations';

const TextField = ({ text, dataTestSubj }: { text: string; dataTestSubj?: string }) => (
  <EuiText size="s" className="eui-textTruncate" title={text} data-test-subj={dataTestSubj}>
    {text}
  </EuiText>
);

const ViewUninstallCommandButton = ({ onClick }: { onClick: () => void }) => (
  <EuiToolTip content={VIEW_UNINSTALL_COMMAND_LABEL} disableScreenReaderOutput>
    <EuiButtonIcon
      data-test-subj="uninstallTokensViewCommandButton"
      aria-label={VIEW_UNINSTALL_COMMAND_LABEL}
      onClick={onClick}
      iconType="inspect"
      color="text"
    />
  </EuiToolTip>
);

const NoItemsMessage = ({ isLoading }: { isLoading: boolean }) =>
  isLoading ? (
    <FormattedMessage
      id="xpack.fleet.uninstallTokenList.loadingTokensMessage"
      defaultMessage="Loading uninstall tokens..."
    />
  ) : (
    <FormattedMessage
      id="xpack.fleet.uninstallTokenList.emptyMessage"
      defaultMessage="No uninstall tokens found."
    />
  );

export const UninstallTokenListPage = () => {
  useBreadcrumbs('uninstall_tokens');

  const [policyIdOrNameSearch, setPolicyIdOrNameSearch] = useState<string>('');
  const [tokenIdForFlyout, setTokenIdForFlyout] = useState<string | null>(null);

  const { pagination, setPagination, pageSizeOptions } = usePagination();

  const { isLoading, data } = useGetUninstallTokens({
    perPage: pagination.pageSize,
    page: pagination.currentPage,
    search: policyIdOrNameSearch,
  });

  const tokens = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: Array<EuiBasicTableColumn<UninstallTokenMetadata>> = useMemo(
    () => [
      {
        field: 'policy_name',
        name: POLICY_NAME_TITLE,
        render: (policyName: string | null) => {
          if (policyName === null) {
            return <EmptyPolicyNameHint />;
          } else {
            return <TextField text={policyName} />;
          }
        },
      },
      {
        field: 'policy_id',
        name: POLICY_ID_TITLE,
        render: (policyId: string) => (
          <TextField text={policyId} dataTestSubj="uninstallTokensPolicyIdField" />
        ),
      },
      {
        field: 'created_at',
        name: CREATED_AT_TITLE,
        width: '130px',
        render: (createdAt: string) =>
          createdAt ? (
            <FormattedDate year="numeric" month="short" day="2-digit" value={createdAt} />
          ) : null,
      },
      {
        field: 'id',
        name: TOKEN_TITLE,
        width: '300px',
        render: (uninstallTokenId: string) => (
          <ApiKeyField apiKeyId={uninstallTokenId} getToken={getUninstallTokenValue} />
        ),
      },
      {
        field: 'actions',
        name: ACTIONS_TITLE,
        align: 'center',
        width: '70px',
        render: (_: any, { id }: UninstallTokenMetadata) => (
          <ViewUninstallCommandButton onClick={() => setTokenIdForFlyout(id)} />
        ),
      },
    ],
    []
  );

  const handleTablePagination = useCallback(
    ({ page }: CriteriaWithPagination<UninstallTokenMetadata>) => {
      setPagination((prevPagination) => ({
        ...prevPagination,
        currentPage: page.index + 1,
        pageSize: page.size,
      }));
    },
    [setPagination]
  );

  const handleSearch = useCallback(
    (searchString: string): void => {
      setPolicyIdOrNameSearch(searchString);
      setPagination((prevPagination) => ({ ...prevPagination, currentPage: 1 }));
    },
    [setPagination]
  );

  return (
    <DefaultLayout section="uninstall_tokens">
      {tokenIdForFlyout && (
        <UninstallCommandFlyout
          onClose={() => setTokenIdForFlyout(null)}
          target="agent"
          uninstallTokenId={tokenIdForFlyout}
        />
      )}

      <EuiFlexGroup direction="row" alignItems="center">
        <EuiFieldSearch
          onSearch={handleSearch}
          incremental
          fullWidth
          maxLength={50}
          placeholder={SEARCH_BY_POLICY_ID_OR_NAME_PLACEHOLDER}
          data-test-subj="uninstallTokensPolicyIdSearchInput"
        />

        <EuiIconTip content={SEARCH_BY_POLICY_ID_OR_NAME_HINT} type="info" />
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiBasicTable<UninstallTokenMetadata>
        data-test-subj="uninstallTokenListTable"
        tableCaption={i18n.translate('xpack.fleet.uninstallTokenList.tableCaption', {
          defaultMessage: 'List of uninstall tokens',
        })}
        items={tokens}
        columns={columns}
        itemId="id"
        loading={isLoading}
        pagination={{
          pageIndex: pagination.currentPage - 1,
          pageSize: pagination.pageSize,
          totalItemCount: total,
          pageSizeOptions,
        }}
        onChange={handleTablePagination}
        noItemsMessage={<NoItemsMessage isLoading={isLoading} />}
      />

      <EuiSpacer size="xl" />
    </DefaultLayout>
  );
};
