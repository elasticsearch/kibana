/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiBasicTable,
  EuiBadge,
  EuiBetaBadge,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiSplitPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import { toMountPoint } from '@kbn/react-kibana-mount';
import {
  useInstallProductDoc,
  useUninstallProductDoc,
  useDefaultInferenceId,
  REACT_QUERY_KEYS,
  type ProductDocBasePluginStart,
} from '@kbn/product-doc-base-plugin/public';
import { ResourceTypes } from '@kbn/product-doc-common';
import { useQueries, useQueryClient } from '@kbn/react-query';
import { useKibana } from '../../hooks/use_kibana';
import type { DocumentationItem, DocumentationStatus } from './types';
import { DOCUMENTATION_ITEMS_CONFIG, type NormalizedDocStatus } from './documentation_items';
import { enableProductDocumentationToolOnDefaultAgent } from './enable_product_documentation_tool_on_agent';
import * as i18n from './translations';

interface DocumentationSectionProps {
  productDocBase: ProductDocBasePluginStart;
}

export const DocumentationSection: React.FC<DocumentationSectionProps> = ({ productDocBase }) => {
  const { services } = useKibana();
  const { application, docLinks } = services;

  // Check if user has Agent Builder 'All' privileges (manageAgents capability)
  const hasManagePrivilege = application.capabilities.agentBuilder?.manageAgents === true;

  const queryClient = useQueryClient();

  const { inferenceId: productDocInferenceId, isLoading: isProductDocInferenceIdLoading } =
    useDefaultInferenceId(productDocBase, ResourceTypes.productDoc);
  const { inferenceId: securityLabsInferenceId, isLoading: isSecurityLabsInferenceIdLoading } =
    useDefaultInferenceId(productDocBase, ResourceTypes.securityLabs);

  const inferenceIdByResourceType = useMemo(
    () => ({
      [ResourceTypes.productDoc]: productDocInferenceId,
      [ResourceTypes.securityLabs]: securityLabsInferenceId,
      [ResourceTypes.openapiSpec]: productDocInferenceId,
    }),
    [productDocInferenceId, securityLabsInferenceId]
  );

  const isInferenceIdLoading = isProductDocInferenceIdLoading || isSecurityLabsInferenceIdLoading;

  const docsConfig = DOCUMENTATION_ITEMS_CONFIG;

  const statusQueries = useQueries({
    queries: docsConfig.map((doc) => {
      const resourceType = doc.resourceType;
      const inferenceId = inferenceIdByResourceType[resourceType];
      return {
        // IMPORTANT: use the shared product-doc-base query key so the existing install/uninstall hooks
        // invalidate these queries automatically (otherwise status only updates on full refresh).
        queryKey: [REACT_QUERY_KEYS.GET_PRODUCT_DOC_STATUS, inferenceId, resourceType],
        queryFn: async () => doc.getNormalizedStatus({ productDocBase, inferenceId }),
        keepPreviousData: false,
        refetchOnWindowFocus: false,
        refetchInterval: (queryData?: NormalizedDocStatus) => {
          // Match useProductDocStatus behavior: poll when install/uninstall is in progress.
          const status = queryData?.status;

          return status === 'installing' || status === 'uninstalling' ? 2000 : false;
        },
      };
    }),
  });

  const isLoading = isInferenceIdLoading || statusQueries.some((q) => q.isLoading);

  const refetch = useCallback(() => {
    // Invalidate all doc status queries (for all rows) so they refresh together.
    queryClient.invalidateQueries({ queryKey: [REACT_QUERY_KEYS.GET_PRODUCT_DOC_STATUS] });
  }, [queryClient]);

  const documentationItems: DocumentationItem[] = useMemo(() => {
    return docsConfig.map((doc, idx) => {
      const data = statusQueries[idx]?.data;
      const status: DocumentationStatus = data?.status ?? 'uninstalled';
      const updateAvailable = doc.supportsUpdates ? Boolean(data?.updateAvailable) : false;

      return {
        id: doc.id,
        name: doc.name,
        status,
        resourceType: doc.resourceType,
        inferenceId: inferenceIdByResourceType[doc.resourceType],
        ...(updateAvailable ? { updateAvailable } : {}),
        isTechPreview: doc.isTechPreview,
        isStubbed: doc.isStubbed,
        icon: doc.icon,
        ...(data?.failureReason ? { failureReason: data.failureReason } : {}),
      };
    });
  }, [docsConfig, statusQueries, inferenceIdByResourceType]);

  const getErrorSuggestion = useCallback(
    (failureReason: string, endpointId: string): string | null => {
      if (failureReason.includes('model_deployment_timeout_exception')) {
        return i18n.getModelDeploymentTimeoutSuggestion(endpointId);
      }
      return null;
    },
    []
  );

  const getStatusBadge = useCallback(
    (item: DocumentationItem) => {
      switch (item.status) {
        case 'installed':
          return <EuiBadge color="success">{i18n.STATUS_INSTALLED}</EuiBadge>;
        case 'uninstalling':
          return <EuiBadge color="success">{i18n.STATUS_INSTALLED}</EuiBadge>;
        case 'error': {
          if (!item.failureReason) {
            return <EuiBadge color="danger">{i18n.STATUS_ERROR}</EuiBadge>;
          }
          const suggestion = getErrorSuggestion(item.failureReason, item.inferenceId ?? '');
          return (
            <EuiFlexGroup gutterSize="xs" direction="column" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiBadge color="danger">{i18n.STATUS_ERROR}</EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {item.failureReason}
                </EuiText>
              </EuiFlexItem>
              {suggestion && (
                <EuiFlexItem grow={false}>
                  <EuiText size="xs">{suggestion}</EuiText>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          );
        }
        case 'not_available':
          return <EuiBadge color="warning">{i18n.STATUS_NOT_AVAILABLE}</EuiBadge>;
        case 'installing':
        case 'uninstalled':
        default:
          return <EuiBadge color="hollow">{i18n.STATUS_NOT_INSTALLED}</EuiBadge>;
      }
    },
    [getErrorSuggestion]
  );

  const getActionButton = useCallback(
    (item: DocumentationItem) => {
      return (
        <DocumentationRowActions
          item={item}
          productDocBase={productDocBase}
          hasManagePrivilege={hasManagePrivilege}
          onRefetch={refetch}
        />
      );
    },
    [hasManagePrivilege, productDocBase, refetch]
  );

  const columns: Array<EuiBasicTableColumn<DocumentationItem>> = useMemo(
    () => [
      {
        field: 'name',
        name: i18n.COLUMN_NAME,
        sortable: false,
        render: (name: string, item: DocumentationItem) => (
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiIcon type={item.icon ?? 'documents'} aria-hidden={true} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="s">{name}</EuiText>
            </EuiFlexItem>
            {item.isTechPreview && (
              <EuiFlexItem grow={false}>
                <EuiBetaBadge label={i18n.TECH_PREVIEW} size="s" alignment="middle" />
              </EuiFlexItem>
            )}
            {item.updateAvailable && (
              <EuiFlexItem grow={false}>
                <EuiBadge color="warning">{i18n.UPDATE_AVAILABLE}</EuiBadge>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        ),
      },
      {
        field: 'status',
        name: i18n.COLUMN_STATUS,
        sortable: false,
        width: '300px',
        render: (_: DocumentationStatus, item: DocumentationItem) => getStatusBadge(item),
      },
      {
        field: 'actions',
        name: i18n.COLUMN_ACTIONS,
        sortable: false,
        width: '150px',
        align: 'right',
        render: (_: unknown, item: DocumentationItem) => getActionButton(item),
      },
    ],
    [getStatusBadge, getActionButton]
  );

  return (
    <EuiSplitPanel.Outer hasBorder grow={false} data-test-subj="documentationSection">
      <EuiSplitPanel.Inner color="subdued">
        <EuiTitle size="s">
          <h3 data-test-subj="documentationTitle">{i18n.DOCUMENTATION_TITLE}</h3>
        </EuiTitle>
      </EuiSplitPanel.Inner>
      <EuiSplitPanel.Inner>
        <EuiText size="s" color="subdued">
          {i18n.DOCUMENTATION_DESCRIPTION}{' '}
          <EuiLink href={docLinks.links.aiAssistantSettings} target="_blank" external>
            {i18n.LEARN_MORE}
          </EuiLink>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiText size="xs" color="subdued">
          {i18n.SHOWING} <strong>1-{documentationItems.length}</strong> {i18n.OF}{' '}
          {documentationItems.length} <strong>{i18n.DOCUMENTATION_TITLE}</strong>
        </EuiText>
        <EuiSpacer size="s" />
        <EuiBasicTable
          items={documentationItems}
          columns={columns}
          loading={isLoading}
          data-test-subj="documentationTable"
          tableCaption={i18n.DOCUMENTATION_TABLE_CAPTION}
        />
      </EuiSplitPanel.Inner>
    </EuiSplitPanel.Outer>
  );
};

const DocumentationRowActions: React.FC<{
  item: DocumentationItem;
  productDocBase: ProductDocBasePluginStart;
  hasManagePrivilege: boolean;
  onRefetch: () => void;
}> = ({ item, productDocBase, hasManagePrivilege, onRefetch }) => {
  const { services } = useKibana();
  const { application, http, notifications, rendering, docLinks } = services;

  const installMutation = useInstallProductDoc(productDocBase, {
    onSuccess: () => {
      notifications.toasts.addSuccess({ title: i18n.getInstallSuccessTitle(item.name) });

      enableProductDocumentationToolOnDefaultAgent({ http }).catch(() => {
        const toolsUrl = application.getUrlForApp('agent_builder', {
          path: `/agents/${encodeURIComponent(agentBuilderDefaultAgentId)}/tools`,
        });
        notifications.toasts.addWarning({
          title: i18n.getInstallSuccessTitle(item.name),
          text: toMountPoint(
            <EuiText size="s">
              <p>{i18n.TOOL_AUTO_ENABLE_FAILED_DESCRIPTION}</p>
              <p>
                <EuiLink href={toolsUrl}>{i18n.TOOL_AUTO_ENABLE_FAILED_LINK}</EuiLink>
              </p>
            </EuiText>,
            rendering
          ),
        });
      });
    },
    onError: (error) => {
      const message = error.body?.message ?? error.message;
      notifications.toasts.addDanger({
        title: i18n.getInstallErrorTitle(item.name),
        text: toMountPoint(
          <EuiText size="s">
            <p>{message}</p>
            <p>{i18n.AIR_GAPPED_HINT}</p>
            <p>
              <EuiLink href={docLinks.links.aiAssistantSettings} target="_blank" external>
                {i18n.LEARN_MORE}
              </EuiLink>
            </p>
          </EuiText>,
          rendering
        ),
      });
    },
  });

  const uninstallMutation = useUninstallProductDoc(productDocBase, {
    onSuccess: () => {
      notifications.toasts.addSuccess({ title: i18n.getUninstallSuccessTitle(item.name) });
    },
    onError: (error) => {
      notifications.toasts.addError(new Error(error.body?.message ?? error.message), {
        title: i18n.getUninstallErrorTitle(item.name),
      });
    },
  });

  const installVars = useMemo(
    () => ({
      inferenceId: item.inferenceId,
      resourceType: item.resourceType,
    }),
    [item.inferenceId, item.resourceType]
  );

  const isItemInstalling = item.status === 'installing' || installMutation.isLoading;
  const isItemUninstalling = item.status === 'uninstalling' || uninstallMutation.isLoading;

  const wrapWithPrivilegeTooltip = (button: React.ReactElement) => {
    if (!hasManagePrivilege) {
      return (
        <EuiToolTip content={i18n.INSUFFICIENT_PRIVILEGES} position="top">
          {button}
        </EuiToolTip>
      );
    }
    return button;
  };

  // Stubbed items show disabled install button
  if (item.isStubbed && item.status !== 'not_available') {
    return wrapWithPrivilegeTooltip(
      <EuiButtonEmpty
        size="xs"
        iconType="download"
        isDisabled={true}
        data-test-subj={`documentation-install-${item.id}`}
      >
        {i18n.ACTION_INSTALL}
      </EuiButtonEmpty>
    );
  }

  // Not available - show retry
  if (item.status === 'not_available') {
    return wrapWithPrivilegeTooltip(
      <EuiButtonEmpty
        size="xs"
        iconType="refresh"
        onClick={hasManagePrivilege ? () => onRefetch() : undefined}
        isDisabled={!hasManagePrivilege}
        data-test-subj={`documentation-retry-${item.id}`}
      >
        {i18n.ACTION_RETRY}
      </EuiButtonEmpty>
    );
  }

  // Error state - show retry
  if (item.status === 'error') {
    return wrapWithPrivilegeTooltip(
      <EuiButtonEmpty
        size="xs"
        iconType="refresh"
        onClick={hasManagePrivilege ? () => installMutation.mutate(installVars) : undefined}
        isDisabled={!hasManagePrivilege}
        data-test-subj={`documentation-retry-${item.id}`}
      >
        {i18n.ACTION_RETRY}
      </EuiButtonEmpty>
    );
  }

  // Uninstalling - show loading state
  if (isItemUninstalling) {
    return (
      <EuiButtonEmpty
        size="xs"
        isLoading={true}
        isDisabled={true}
        data-test-subj={`documentation-uninstalling-${item.id}`}
      >
        {i18n.STATUS_UNINSTALLING}
      </EuiButtonEmpty>
    );
  }

  // Installed - show uninstall button
  if (item.status === 'installed') {
    if (item.updateAvailable) {
      return wrapWithPrivilegeTooltip(
        <EuiFlexGroup
          gutterSize="s"
          alignItems="center"
          justifyContent="flexEnd"
          responsive={false}
        >
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="xs"
              iconType="refresh"
              onClick={hasManagePrivilege ? () => installMutation.mutate(installVars) : undefined}
              isDisabled={!hasManagePrivilege}
              data-test-subj={`documentation-update-${item.id}`}
            >
              {i18n.ACTION_UPDATE}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="xs"
              iconType="returnKey"
              onClick={hasManagePrivilege ? () => uninstallMutation.mutate(installVars) : undefined}
              isDisabled={!hasManagePrivilege}
              data-test-subj={`documentation-uninstall-${item.id}`}
            >
              {i18n.ACTION_UNINSTALL}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    }

    return wrapWithPrivilegeTooltip(
      <EuiButtonEmpty
        size="xs"
        iconType="returnKey"
        onClick={hasManagePrivilege ? () => uninstallMutation.mutate(installVars) : undefined}
        isDisabled={!hasManagePrivilege}
        data-test-subj={`documentation-uninstall-${item.id}`}
      >
        {i18n.ACTION_UNINSTALL}
      </EuiButtonEmpty>
    );
  }

  // Installing - show loading state
  if (isItemInstalling) {
    return (
      <EuiButtonEmpty
        size="xs"
        isLoading={true}
        isDisabled={true}
        data-test-subj={`documentation-installing-${item.id}`}
      >
        {i18n.STATUS_INSTALLING}
      </EuiButtonEmpty>
    );
  }

  // Default - show install button
  return wrapWithPrivilegeTooltip(
    <EuiButtonEmpty
      size="xs"
      iconType="download"
      onClick={hasManagePrivilege ? () => installMutation.mutate(installVars) : undefined}
      isDisabled={!hasManagePrivilege}
      data-test-subj={`documentation-install-${item.id}`}
    >
      {i18n.ACTION_INSTALL}
    </EuiButtonEmpty>
  );
};
