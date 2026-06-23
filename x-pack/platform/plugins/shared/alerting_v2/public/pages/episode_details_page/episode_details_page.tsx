/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiButton,
  EuiButtonGroup,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiSplitPanel,
  EuiTitle,
  logicalCSS,
  useEuiMinBreakpoint,
  useEuiMaxBreakpoint,
  useEuiTheme,
} from '@elastic/eui';
import { useQueryClient } from '@kbn/react-query';
import { getBreachEsqlQuery } from '@kbn/alerting-v2-schemas';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useFetchEpisodeQuery } from '@kbn/alerting-v2-episodes-ui/hooks/use_fetch_episode_query';
import { useFetchRule } from '@kbn/alerting-v2-episodes-ui/hooks/use_fetch_rule';
import { useInvalidateEpisodeQueries } from '@kbn/alerting-v2-episodes-ui/hooks/use_invalidate_episode_queries';
import { createEpisodeActions, type EpisodeAction } from '@kbn/alerting-v2-episodes-ui/actions';
import { EpisodeActionsBar } from '@kbn/alerting-v2-episodes-ui/components/episode_actions_bar';
import { AlertEpisodeDetailsHeaderSection } from '@kbn/alerting-v2-episodes-ui/components/details/details_header_section';
import { AlertEpisodeOverviewListSection } from '@kbn/alerting-v2-episodes-ui/components/details/overview_list_section';
import { AlertEpisodeRuleOverviewPanelSection } from '@kbn/alerting-v2-episodes-ui/components/details/rule_overview_panel_section';
import { AlertEpisodeLifecycleHeatmapSection } from '@kbn/alerting-v2-episodes-ui/components/details/lifecycle_heatmap_section';
import { AlertEpisodeSeverityHeatmapSection } from '@kbn/alerting-v2-episodes-ui/components/details/severity_heatmap_section';
import { AlertEpisodesRelatedSection } from '@kbn/alerting-v2-episodes-ui/components/details/related_section';
import { AlertEpisodeMetadataSection } from '@kbn/alerting-v2-episodes-ui/components/details/metadata_section';
import { AlertEpisodeRunbookSection } from '@kbn/alerting-v2-episodes-ui/components/details/runbook_section';
import { css } from '@emotion/react';
import { useHistory, useParams } from 'react-router-dom';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { CenterJustifiedSpinner } from '../../components/center_justified_spinner';
import type { AlertEpisodesKibanaServices } from '../../episodes_kibana_services';
import { useBreadcrumbs } from '../../hooks/use_breadcrumbs';
import { getDiscoverHrefForRuleAndEpisodeTimestamp } from '../../utils/discover_href_for_episode';
import * as i18n from './translations';

interface EpisodeRouteParams {
  episodeId: string;
}

type EpisodeDetailsSidebarPanel = 'episode_details' | 'runbook';

type EpisodeDetailsMainPanel = 'overview' | 'metadata';

export function EpisodeDetailsPage() {
  const { euiTheme } = useEuiTheme();
  const { episodeId } = useParams<EpisodeRouteParams>();
  const [sidebarPanel, setSidebarPanel] = useState<EpisodeDetailsSidebarPanel>('episode_details');
  const [mainPanel, setMainPanel] = useState<EpisodeDetailsMainPanel>('overview');

  const { services } = useKibana<AlertEpisodesKibanaServices>();
  const queryClient = useQueryClient();
  const { data, http, spaces } = services;
  const history = useHistory();

  const smallMediaQuery = useEuiMaxBreakpoint('s');
  const largeMediaQuery = useEuiMinBreakpoint('m');

  const invalidateEpisodeQueries = useInvalidateEpisodeQueries();

  const {
    data: episode,
    isLoading: isLoadingEpisode,
    isError: isEpisodeError,
  } = useFetchEpisodeQuery({
    episodeId,
    services: { data, spaces },
  });

  const ruleId = episode?.['rule.id'];
  const groupHash = episode?.group_hash;

  const { data: rule, isLoading: isLoadingRule } = useFetchRule({ id: ruleId, http });

  const episodeBreadcrumbTitle =
    rule?.metadata.name != null && rule.metadata.name.length > 0
      ? rule.metadata.name
      : i18n.EPISODE_DETAILS_BREADCRUMB_FALLBACK;

  useBreadcrumbs('episode_details', { ruleName: episodeBreadcrumbTitle });

  const detailsServices = useMemo(
    () => ({
      data: services.data,
      http: services.http,
      expressions: services.expressions,
      userProfile: services.userProfile,
      spaces: services.spaces,
      uiSettings: services.uiSettings,
    }),
    [
      services.data,
      services.http,
      services.expressions,
      services.userProfile,
      services.spaces,
      services.uiSettings,
    ]
  );

  const metadataServices = useMemo(
    () => ({
      ...detailsServices,
      unifiedDocViewer: services.unifiedDocViewer,
      dataViews: services.dataViews,
    }),
    [detailsServices, services.unifiedDocViewer, services.dataViews]
  );

  const episodeActions: EpisodeAction[] = useMemo(
    () =>
      createEpisodeActions({
        http: services.http,
        overlays: services.overlays,
        notifications: services.notifications,
        rendering: services.rendering,
        application: services.application,
        userProfile: services.userProfile,
        docLinks: services.docLinks,
        expressions: services.expressions,
        spaces: services.spaces,
        queryClient,
        getDiscoverHref: ({ episodeIsoTimestamp: ts }) =>
          getDiscoverHrefForRuleAndEpisodeTimestamp({
            share: services.share,
            capabilities: services.application.capabilities,
            uiSettings: services.uiSettings,
            ruleEsql: rule ? getBreachEsqlQuery(rule.query) : undefined,
            episodeIsoTimestamp: ts,
          }),
      }),
    [services, queryClient, rule]
  );

  const applicableActions = useMemo(
    () =>
      episode
        ? episodeActions.filter((action) => action.isCompatible({ episodes: [episode] }))
        : [],
    [episodeActions, episode]
  );

  const isLoading = isLoadingEpisode || (Boolean(ruleId) && isLoadingRule);
  const episodeNotFound = !isLoading && episode == null;

  if (!episodeId || episodeNotFound || isEpisodeError) {
    return (
      <EuiEmptyPrompt
        iconType="warning"
        color="danger"
        title={<h2>{i18n.EPISODE_NOT_FOUND_TITLE}</h2>}
        body={<p>{i18n.EPISODE_NOT_FOUND_BODY}</p>}
        actions={[
          <EuiButton
            color="primary"
            fill
            onClick={() => history.push('/')}
            data-test-subj="episodeDetailsErrorBackButton"
          >
            {i18n.BACK_TO_ALERT_EPISODES}
          </EuiButton>,
        ]}
        data-test-subj="episodeDetailsErrorPrompt"
      />
    );
  }

  const sidebarHeaderTitle =
    sidebarPanel === 'episode_details'
      ? i18n.SIDEBAR_TITLE_EPISODE_DETAILS
      : i18n.SIDEBAR_TITLE_RUNBOOK;

  const sidebar = (
    <>
      <EuiFlexGroup
        alignItems="center"
        justifyContent="spaceBetween"
        responsive={false}
        gutterSize="s"
        css={css`
          flex-grow: 0;
          ${largeMediaQuery} {
            padding: ${euiTheme.size.l};
          }
        `}
      >
        <EuiFlexItem grow={false}>
          <EuiTitle size="s">
            <h2 data-test-subj="alertingV2EpisodeDetailsSidebarTitle">{sidebarHeaderTitle}</h2>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend={i18n.SIDEBAR_VIEW_LEGEND}
            type="single"
            buttonSize="compressed"
            idSelected={sidebarPanel}
            onChange={(id) => setSidebarPanel(id as EpisodeDetailsSidebarPanel)}
            options={[
              {
                id: 'episode_details',
                'data-test-subj': 'alertingV2EpisodeDetailsSidebarTabEpisodeDetails',
                label: i18n.SIDEBAR_TAB_TITLE_DETAILS,
              },
              {
                id: 'runbook',
                'data-test-subj': 'alertingV2EpisodeDetailsSidebarTabRunbook',
                label: i18n.SIDEBAR_TITLE_RUNBOOK,
              },
            ]}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiHorizontalRule
        css={css`
          ${largeMediaQuery} {
            margin-block: 0;
            margin-inline: ${euiTheme.size.l};
          }
          inline-size: unset;
        `}
      />
      <div
        css={css`
          min-height: 0;

          ${largeMediaQuery} {
            flex: 1;
            overflow-y: auto;
            padding: ${euiTheme.size.l};
          }
        `}
        data-test-subj="alertingV2EpisodeDetailsSidebarBody"
      >
        {sidebarPanel === 'episode_details' ? (
          <>
            <AlertEpisodeOverviewListSection
              episodeId={episodeId}
              groupHash={groupHash}
              services={detailsServices}
            />
            <EuiSpacer size="l" />
            <AlertEpisodeRuleOverviewPanelSection
              episodeId={episodeId}
              services={detailsServices}
            />
          </>
        ) : (
          <AlertEpisodeRunbookSection episodeId={episodeId} services={detailsServices} />
        )}
      </div>
    </>
  );

  const sidebarPanelInner = (
    <EuiSplitPanel.Inner
      grow={false}
      paddingSize="none"
      css={css`
        display: flex;
        flex-direction: column;
        min-height: 0;
        ${logicalCSS('padding-top', euiTheme.size.l)}

        ${largeMediaQuery} {
          ${logicalCSS('padding-top', '0')}
          flex-shrink: 0;
          flex-basis: 400px;
          min-width: 40px;
          max-width: 500px;
          border-left: ${euiTheme.border.thin};
        }
      `}
      data-test-subj="alertingV2EpisodeDetailsSidebar"
    >
      {sidebar}
    </EuiSplitPanel.Inner>
  );

  return (
    <KibanaPageTemplate
      paddingSize="none"
      bottomBorder={false}
      data-test-subj="alertingV2EpisodeDetailsPage"
      minHeight={0}
      grow={false}
      css={css`
        ${largeMediaQuery} {
          block-size: calc(var(--kbn-application--content-height, 100vh) - ${euiTheme.size.l} * 2);
        }
      `}
      pageHeader={{
        pageTitle: (
          <AlertEpisodeDetailsHeaderSection episodeId={episodeId} services={detailsServices} />
        ),
        bottomBorder: true,
        restrictWidth: false,
        paddingSize: 'none',
        rightSideItems: [
          <EpisodeActionsBar
            key="alertingV2EpisodeHeaderActions"
            actions={applicableActions}
            episodes={episode ? [episode] : []}
            onSuccess={invalidateEpisodeQueries}
          />,
        ],
        rightSideGroupProps: { gutterSize: 's' },
        tabs: [
          {
            id: 'overview',
            'data-test-subj': 'alertingV2EpisodeDetailsMainTabOverview',
            label: i18n.OVERVIEW_TAB_TITLE,
            isSelected: mainPanel === 'overview',
            onClick: () => setMainPanel('overview'),
          },
          {
            id: 'metadata',
            'data-test-subj': 'alertingV2EpisodeDetailsMainTabMetadata',
            label: i18n.METADATA_TAB_TITLE,
            isSelected: mainPanel === 'metadata',
            onClick: () => setMainPanel('metadata'),
          },
        ],
      }}
    >
      {isLoading ? (
        <KibanaPageTemplate.Section grow>
          <CenterJustifiedSpinner />
        </KibanaPageTemplate.Section>
      ) : (
        <KibanaPageTemplate.Section
          paddingSize="none"
          grow
          restrictWidth={false}
          css={css`
            min-height: 0;
          `}
          contentProps={{
            css: css`
              flex: 1 1;
              min-height: 0;
            `,
          }}
        >
          <EuiSplitPanel.Outer
            direction="row"
            hasBorder={false}
            hasShadow={false}
            css={css`
              ${largeMediaQuery} {
                height: 100%;
              }
            `}
          >
            <EuiSplitPanel.Inner
              grow
              paddingSize="none"
              css={css`
                ${smallMediaQuery} {
                  [class*='InternalDocViewerTable'] {
                    display: block;
                    height: unset;
                  }
                }

                ${largeMediaQuery} {
                  // The doc-viewer table uses a fixed height by default; set
                  // it to 100% so it fills the available flex height instead
                  // of measuring against \`window.innerHeight\`.
                  [class*='InternalDocViewerTable'] {
                    height: 100%;

                    & > :nth-child(2),
                    & > :nth-child(4) {
                      padding-right: ${euiTheme.size.s};
                    }
                  }
                }
              `}
            >
              {mainPanel === 'metadata' ? (
                <AlertEpisodeMetadataSection episodeId={episodeId} services={metadataServices} />
              ) : (
                <EuiPanel
                  hasBorder={false}
                  hasShadow={false}
                  paddingSize="l"
                  css={css`
                    ${smallMediaQuery} {
                      ${logicalCSS('padding-horizontal', '0')}
                    }
                    ${largeMediaQuery} {
                      height: 100%;
                      overflow-y: auto;
                      ${logicalCSS('padding-left', '0')}
                    }
                  `}
                >
                  <AlertEpisodeLifecycleHeatmapSection
                    episodeId={episodeId}
                    services={detailsServices}
                  />
                  <EuiSpacer size="l" />
                  <AlertEpisodeSeverityHeatmapSection
                    episodeId={episodeId}
                    services={detailsServices}
                  />
                  <EuiSpacer size="l" />
                  <AlertEpisodesRelatedSection episodeId={episodeId} services={detailsServices} />
                </EuiPanel>
              )}
            </EuiSplitPanel.Inner>
            {sidebarPanelInner}
          </EuiSplitPanel.Outer>
        </KibanaPageTemplate.Section>
      )}
    </KibanaPageTemplate>
  );
}
