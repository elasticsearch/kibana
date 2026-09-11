/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import {
  EuiBadge,
  EuiDescriptionList,
  EuiDescriptionListDescription,
  EuiDescriptionListTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiLink,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import type { IndexManagementLocatorParams } from '@kbn/index-management-shared-types';
import type { LocatorPublic } from '@kbn/share-plugin/public';
import type { IlmPolicyForFlyout } from '@kbn/data-lifecycle-phases';
import type { Streams } from '@kbn/streams-schema';
import {
  isDslLifecycle as isStreamsDslLifecycle,
  isIlmLifecycle as isStreamsIlmLifecycle,
  isEnabledFailureStore,
  isEnabledLifecycleFailureStore,
  isDisabledLifecycleFailureStore,
} from '@kbn/streams-schema';
import type { ApplicationStart } from '@kbn/core/public';

import { indexModeLabels } from '../../../../lib/index_mode_labels';
import {
  getRetentionPeriod,
  resolveLifecycleForSummary,
  isIlmLifecyclePreferred,
  isLookupLifecycleNotApplicable,
  isLookupIndexMode,
  formatDlmLifecycleSummary,
  getDlmDataPhasesLabel,
  getDlmDownsamplingStepsLabel,
} from '../../../../lib/data_streams';
import { buildFailureStoreRetentionSummary } from '../../../../lib/failure_store_retention_summary';
import { getInfiniteRetentionLabel } from '../../../../lib/infinite_retention_label';
import { DataHealth } from '../../../../components';
import { humanizeTimeStamp } from '../humanize_time_stamp';
import { formatByteSizeString } from '../../../../lib/format_bytes';
import type { DataStream } from '../../../../../../common';
import { isWiredStreamDataStream, streamsDslToEsLifecycle } from './lifecycle';
import type { ResolvedDataStreamLifecycle } from './lifecycle';
import { LookupLifecycleNotApplicable } from '../data_retention_value';

interface Detail {
  name: string;
  toolTip: string;
  content: React.ReactNode;
  dataTestSubj: string;
}

interface DetailsListProps {
  details: Detail[];
}

const DetailsList: React.FunctionComponent<DetailsListProps> = ({ details }) => {
  const { euiTheme } = useEuiTheme();
  const titleTextStyles = useMemo(
    () => css`
      color: ${euiTheme.colors.text};
      font-weight: ${euiTheme.font.weight.semiBold};
      line-height: ${euiTheme.font.lineHeightMultiplier};
    `,
    [euiTheme]
  );
  const descriptionListItems = details.map((detail, index) => {
    const { name, toolTip, content, dataTestSubj } = detail;

    return (
      <Fragment key={`${name}-${index}`}>
        <EuiDescriptionListTitle>
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiText component="span" size="s" css={titleTextStyles}>
                {name}
              </EuiText>
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              {toolTip && <EuiIconTip content={toolTip} position="top" />}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiDescriptionListTitle>

        <EuiDescriptionListDescription data-test-subj={dataTestSubj}>
          <EuiText component="div" size="s" color="default">
            {content}
          </EuiText>
        </EuiDescriptionListDescription>
      </Fragment>
    );
  });

  return (
    <EuiDescriptionList textStyle="reverse" rowGutterSize="m">
      {descriptionListItems}
    </EuiDescriptionList>
  );
};

interface DataStreamDetailSummaryProps {
  dataStream: DataStream;
  dataStreamName: string;
  isServerless: boolean;
  enableSizeAndDocCount: boolean;
  enableDataStreamStats: boolean;
  enableIndexMode: boolean;
  locator?: LocatorPublic<IndexManagementLocatorParams>;
  navigateToUrl: ApplicationStart['navigateToUrl'];
  ilmPolicies: IlmPolicyForFlyout[];
  summaryIlmPolicyName?: string;
  ilmPolicyLink?: string;
  resolvedLifecycle: ResolvedDataStreamLifecycle;
  streamsGetResponse?: Streams.ingest.all.GetResponse;
}

export const DataStreamDetailSummary: React.FunctionComponent<DataStreamDetailSummaryProps> = ({
  dataStream,
  dataStreamName,
  isServerless,
  enableSizeAndDocCount,
  enableDataStreamStats,
  enableIndexMode,
  locator,
  navigateToUrl,
  ilmPolicies,
  summaryIlmPolicyName,
  ilmPolicyLink,
  resolvedLifecycle,
  streamsGetResponse,
}) => {
  const dlmTiersLayoutEnabled = !isServerless;
  const {
    health,
    indices,
    timeStampField,
    generation,
    indexTemplateName,
    storageSize,
    maxTimeStamp,
    meteringStorageSize,
    meteringDocsCount,
    indexMode,
  } = dataStream;

  const formatDlmLifecycleSummaryForDetails = (value?: DataStream['lifecycle']) =>
    formatDlmLifecycleSummary(value, {
      includePhaseCount: dlmTiersLayoutEnabled,
      includeDownsampling: dlmTiersLayoutEnabled,
    });

  const indicesLink = (
    <EuiLink
      href={
        locator?.getRedirectUrl({
          page: 'data_stream_index_list',
          dataStreamName,
        }) || ''
      }
    >
      {indices.length}
    </EuiLink>
  );

  const defaultDetails: Detail[] = [
    {
      name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.healthTitle', {
        defaultMessage: 'Health',
      }),
      toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.healthToolTip', {
        defaultMessage: `The health of the data stream's current backing indices.`,
      }),
      content: <DataHealth health={health} />,
      dataTestSubj: 'healthDetail',
    },
  ];

  // add either documents count and size or last updated and size
  if (enableSizeAndDocCount) {
    defaultDetails.push(
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.meteringDocsCountTitle', {
          defaultMessage: 'Documents count',
        }),
        toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.meteringDocsCountToolTip', {
          defaultMessage: 'The number of documents in this data stream.',
        }),
        content: meteringDocsCount,
        dataTestSubj: 'docsCountDetail',
      },
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.storageSizeTitle', {
          defaultMessage: 'Storage size',
        }),
        toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.storageSizeToolTip', {
          defaultMessage: `The total size of all shards in the data stream’s backing indices.`,
        }),
        content: formatByteSizeString(meteringStorageSize),
        dataTestSubj: 'meteringStorageSizeDetail',
      }
    );
  }
  if (enableDataStreamStats) {
    defaultDetails.push(
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.maxTimeStampTitle', {
          defaultMessage: 'Last updated',
        }),
        toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.maxTimeStampToolTip', {
          defaultMessage: 'The most recent document to be added to the data stream.',
        }),
        content: maxTimeStamp ? (
          humanizeTimeStamp(maxTimeStamp)
        ) : (
          <em>
            {i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.maxTimeStampNoneMessage', {
              defaultMessage: `Never`,
            })}
          </em>
        ),
        dataTestSubj: 'lastUpdatedDetail',
      },
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.storageSizeTitle', {
          defaultMessage: 'Storage size',
        }),
        toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.storageSizeToolTip', {
          defaultMessage: `The total size of all shards in the data stream’s backing indices.`,
        }),
        content: formatByteSizeString(storageSize),
        dataTestSubj: 'storageSizeDetail',
      }
    );
  }

  defaultDetails.push(
    {
      name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.indicesTitle', {
        defaultMessage: 'Indices',
      }),
      toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.indicesToolTip', {
        defaultMessage: `The data stream's current backing indices.`,
      }),
      content: indicesLink,
      dataTestSubj: 'indicesDetail',
    },
    {
      name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.timestampFieldTitle', {
        defaultMessage: 'Timestamp field',
      }),
      toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.timestampFieldToolTip', {
        defaultMessage: 'The timestamp field shared by all documents in the data stream.',
      }),
      content: timeStampField.name,
      dataTestSubj: 'timestampDetail',
    },
    {
      name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.generationTitle', {
        defaultMessage: 'Generation',
      }),
      toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.generationToolTip', {
        defaultMessage: 'The number of backing indices generated for the data stream.',
      }),
      content: generation,
      dataTestSubj: 'generationDetail',
    },
    {
      name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.indexTemplateTitle', {
        defaultMessage: 'Index template',
      }),
      toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.indexTemplateToolTip', {
        defaultMessage:
          'The index template that configured the data stream and configures its backing indices.',
      }),
      content: (
        <EuiLink
          data-test-subj={'indexTemplateLink'}
          href={
            locator?.getRedirectUrl({
              page: 'index_template',
              indexTemplate: indexTemplateName,
            }) || ''
          }
        >
          {indexTemplateName}
        </EuiLink>
      ),
      dataTestSubj: 'indexTemplateDetail',
    },
    ...(enableIndexMode
      ? [
          {
            name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.indexModeTitle', {
              defaultMessage: 'Index mode',
            }),
            toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.indexModeToolTip', {
              defaultMessage:
                'The index mode reported for the data stream. Backing indices can retain modes from earlier configurations.',
            }),
            content: indexModeLabels[indexMode],
            dataTestSubj: 'indexModeDetail',
          },
        ]
      : []),
    {
      name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.successfulIngestLifecycleTitle', {
        defaultMessage: 'Successful ingest lifecycle',
      }),
      toolTip: i18n.translate(
        'xpack.idxMgmt.dataStreamDetailPanel.successfulIngestLifecycleToolTip',
        {
          defaultMessage:
            'How long successfully ingested documents are kept before being automatically deleted.',
        }
      ),
      content: (() => {
        if (isLookupLifecycleNotApplicable(dataStream)) {
          return <LookupLifecycleNotApplicable />;
        }

        const effectiveLifecycle = streamsGetResponse?.effective_lifecycle;
        const isLookup = isLookupIndexMode(dataStream);
        const isWired = isWiredStreamDataStream(dataStream);
        const isIlm =
          effectiveLifecycle != null && !isLookup
            ? isStreamsIlmLifecycle(effectiveLifecycle)
            : isIlmLifecyclePreferred(dataStream);

        const methodLabel = isIlm ? (
          (() => {
            const prefix = i18n.translate(
              'xpack.idxMgmt.dataStreamDetailPanel.successfulIngestLifecycleMethodIlmPrefix',
              { defaultMessage: 'ILM:' }
            );
            const policyName =
              typeof summaryIlmPolicyName === 'string' && summaryIlmPolicyName.length > 0
                ? summaryIlmPolicyName
                : i18n.translate(
                    'xpack.idxMgmt.dataStreamDetailPanel.successfulIngestLifecycleMethodIlmUnknown',
                    { defaultMessage: 'Unknown policy' }
                  );

            return (
              <EuiText size="s">
                {prefix}{' '}
                {ilmPolicyLink ? (
                  <EuiLink
                    data-test-subj="ilmPolicyLink"
                    href={ilmPolicyLink}
                    onClick={(event: React.MouseEvent) => {
                      // Let the browser handle modified clicks (open in new tab, etc.) natively;
                      // only intercept plain left clicks for in-app (SPA) navigation.
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
                        return;
                      }
                      event.preventDefault();
                      navigateToUrl(ilmPolicyLink);
                    }}
                  >
                    {policyName}
                  </EuiLink>
                ) : (
                  policyName
                )}
              </EuiText>
            );
          })()
        ) : (
          <EuiText size="s">
            {i18n.translate(
              'xpack.idxMgmt.dataStreamDetailPanel.successfulIngestLifecycleMethodDsl',
              {
                defaultMessage: 'Data stream lifecycle',
              }
            )}
          </EuiText>
        );

        const streamsDlmLifecycle =
          effectiveLifecycle != null && isStreamsDslLifecycle(effectiveLifecycle)
            ? streamsDslToEsLifecycle(effectiveLifecycle.dsl)
            : undefined;

        const summary = (() => {
          if (isIlm) {
            const policy =
              typeof summaryIlmPolicyName === 'string' && summaryIlmPolicyName.length > 0
                ? ilmPolicies.find((p) => p.name === summaryIlmPolicyName)
                : undefined;

            if (!policy) {
              return '';
            }

            const phaseEntries = Object.values(policy.phases ?? {});
            const phaseCount = phaseEntries.filter(Boolean).length;

            const retentionRaw = policy.phases.delete?.min_age;
            const hasRetention = typeof retentionRaw === 'string' && retentionRaw.length > 0;
            const retentionLabel = hasRetention
              ? getRetentionPeriod(retentionRaw)
              : getInfiniteRetentionLabel();

            const shouldShowPhaseCounts = !isServerless;
            const phasesLabel = shouldShowPhaseCounts
              ? getDlmDataPhasesLabel(phaseCount)
              : undefined;

            const downsampleCount = phaseEntries.filter(
              (phase) => phase?.actions && 'downsample' in phase.actions
            ).length;

            const downsampleLabel = getDlmDownsamplingStepsLabel(downsampleCount);

            return [retentionLabel, phasesLabel, downsampleLabel].filter(Boolean).join(' · ');
          }

          const lifecycleForSummary = resolveLifecycleForSummary(
            (!isLookup ? streamsDlmLifecycle : undefined) ?? dataStream.lifecycle,
            {
              hasDataStream: true,
            }
          );
          return formatDlmLifecycleSummaryForDetails(lifecycleForSummary);
        })();

        const dataStreamDownsampling = dataStream.lifecycle?.downsampling ?? [];
        const streamsDownsampling =
          effectiveLifecycle != null && isStreamsDslLifecycle(effectiveLifecycle)
            ? effectiveLifecycle.dsl.downsample ?? []
            : [];
        const lookupDownsamplingMatches =
          dataStreamDownsampling.length === streamsDownsampling.length &&
          dataStreamDownsampling.every(
            (round, index) =>
              round.after === streamsDownsampling[index]?.after &&
              round.fixed_interval === streamsDownsampling[index]?.fixed_interval
          ) &&
          (dataStream.lifecycle?.downsampling_method === undefined ||
            dataStream.lifecycle.downsampling_method === 'aggregate');
        const lookupLifecycleMatchesStreams =
          streamsDlmLifecycle !== undefined &&
          dataStream.lifecycle?.enabled === streamsDlmLifecycle.enabled &&
          dataStream.lifecycle?.data_retention === streamsDlmLifecycle.data_retention &&
          dataStream.lifecycle?.frozen_after === streamsDlmLifecycle.frozen_after &&
          lookupDownsamplingMatches;
        const isInherited =
          resolvedLifecycle.inheritSuccessful &&
          (!isLookup || (!isIlm && (!isWired || lookupLifecycleMatchesStreams)));

        return (
          <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>{methodLabel}</EuiFlexItem>
                {isInherited && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge>
                      {i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.inheritedBadgeLabel', {
                        defaultMessage: 'Inherited',
                      })}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {summary}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        );
      })(),
      dataTestSubj: 'successfulIngestLifecycleDetail',
    },
    {
      name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.failedIngestLifecycleTitle', {
        defaultMessage: 'Failed ingest lifecycle',
      }),
      toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.failedIngestLifecycleToolTip', {
        defaultMessage:
          'How long failed documents are kept in the failure store before being automatically deleted.',
      }),
      content: (() => {
        const streamsFailureStore = streamsGetResponse?.effective_failure_store;
        const failureStoreEnabled =
          streamsFailureStore != null
            ? isEnabledFailureStore(streamsFailureStore)
            : dataStream.failureStoreEnabled === true;

        const isFailedInherited = resolvedLifecycle.inheritFailed;

        const methodLabel = i18n.translate(
          'xpack.idxMgmt.dataStreamDetailPanel.failedIngestLifecycleMethodDsl',
          {
            defaultMessage: 'Data stream lifecycle',
          }
        );

        const disabledLabel = i18n.translate(
          'xpack.idxMgmt.dataStreamDetailPanel.failedIngestLifecycleDisabled',
          {
            defaultMessage: 'Disabled',
          }
        );

        if (!failureStoreEnabled) {
          return (
            <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s">{methodLabel}</EuiText>
                  </EuiFlexItem>
                  {isFailedInherited && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge>
                        {i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.inheritedBadgeLabel', {
                          defaultMessage: 'Inherited',
                        })}
                      </EuiBadge>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {disabledLabel}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        }

        const streamsRetention =
          streamsFailureStore != null && isEnabledLifecycleFailureStore(streamsFailureStore)
            ? streamsFailureStore.lifecycle.enabled.data_retention
            : undefined;

        const isRetentionDisabled =
          streamsFailureStore != null
            ? isDisabledLifecycleFailureStore(streamsFailureStore)
            : dataStream.failureStoreRetention?.retentionDisabled === true;
        const retention =
          streamsRetention ??
          dataStream.failureStoreRetention?.customRetentionPeriod ??
          dataStream.failureStoreRetention?.defaultRetentionPeriod;
        const retentionValue = typeof retention === 'string' ? retention : undefined;
        const summary = buildFailureStoreRetentionSummary(
          {
            enabled: failureStoreEnabled,
            retention: retentionValue,
            retentionDisabled: isRetentionDisabled,
          },
          'data_stream',
          {
            disabledLabel,
            infiniteLabel: getInfiniteRetentionLabel(),
          },
          { showPhaseCounts: !isServerless }
        );

        return (
          <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiText size="s">{methodLabel}</EuiText>
                </EuiFlexItem>
                {isFailedInherited && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge>
                      {i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.inheritedBadgeLabel', {
                        defaultMessage: 'Inherited',
                      })}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {summary}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        );
      })(),
      dataTestSubj: 'failedIngestLifecycleDetail',
    }
  );

  return <DetailsList details={defaultDetails} />;
};
