/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { EuiFlexGroup, EuiFlexItem, EuiPageHeader, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { Streams } from '@kbn/streams-schema';
import { STREAMS_UI_PRIVILEGES } from '@kbn/streams-plugin/public';
import React from 'react';
import { useStreamsAppParams } from '../../../../hooks/use_streams_app_params';
import { useStreamsAppRouter } from '../../../../hooks/use_streams_app_router';
import { useStreamsPrivileges } from '../../../../hooks/use_streams_privileges';
import { useTimeRange } from '../../../../hooks/use_time_range';
import { QueryStreamSchemaEditor } from '../../../query_streams/query_stream_schema_editor';
import { RedirectTo } from '../../../redirect_to';
import { DiscoverBadgeButton, QueryStreamBadge } from '../../../stream_badges';
import { StreamDetailAttachments } from '../../../stream_detail_attachments';
import { StreamOverview } from '../../../stream_detail_overview';
import { StreamsAppPageTemplate } from '../../../streams_app_page_template';
import { useStreamsDetailManagementTabs } from './use_streams_detail_management_tabs';
import type { ManagementTabs } from './wrapper';
import { QueryStreamPartitioning } from '../stream_detail_routing/query_stream_partitioning';
import { StreamDetailActionsMenu } from './stream_detail_actions_menu';

const queryStreamManagementSubTabs = [
  'overview',
  'partitioning',
  'schema',
  'significantEvents',
  'attachments',
] as const;

type QueryStreamManagementSubTab = (typeof queryStreamManagementSubTabs)[number];

function isValidManagementSubTab(value: string): value is QueryStreamManagementSubTab {
  return queryStreamManagementSubTabs.includes(value as QueryStreamManagementSubTab);
}

export function QueryStreamDetailManagement({
  definition,
  refreshDefinition,
}: {
  definition: Streams.QueryStream.GetResponse;
  refreshDefinition: () => void;
}) {
  const router = useStreamsAppRouter();
  const {
    path: { key, tab },
  } = useStreamsAppParams('/{key}/management/{tab}');
  const { rangeFrom, rangeTo } = useTimeRange();
  const streamsPrivileges = useStreamsPrivileges();

  const { euiTheme } = useEuiTheme();
  const canDeleteQueryStream = streamsPrivileges.ui[STREAMS_UI_PRIVILEGES.manage];

  const { significantEvents } = useStreamsDetailManagementTabs({
    definition,
    refreshDefinition,
  });

  const tabs: ManagementTabs = {};

  tabs.overview = {
    content: <StreamOverview />,
    label: i18n.translate('xpack.streams.streamDetailView.overviewTab', {
      defaultMessage: 'Overview',
    }),
  };

  tabs.partitioning = {
    content: (
      <QueryStreamPartitioning definition={definition} refreshDefinition={refreshDefinition} />
    ),
    label: i18n.translate('xpack.streams.streamDetailView.partitioningTab', {
      defaultMessage: 'Partitioning',
    }),
  };

  tabs.schema = {
    content: (
      <QueryStreamSchemaEditor definition={definition} refreshDefinition={refreshDefinition} />
    ),
    label: i18n.translate('xpack.streams.streamDetailView.schemaEditorTab', {
      defaultMessage: 'Schema',
    }),
  };

  tabs.attachments = {
    content: <StreamDetailAttachments definition={definition} />,
    label: i18n.translate('xpack.streams.streamDetailView.attachmentsTab', {
      defaultMessage: 'Attachments',
    }),
  };

  if (significantEvents) {
    tabs.significantEvents = significantEvents;
  }

  if (!isValidManagementSubTab(tab) || !tabs[tab]?.content) {
    return (
      <RedirectTo path="/{key}/management/{tab}" params={{ path: { key, tab: 'overview' } }} />
    );
  }

  return (
    <>
      <EuiPageHeader
        paddingSize="l"
        bottomBorder="extended"
        css={css`
          background: ${euiTheme.colors.backgroundBasePlain};
        `}
        pageTitle={
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            {key}
            <QueryStreamBadge />
          </EuiFlexGroup>
        }
        rightSideItems={[
          <EuiFlexGroup
            key="streamDetailActions"
            alignItems="center"
            gutterSize="xs"
            responsive={false}
          >
            <EuiFlexItem grow={false}>
              <DiscoverBadgeButton stream={definition.stream} hasDataStream spellOut />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <StreamDetailActionsMenu canDelete={canDeleteQueryStream} definition={definition} />
            </EuiFlexItem>
          </EuiFlexGroup>,
        ]}
        tabs={Object.entries(tabs).map(([tabKey, { label }]) => ({
          label,
          href: router.link('/{key}/management/{tab}', {
            path: { key, tab: tabKey },
            query: { rangeFrom, rangeTo },
          }),
          isSelected: tab === tabKey,
          'data-test-subj': `queryStreamDetails-${tabKey}-tab`,
        }))}
      />
      <StreamsAppPageTemplate.Body>{tabs[tab].content}</StreamsAppPageTemplate.Body>
    </>
  );
}
