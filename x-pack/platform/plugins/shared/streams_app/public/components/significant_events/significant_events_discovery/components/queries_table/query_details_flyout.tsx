/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiCodeBlock,
  EuiConfirmModal,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiIcon,
  EuiPopover,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { DISCOVER_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import type { DiscoverAppLocatorParams } from '@kbn/discover-plugin/common';
import { i18n } from '@kbn/i18n';
import { QUERY_TYPE_MATCH, QUERY_TYPE_STATS } from '@kbn/significant-events-schema';
import React, { useEffect, useState } from 'react';
import { FlyoutMetadataCard } from '../../../../flyout_components/flyout_metadata_card';
import { FlyoutToolbarHeader } from '../../../../flyout_components/flyout_toolbar_header';
import type { StreamQueryStats } from '../../../../../hooks/significant_events/use_fetch_query_occurrence_stats';
import { useKibana } from '../../../../../hooks/use_kibana';
import { useTimefilter } from '../../../../../hooks/use_timefilter';
import { InfoPanel } from '../../../../info_panel';
import { SparkPlot } from '../../../../spark_plot';
import { SeverityBadge } from '../severity_badge/severity_badge';
import {
  OCCURRENCES_COLUMN,
  THRESHOLD_BREACHES_TOOLTIP_NAME,
  OPEN_IN_DISCOVER_ACTION_TITLE,
} from './translations';
import { AssetImage } from '../../../../asset_image';
import { QueryTypeBadge } from '../query_type_badge/query_type_badge';
import { buildDiscoverParams } from '../../utils/discover_helpers';

interface QueryDetailsFlyoutProps {
  item: StreamQueryStats;
  isDeleting: boolean;
  onClose: () => void;
  onDelete: (queryId: string, streamName: string) => Promise<void>;
}

const DEFAULT_QUERY_PLACEHOLDER = '--';

export function QueryDetailsFlyout({
  item,
  isDeleting,
  onClose,
  onDelete,
}: QueryDetailsFlyoutProps) {
  const { euiTheme } = useEuiTheme();
  const {
    dependencies: {
      start: { share },
    },
  } = useKibana();
  const { timeState } = useTimefilter();
  const discoverLocator = share.url.locators.get<DiscoverAppLocatorParams>(DISCOVER_APP_LOCATOR);
  const flyoutTitleId = useGeneratedHtmlId({
    prefix: 'queryDetailsFlyoutTitle',
  });
  const [isActionsPopoverOpen, setIsActionsPopoverOpen] = useState(false);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);

  useEffect(() => {
    setIsActionsPopoverOpen(false);
    setIsDeleteModalVisible(false);
  }, [item.query.id]);

  const queryType = item.query.type ?? QUERY_TYPE_MATCH;
  const hasDetectedOccurrences = item.occurrences?.some((point) => point.y > 0) ?? false;

  const generalInfoItems = [
    {
      title: TYPE_LABEL,
      description: <QueryTypeBadge type={queryType} />,
    },
    {
      title: DESCRIPTION_LABEL,
      description: (
        <EuiText size="s">{item.query.description || DEFAULT_QUERY_PLACEHOLDER}</EuiText>
      ),
    },
    {
      title: SEVERITY_DETAILS_LABEL,
      description: <SeverityBadge score={item.query.severity_score} />,
    },
  ];

  return (
    <>
      <EuiFlyout
        onClose={onClose}
        aria-labelledby={flyoutTitleId}
        type="push"
        ownFocus={false}
        size="40%"
        hideCloseButton
      >
        {/* First header: minimal toolbar with actions and close */}
        <FlyoutToolbarHeader>
          <EuiFlexItem grow={false}>
            <EuiPopover
              aria-label={ACTIONS_BUTTON_ARIA_LABEL}
              button={
                <EuiToolTip content={ACTIONS_BUTTON_ARIA_LABEL} disableScreenReaderOutput>
                  <EuiButtonIcon
                    data-test-subj="queriesTableQueryDetailsFlyoutActionsButton"
                    iconType="boxesVertical"
                    aria-label={ACTIONS_BUTTON_ARIA_LABEL}
                    onClick={() => setIsActionsPopoverOpen((value) => !value)}
                  />
                </EuiToolTip>
              }
              isOpen={isActionsPopoverOpen}
              closePopover={() => setIsActionsPopoverOpen(false)}
              panelPaddingSize="none"
              anchorPosition="downRight"
            >
              <EuiContextMenuPanel
                items={[
                  <EuiContextMenuItem
                    key="delete"
                    icon={<EuiIcon type="trash" color="danger" aria-hidden={true} />}
                    css={css`
                      color: ${euiTheme.colors.danger};
                    `}
                    onClick={() => {
                      setIsActionsPopoverOpen(false);
                      setIsDeleteModalVisible(true);
                    }}
                    data-test-subj="queriesTableQueryDetailsFlyoutDeleteAction"
                  >
                    {DELETE_ACTION_LABEL}
                  </EuiContextMenuItem>,
                ]}
              />
            </EuiPopover>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={CLOSE_BUTTON_ARIA_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                data-test-subj="queriesTableQueryDetailsFlyoutCloseButton"
                iconType="cross"
                aria-label={CLOSE_BUTTON_ARIA_LABEL}
                onClick={onClose}
              />
            </EuiToolTip>
          </EuiFlexItem>
        </FlyoutToolbarHeader>

        {/* Second header: title and metadata cards */}
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="s">
            <h2 id={flyoutTitleId}>{item.query.title}</h2>
          </EuiTitle>
          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="s" responsive={false} wrap>
            <EuiFlexItem>
              <FlyoutMetadataCard title={SEVERITY_DETAILS_LABEL}>
                <SeverityBadge score={item.query.severity_score} />
              </FlyoutMetadataCard>
            </EuiFlexItem>
            <EuiFlexItem>
              <FlyoutMetadataCard title={TYPE_LABEL}>
                <EuiBadge color="hollow">{queryType}</EuiBadge>
              </FlyoutMetadataCard>
            </EuiFlexItem>
            <EuiFlexItem>
              <FlyoutMetadataCard title={STREAM_LABEL}>
                <EuiBadge color="hollow" iconType="productStreamsClassic" iconSide="left">
                  {item.stream_name}
                </EuiBadge>
              </FlyoutMetadataCard>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutHeader>
        <EuiFlyoutBody
          banner={
            queryType === QUERY_TYPE_STATS && (
              <EuiCallOut
                announceOnMount
                title={STATS_CALLOUT_TITLE}
                color="primary"
                iconType="info"
                size="s"
              >
                <p>{STATS_CALLOUT_DESCRIPTION}</p>
              </EuiCallOut>
            )
          }
        >
          <EuiFlexGroup direction="column" gutterSize="m">
            <EuiFlexItem>
              <InfoPanel title={GENERAL_INFORMATION_TITLE}>
                {generalInfoItems.map((listItem, index) => (
                  <React.Fragment key={listItem.title}>
                    <EuiDescriptionList
                      type="column"
                      columnWidths={[1, 2]}
                      compressed
                      listItems={[listItem]}
                    />
                    {index < generalInfoItems.length - 1 && <EuiHorizontalRule margin="m" />}
                  </React.Fragment>
                ))}
              </InfoPanel>
            </EuiFlexItem>
            <EuiFlexItem>
              <InfoPanel
                title={QUERY_PANEL_TITLE}
                headerRightContent={
                  discoverLocator ? (
                    <EuiButtonEmpty
                      size="xs"
                      iconType="discoverApp"
                      iconSide="left"
                      onClick={() =>
                        discoverLocator.navigate(buildDiscoverParams(item.query, timeState))
                      }
                    >
                      {OPEN_IN_DISCOVER_ACTION_TITLE}
                    </EuiButtonEmpty>
                  ) : undefined
                }
              >
                <EuiCodeBlock language="esql" isCopyable paddingSize="m">
                  {getQueryInputValue(item) || DEFAULT_QUERY_PLACEHOLDER}
                </EuiCodeBlock>
              </InfoPanel>
            </EuiFlexItem>
            <EuiFlexItem>
              <InfoPanel
                title={
                  queryType === QUERY_TYPE_STATS
                    ? THRESHOLD_BREACHES_TOOLTIP_NAME
                    : OCCURRENCES_COLUMN
                }
              >
                {hasDetectedOccurrences ? (
                  <SparkPlot
                    id={`query-details-occurrences-${item.query.id}`}
                    name={
                      queryType === QUERY_TYPE_STATS
                        ? THRESHOLD_BREACHES_TOOLTIP_NAME
                        : OCCURRENCES_COLUMN
                    }
                    type="bar"
                    timeseries={item.occurrences}
                    annotations={[]}
                    height={160}
                  />
                ) : (
                  <EuiFlexGroup
                    direction="column"
                    gutterSize="s"
                    alignItems="center"
                    justifyContent="center"
                    css={{ height: '100%', minHeight: '200px', padding: '30px' }}
                  >
                    <AssetImage type="barChart" size="xs" />
                    <EuiText color="subdued" size="s" textAlign="center">
                      {queryType === QUERY_TYPE_STATS
                        ? NO_OCCURRENCES_STATS_DESCRIPTION
                        : NO_OCCURRENCES_DESCRIPTION}
                    </EuiText>
                  </EuiFlexGroup>
                )}
              </InfoPanel>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutBody>
      </EuiFlyout>
      {isDeleteModalVisible && (
        <EuiConfirmModal
          data-test-subj="queriesTableQueryDetailsFlyoutDeleteConfirmModal"
          aria-labelledby={DELETE_MODAL_TITLE_ID}
          title={DELETE_MODAL_TITLE}
          titleProps={{ id: DELETE_MODAL_TITLE_ID }}
          onCancel={() => {
            setIsDeleteModalVisible(false);
          }}
          onConfirm={async () => {
            await onDelete(item.query.id, item.stream_name);
            setIsDeleteModalVisible(false);
          }}
          cancelButtonText={CANCEL_BUTTON_LABEL}
          confirmButtonText={DELETE_CONFIRM_BUTTON_LABEL}
          isLoading={isDeleting}
          buttonColor="danger"
          defaultFocusedButton="confirm"
        >
          <p>{DELETE_MODAL_BODY}</p>
        </EuiConfirmModal>
      )}
    </>
  );
}

function getQueryInputValue(item: StreamQueryStats) {
  return item.query.esql?.query ?? '';
}

const STREAM_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.streamLabel',
  { defaultMessage: 'Stream' }
);

const GENERAL_INFORMATION_TITLE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.generalInformationTitle',
  { defaultMessage: 'General information' }
);

const TYPE_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.typeLabel',
  { defaultMessage: 'Type' }
);

const QUERY_PANEL_TITLE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.queryLabel',
  { defaultMessage: 'Query' }
);

const DESCRIPTION_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.descriptionLabel',
  { defaultMessage: 'Description' }
);

const SEVERITY_DETAILS_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.severityDetailsLabel',
  { defaultMessage: 'Severity' }
);

const ACTIONS_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.actionsButtonAriaLabel',
  { defaultMessage: 'Actions' }
);

const CLOSE_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.closeButtonAriaLabel',
  { defaultMessage: 'Close' }
);

const DELETE_ACTION_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.deleteActionLabel',
  { defaultMessage: 'Delete' }
);

const CANCEL_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.cancelButtonLabel',
  { defaultMessage: 'Cancel' }
);

const DELETE_MODAL_TITLE_ID = 'queryDetailsFlyoutDeleteModalTitle';

const DELETE_MODAL_TITLE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.deleteModalTitle',
  { defaultMessage: 'Delete query' }
);

const DELETE_MODAL_BODY = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.deleteModalBody',
  { defaultMessage: 'Are you sure you want to delete this query? This action cannot be undone.' }
);

const DELETE_CONFIRM_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.deleteConfirmButtonLabel',
  { defaultMessage: 'Delete query' }
);

const NO_OCCURRENCES_DESCRIPTION = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.noOccurrencesDescription',
  {
    defaultMessage:
      'No events detected yet. Leave the query as-is to display future events, or use the Open in Discover action to explore further.',
  }
);

const NO_OCCURRENCES_STATS_DESCRIPTION = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.noOccurrencesStatsDescription',
  {
    defaultMessage:
      'This STATS query is not monitored in the background. Use the Open in Discover action to preview its results.',
  }
);

const STATS_CALLOUT_TITLE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.statsCalloutTitle',
  { defaultMessage: 'STATS query' }
);

const STATS_CALLOUT_DESCRIPTION = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queryDetailsFlyout.statsCalloutDescription',
  {
    defaultMessage:
      'STATS queries detect aggregate patterns like rising error rates or latency spikes. They cannot be promoted to background scanning rules yet.',
  }
);
