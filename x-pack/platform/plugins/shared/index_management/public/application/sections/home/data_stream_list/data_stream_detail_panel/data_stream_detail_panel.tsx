/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiSplitButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiTitle,
  EuiIcon,
  EuiPopover,
  EuiContextMenu,
} from '@elastic/eui';

import type { IndexManagementLocatorParams } from '@kbn/index-management-shared-types';
import { InspectIlmPolicyFlyout } from '@kbn/data-lifecycle-phases';
import { APP_MAIN_SCROLL_CONTAINER_ID } from '@kbn/core-chrome-layout-constants';
import { Streams, isIlmLifecycle as isStreamsIlmLifecycle } from '@kbn/streams-schema';
import { SectionLoading } from '../../../../../shared_imports';
import { SectionError } from '../../../../components';
import { LookupLifecycleWarningCallout } from '../../../../components/shared';
import { useLoadDataStream } from '../../../../services/api';
import { sendRequest } from '../../../../services/use_request';
import { DeleteDataStreamConfirmationModal } from '../delete_data_stream_confirmation_modal';
import { ILM_PAGES_POLICY_EDIT } from '../../../../constants';
import { useAppContext } from '../../../../app_context';
import { DataStreamsBadges } from '../data_stream_badges';
import { useIlmLocator } from '../../../../services/use_ilm_locator';
import { StreamsPromotion } from './streams_promotion';
import { INDEX_MANAGEMENT_LOCATOR_ID } from '../../../../../locator';
import { EditDataLifecycleFlyout } from '../../../../components/data_lifecycle/edit_data_lifecycle_flyout';
import { useResolvedDataStreamLifecycle, useEditDataLifecycle } from './lifecycle';
import { DataStreamDetailSummary } from './data_stream_detail_summary';
import {
  getIlmPolicyNameForSummary,
  isLookupLifecycleEditingNotApplicable,
  isLookupIndexMode,
} from '../../../../lib/data_streams';

interface Props {
  dataStreamName: string;
  onClose: (shouldReload?: boolean) => void;
}

export const ConditionalWrap = ({
  condition,
  wrap,
  children,
}: {
  condition: boolean;
  wrap: (wrappedChildren: React.ReactNode) => JSX.Element;
  children: JSX.Element;
}): JSX.Element => (condition ? wrap(children) : children);

export const DataStreamDetailPanel: React.FunctionComponent<Props> = ({
  dataStreamName,
  onClose,
}) => {
  const [isActionsPopOverOpen, setActionsPopOverOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [streamsGetResponse, setStreamsGetResponse] = useState<
    Streams.ingest.all.GetResponse | undefined
  >(undefined);

  const { error, data: dataStream, isLoading } = useLoadDataStream(dataStreamName);

  const resolvedLifecycle = useResolvedDataStreamLifecycle({ dataStream, streamsGetResponse });

  const {
    ilmPolicies,
    isEditingDataLifecycle,
    openEditFlyout,
    closeEditFlyout,
    applyDataLifecycle,
    flyoutSuccessfulData,
    flyoutFailedData,
    inspectedIlmPolicyName,
    inspectedIlmPolicy,
    closeInspectFlyout,
  } = useEditDataLifecycle({ dataStream, resolvedLifecycle, onClose });

  const { url, config, core } = useAppContext();
  const locator = url.locators.get<IndexManagementLocatorParams>(INDEX_MANAGEMENT_LOCATOR_ID);
  const summaryIlmPolicyName =
    !isLookupIndexMode(dataStream) &&
    streamsGetResponse &&
    isStreamsIlmLifecycle(streamsGetResponse.effective_lifecycle)
      ? streamsGetResponse.effective_lifecycle.ilm.policy
      : getIlmPolicyNameForSummary(dataStream);

  const ilmPolicyLink = useIlmLocator(ILM_PAGES_POLICY_EDIT, summaryIlmPolicyName);
  const inspectedIlmPolicyLink = useIlmLocator(ILM_PAGES_POLICY_EDIT, inspectedIlmPolicyName);

  let content;

  const discoverLocator = url?.locators.get('DISCOVER_APP_LOCATOR');

  useEffect(() => {
    if (!dataStream || dataStream._meta?.managed_by !== 'streams') {
      setStreamsGetResponse(undefined);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await sendRequest<Streams.all.GetResponse>({
          path: `/api/streams/${encodeURIComponent(dataStream.name)}`,
          method: 'get',
        });
        if (cancelled) return;
        if (data && Streams.ingest.all.GetResponse.is(data)) {
          setStreamsGetResponse(data);
        } else {
          setStreamsGetResponse(undefined);
        }
      } catch {
        if (!cancelled) {
          setStreamsGetResponse(undefined);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [dataStream]);

  if (isLoading) {
    content = (
      <SectionLoading>
        {i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.loadingDataStreamDescription', {
          defaultMessage: 'Loading data stream',
        })}
      </SectionLoading>
    );
  } else if (error) {
    content = (
      <SectionError
        title={i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.loadingDataStreamErrorMessage', {
          defaultMessage: 'Error loading data stream',
        })}
        error={{ message: error.message, cause: error.cause }}
        data-test-subj="sectionError"
      />
    );
  } else if (dataStream) {
    content = (
      <DataStreamDetailSummary
        dataStream={dataStream}
        dataStreamName={dataStreamName}
        isServerless={config.isServerless}
        enableSizeAndDocCount={config.enableSizeAndDocCount}
        enableDataStreamStats={config.enableDataStreamStats}
        enableIndexMode={config.enableIndexMode}
        locator={locator}
        navigateToUrl={core.application.navigateToUrl}
        ilmPolicies={ilmPolicies}
        summaryIlmPolicyName={summaryIlmPolicyName}
        ilmPolicyLink={ilmPolicyLink}
        resolvedLifecycle={resolvedLifecycle}
        streamsGetResponse={streamsGetResponse}
      />
    );
  }

  const closePopover = () => {
    setActionsPopOverOpen(false);
  };

  const isSuccessfulDataLifecycleNotApplicable = isLookupLifecycleEditingNotApplicable(dataStream);

  const panels: EuiContextMenuPanelDescriptor[] = useMemo(() => {
    const items: NonNullable<EuiContextMenuPanelDescriptor['items']> = [];

    // Editing the lifecycle can touch the failure store (`putDataStreamOptions`) and, on
    // stateful, index/data-stream settings. Both require the `manage` index privilege on every
    // deployment (including Serverless), while the DSL lifecycle put needs
    // `manage_data_stream_lifecycle`. Require both so the combined save can never partially fail.
    if (dataStream?.privileges?.manage && dataStream?.privileges?.manage_data_stream_lifecycle) {
      items.push({
        key: 'editDataLifecycle',
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.managePanelEditDataLifecycle', {
          defaultMessage: 'Edit data lifecycle',
        }),
        'data-test-subj': 'editDataLifecycleButton',
        icon: <EuiIcon type="gear" size="m" aria-hidden={true} />,
        onClick: () => {
          closePopover();
          openEditFlyout();
        },
      });
    }

    if (dataStream?.privileges?.delete_index) {
      items.push({
        key: 'deleteDataStream',
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.managePanelDelete', {
          defaultMessage: 'Delete',
        }),
        'data-test-subj': 'deleteDataStreamButton',
        icon: <EuiIcon type="trash" size="m" aria-hidden={true} />,
        onClick: () => {
          closePopover();
          setIsDeleting(true);
        },
      });
    }

    return [
      {
        id: 0,
        items,
      },
    ];
  }, [
    dataStream?.privileges?.delete_index,
    dataStream?.privileges?.manage,
    dataStream?.privileges?.manage_data_stream_lifecycle,
    openEditFlyout,
  ]);

  const hasActions = !isLoading && !error && Boolean(panels[0].items?.length);

  const viewInDiscoverLabel = i18n.translate(
    'xpack.idxMgmt.dataStreamDetailPanel.viewInDiscoverButton',
    { defaultMessage: 'View in Discover' }
  );

  const viewInDiscover = useCallback(async () => {
    if (!discoverLocator) {
      return;
    }
    await discoverLocator.navigate({ dataViewSpec: { title: dataStreamName } });
  }, [dataStreamName, discoverLocator]);

  // Scope the secondary flyouts to the app's main scroll container so they stack
  // on top of this detail panel flyout instead of being positioned against the
  // viewport (which would overlap the global Kibana header).
  const flyoutContainer = useMemo(
    () =>
      typeof document !== 'undefined'
        ? document.getElementById(APP_MAIN_SCROLL_CONTAINER_ID) ?? undefined
        : undefined,
    []
  );

  return (
    <>
      {!isEditingDataLifecycle && (
        <EuiFlyout
          onClose={() => onClose()}
          data-test-subj="dataStreamDetailPanel"
          aria-labelledby="dataStreamDetailPanelTitle"
          size={400}
        >
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="s">
              <h2 id="dataStreamDetailPanelTitle" data-test-subj="dataStreamDetailPanelTitle">
                {dataStreamName}
                {dataStream && <DataStreamsBadges dataStream={dataStream} />}
              </h2>
            </EuiTitle>
          </EuiFlyoutHeader>

          <EuiFlyoutBody
            data-test-subj="content"
            banner={
              dataStream && dataStream.hidden !== true ? (
                <StreamsPromotion dataStreamName={dataStreamName} />
              ) : undefined
            }
          >
            {content}
          </EuiFlyoutBody>

          <EuiFlyoutFooter>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  flush="left"
                  size="s"
                  onClick={() => onClose()}
                  data-test-subj="closeDetailsButton"
                  aria-label={i18n.translate(
                    'xpack.idxMgmt.dataStreamDetailPanel.closeButtonLabel',
                    {
                      defaultMessage: 'Close',
                    }
                  )}
                >
                  {i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.closeButtonLabel', {
                    defaultMessage: 'Close',
                  })}
                </EuiButtonEmpty>
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                {hasActions ? (
                  <EuiPopover
                    aria-label={i18n.translate(
                      'xpack.idxMgmt.dataStreamDetailPanel.actionsMenuAriaLabel',
                      { defaultMessage: 'Data stream actions menu' }
                    )}
                    button={
                      <EuiSplitButton size="s">
                        <EuiSplitButton.ActionPrimary
                          iconType="discoverApp"
                          onClick={viewInDiscover}
                          isDisabled={!discoverLocator}
                          data-test-subj="viewInDiscoverButton"
                        >
                          {viewInDiscoverLabel}
                        </EuiSplitButton.ActionPrimary>

                        <EuiSplitButton.ActionSecondary
                          iconType="gear"
                          tooltipProps={{
                            content: i18n.translate(
                              'xpack.idxMgmt.dataStreamDetailPanel.actionsButtonToolTip',
                              { defaultMessage: 'Actions' }
                            ),
                            disableScreenReaderOutput: true,
                          }}
                          aria-label={i18n.translate(
                            'xpack.idxMgmt.dataStreamDetailPanel.actionsButtonAriaLabel',
                            { defaultMessage: 'Open data stream actions menu' }
                          )}
                          onClick={() => setActionsPopOverOpen((open) => !open)}
                          data-test-subj="manageDataStreamButton"
                        />
                      </EuiSplitButton>
                    }
                    isOpen={isActionsPopOverOpen}
                    closePopover={closePopover}
                    panelPaddingSize="none"
                    anchorPosition="upLeft"
                  >
                    <EuiContextMenu initialPanelId={0} panels={panels} />
                  </EuiPopover>
                ) : (
                  <EuiButton
                    iconType="discoverApp"
                    size="s"
                    onClick={viewInDiscover}
                    isDisabled={!discoverLocator}
                    data-test-subj="viewInDiscoverButton"
                  >
                    {viewInDiscoverLabel}
                  </EuiButton>
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </EuiFlyout>
      )}

      {isDeleting && (
        <DeleteDataStreamConfirmationModal
          onClose={(data) => {
            if (data && data.hasDeletedDataStreams) {
              onClose(true);
            } else {
              setIsDeleting(false);
            }
          }}
          dataStreams={[dataStreamName]}
        />
      )}

      {isEditingDataLifecycle && dataStream && (
        <EditDataLifecycleFlyout
          onClose={closeEditFlyout}
          onApply={applyDataLifecycle}
          isServerless={config.isServerless}
          successfulData={{
            ...flyoutSuccessfulData,
            notice: isSuccessfulDataLifecycleNotApplicable ? (
              <LookupLifecycleWarningCallout
                description={
                  <FormattedMessage
                    id="xpack.idxMgmt.dataStreamDetailPanel.lookupLifecycleWarningDescription"
                    defaultMessage="Elasticsearch skips indices with the lookup index mode when running the data stream lifecycle, so these settings are not applied to this data stream's data. The failed data lifecycle still applies."
                  />
                }
              />
            ) : undefined,
          }}
          failedData={flyoutFailedData}
          container={flyoutContainer}
        />
      )}

      {inspectedIlmPolicyName && inspectedIlmPolicy && (
        <InspectIlmPolicyFlyout
          policyName={inspectedIlmPolicyName}
          policy={inspectedIlmPolicy}
          type="overlay"
          container={flyoutContainer}
          onBack={closeInspectFlyout}
          onEditPolicy={() => {
            if (inspectedIlmPolicyLink) {
              core.application.navigateToUrl(inspectedIlmPolicyLink);
            }
          }}
          primaryAction={{
            label: i18n.translate('xpack.idxMgmt.inspectIlmPolicy.selectPolicyLabel', {
              defaultMessage: 'Apply',
            }),
            onClick: async (policyName) => {
              await applyDataLifecycle({
                successfulData: {
                  inheritLifecycle: false,
                  method: 'ilm',
                  ilmPolicyName: policyName,
                },
              });
            },
          }}
        />
      )}
    </>
  );
};
