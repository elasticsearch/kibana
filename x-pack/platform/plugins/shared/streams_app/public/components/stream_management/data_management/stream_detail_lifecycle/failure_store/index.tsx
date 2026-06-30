/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import type { Streams } from '@kbn/streams-schema';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { NoFailureStorePanel } from './no_failure_store_panel';
import { FailureStoreInfo } from './failure_store_info';
import { useUpdateFailureStore } from '../../../../../hooks/use_update_failure_store';
import { useKibana } from '../../../../../hooks/use_kibana';
import { NoPermissionBanner } from './no_permission_banner';
import { useTimefilter } from '../../../../../hooks/use_timefilter';
import type { useDataStreamStats } from '../hooks/use_data_stream_stats';
import { useFailureStoreConfig } from '../hooks/use_failure_store_config';
import { LifecyclePreviewProvider } from '../common/hooks/lifecycle_preview';
import { useEditFailedLifecycleFlyout } from './hooks/use_edit_failed_lifecycle_flyout';

const StreamDetailFailureStoreInner = ({
  definition,
  data,
  refreshDefinition,
  isExternalFlyoutOpen = false,
  onFlyoutOpenChange,
}: {
  definition: Streams.ingest.all.GetResponse;
  data: ReturnType<typeof useDataStreamStats>;
  refreshDefinition: () => void;
  isExternalFlyoutOpen?: boolean;
  onFlyoutOpenChange?: (isOpen: boolean) => void;
}) => {
  const kibana = useKibana();
  const { updateFailureStore } = useUpdateFailureStore(definition.stream);
  const { timeState } = useTimefilter();

  const readFailureStorePrivilege = definition.privileges?.read_failure_store ?? false;
  const manageFailureStorePrivilege = definition.privileges?.manage_failure_store ?? false;

  const failureStoreConfig = useFailureStoreConfig(definition);

  const {
    mainFlyout,
    deletePhaseFlyout,
    overrideModal,
    openMainFlyout,
    openDeletePhaseFlyout,
    removeDeletePhase,
    isMainFlyoutOpen,
    isDeletePhaseFlyoutOpen,
    isAnyFlyoutOpen,
    failureStoreEnabledForUi,
    previewInheritLifecycle,
    previewFailureStoreEnabled,
  } = useEditFailedLifecycleFlyout({
    definition,
    data,
    refreshDefinition,
    failureStoreConfig,
    kibana,
    manageFailureStorePrivilege,
    updateFailureStore,
    isExternalFlyoutOpen,
    onFlyoutOpenChange,
  });

  return (
    <>
      <EuiFlexItem grow={false}>
        <EuiTitle size="xs">
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <h4>
                {i18n.translate('xpack.streams.streamDetailLifecycle.failedData', {
                  defaultMessage: 'Failed data',
                })}
              </h4>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiTitle>
        <EuiSpacer size="m" />
        <EuiFlexGroup direction="column" gutterSize="m">
          {readFailureStorePrivilege ? (
            <>
              {failureStoreEnabledForUi ? (
                <FailureStoreInfo
                  onEditFailedLifecycle={openMainFlyout}
                  onAddDeletePhase={openDeletePhaseFlyout}
                  onEditDeletePhase={openDeletePhaseFlyout}
                  onRemoveDeletePhase={removeDeletePhase}
                  isExternalFlyoutOpen={isAnyFlyoutOpen}
                  isDeletePhaseFlyoutOpen={isDeletePhaseFlyoutOpen}
                  isHighlighted={isMainFlyoutOpen}
                  previewInheritLifecycle={previewInheritLifecycle}
                  previewFailureStoreEnabled={previewFailureStoreEnabled}
                  definition={definition}
                  statsError={data.error}
                  isLoadingStats={data.isLoading}
                  stats={data.stats?.fs.stats}
                  timeState={timeState}
                  aggregations={data?.stats?.fs.aggregations}
                  failureStoreConfig={failureStoreConfig}
                />
              ) : (
                <NoFailureStorePanel
                  onEnableFailureStore={openMainFlyout}
                  definition={definition}
                  isExternalFlyoutOpen={isAnyFlyoutOpen}
                />
              )}
              <EuiSpacer size="s" />
            </>
          ) : (
            <NoPermissionBanner />
          )}
        </EuiFlexGroup>
      </EuiFlexItem>

      {readFailureStorePrivilege ? mainFlyout : null}
      {readFailureStorePrivilege ? deletePhaseFlyout : null}
      {readFailureStorePrivilege ? overrideModal : null}
    </>
  );
};

export const StreamDetailFailureStore = (props: {
  definition: Streams.ingest.all.GetResponse;
  data: ReturnType<typeof useDataStreamStats>;
  refreshDefinition: () => void;
  isExternalFlyoutOpen?: boolean;
  onFlyoutOpenChange?: (isOpen: boolean) => void;
}) => {
  return (
    <LifecyclePreviewProvider>
      <StreamDetailFailureStoreInner {...props} />
    </LifecyclePreviewProvider>
  );
};
