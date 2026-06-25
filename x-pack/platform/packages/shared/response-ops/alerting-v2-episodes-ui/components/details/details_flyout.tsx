/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiPanel,
  EuiTab,
  EuiTabs,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useFetchEpisodeQuery } from '../../hooks/use_fetch_episode_query';
import { useFetchRule } from '../../hooks/use_fetch_rule';
import { isRuleLoaded } from '../../types/rule_state';
import { useInvalidateEpisodeQueries } from '../../hooks/use_invalidate_episode_queries';
import { FLYOUT_FOOTER_OFFSET, getAlertEpisodeDetailsPath } from '../../constants';
import { AlertEpisodeDetailsHeaderSection } from './details_header_section';
import { AlertEpisodeOverviewSection } from './overview_section';
import { AlertEpisodesRelatedSection } from './related_section';
import { AlertEpisodeMetadataSection } from './metadata_section';
import { AlertEpisodeRunbookSection } from './runbook_section';
import type { EpisodeAction } from '../../actions/types';
import type { AlertEpisodeDetailsServices } from './types';
import * as i18n from './translations';
import { EpisodeActionsBar } from '../episode_actions_bar';

type TabId = 'overview' | 'related' | 'metadata' | 'runbook';

export interface AlertEpisodeDetailsFlyoutProps {
  episodeId: string;
  groupHash: string | undefined;
  onClose: () => void;
  services: AlertEpisodeDetailsServices;
  actions?: EpisodeAction[];
}

export const AlertEpisodeDetailsFlyout = ({
  episodeId,
  groupHash,
  onClose,
  services,
  actions,
}: AlertEpisodeDetailsFlyoutProps) => {
  const { euiTheme } = useEuiTheme();
  const [tab, setTab] = useState<TabId>('overview');
  const invalidateEpisodeQueries = useInvalidateEpisodeQueries();

  const { data: episode } = useFetchEpisodeQuery({ episodeId, services });
  const ruleId = episode?.['rule.id'];
  const { ruleState } = useFetchRule({ id: ruleId, http: services.http });
  const showRuleDependentTabs = isRuleLoaded(ruleState);

  const episodes = useMemo(() => (episode ? [episode] : []), [episode]);
  const compatibleActions = useMemo(
    () => (actions && episodes.length ? actions.filter((a) => a.isCompatible({ episodes })) : []),
    [actions, episodes]
  );

  const effectiveTab: TabId =
    !showRuleDependentTabs && (tab === 'metadata' || tab === 'runbook') ? 'overview' : tab;

  return (
    <EuiFlyout
      type="push"
      hasAnimation
      hideCloseButton
      onClose={onClose}
      pushMinBreakpoint="m"
      data-test-subj="alertingV2EpisodeFlyout"
      paddingSize="none"
      size="35%"
      aria-label={i18n.FLYOUT_ARIA_LABEL}
    >
      <EuiPanel
        paddingSize="xs"
        hasShadow={false}
        hasBorder={false}
        borderRadius="none"
        color="transparent"
      >
        <EuiFlexGroup
          justifyContent="flexEnd"
          gutterSize="s"
          responsive={false}
          alignItems="center"
        >
          {compatibleActions.length > 0 && (
            <EuiFlexItem grow={false}>
              <EpisodeActionsBar
                actions={compatibleActions}
                episodes={episodes}
                onSuccess={invalidateEpisodeQueries}
                iconOnly
              />
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiToolTip content={i18n.FLYOUT_CLOSE} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="cross"
                color="text"
                onClick={onClose}
                aria-label={i18n.FLYOUT_CLOSE}
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
      <EuiHorizontalRule margin="none" />
      <EuiFlyoutHeader hasBorder>
        <EuiPanel
          paddingSize="m"
          hasShadow={false}
          hasBorder={false}
          borderRadius="none"
          color="transparent"
          css={css`
            padding-block-end: 0;
          `}
        >
          <AlertEpisodeDetailsHeaderSection
            episodeId={episodeId}
            services={services}
            titleSize="m"
          />
          <EuiTabs bottomBorder={false}>
            <EuiTab
              isSelected={effectiveTab === 'overview'}
              onClick={() => setTab('overview')}
              data-test-subj="alertingV2EpisodeFlyoutTabOverview"
            >
              {i18n.FLYOUT_TAB_OVERVIEW}
            </EuiTab>
            <EuiTab
              isSelected={effectiveTab === 'related'}
              onClick={() => setTab('related')}
              data-test-subj="alertingV2EpisodeFlyoutTabRelated"
            >
              {i18n.FLYOUT_TAB_RELATED}
            </EuiTab>
            {showRuleDependentTabs ? (
              <>
                <EuiTab
                  isSelected={effectiveTab === 'metadata'}
                  onClick={() => setTab('metadata')}
                  data-test-subj="alertingV2EpisodeFlyoutTabMetadata"
                >
                  {i18n.FLYOUT_TAB_METADATA}
                </EuiTab>
                <EuiTab
                  isSelected={effectiveTab === 'runbook'}
                  onClick={() => setTab('runbook')}
                  data-test-subj="alertingV2EpisodeFlyoutTabRunbook"
                >
                  {i18n.FLYOUT_TAB_RUNBOOK}
                </EuiTab>
              </>
            ) : null}
          </EuiTabs>
        </EuiPanel>
      </EuiFlyoutHeader>
      <EuiFlyoutBody
        // The metadata tab should fill the body edge-to-edge with no flyout
        // padding, and the doc-viewer table inside takes the full available
        // height (its own internal scroll handles overflow). Other tabs use
        // the default flyout body padding/scroll.
        //
        // The doc-viewer table's search-input row and toggles row still get
        // horizontal padding so the controls don't sit flush against the
        // panel edge — same `:has()` selectors as the page, anchored on each
        // wrapper's stable direct child.
        css={
          effectiveTab === 'metadata'
            ? css`
                [class*='euiFlyoutBody__overflow']:not([class*='__overflowContent']) {
                  overflow: hidden;
                }
                [class*='euiFlyoutBody__overflowContent'] {
                  padding: 0;
                  block-size: 100%;
                  display: flex;
                  flex-direction: column;
                }
                [class*='euiFlexItem']:has(
                    > [class*='euiFormControlLayout']
                      [data-test-subj='unifiedDocViewerFieldsSearchInput']
                  ),
                [class*='euiFlexItem']:has(
                    > [class*='euiFlexGroup'] > [class*='euiFlexItem'] > [class*='euiSwitch']
                  ) {
                  padding-inline: ${euiTheme.size.m};
                }
              `
            : css`
                padding: ${euiTheme.size.m};
              `
        }
      >
        {effectiveTab === 'overview' && (
          <AlertEpisodeOverviewSection
            episodeId={episodeId}
            groupHash={groupHash}
            services={services}
          />
        )}
        {effectiveTab === 'related' && (
          <AlertEpisodesRelatedSection
            episodeId={episodeId}
            services={services}
            showHeading={false}
            compressed
          />
        )}
        {effectiveTab === 'metadata' && (
          <AlertEpisodeMetadataSection
            episodeId={episodeId}
            services={services}
            // The doc-viewer table sizes its internal scroll against
            // `window.innerHeight`, which doesn't account for the flyout
            // footer. Subtract the footer's approximate height (button +
            // top/bottom padding for the default `paddingSize="l"`) so the
            // table fits above the footer instead of extending past it.
            decreaseAvailableHeightBy={FLYOUT_FOOTER_OFFSET}
          />
        )}
        {effectiveTab === 'runbook' && (
          <AlertEpisodeRunbookSection episodeId={episodeId} services={services} />
        )}
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiPanel
          paddingSize="m"
          hasShadow={false}
          hasBorder={false}
          borderRadius="none"
          color="transparent"
        >
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                onClick={onClose}
                data-test-subj="alertingV2EpisodeFlyoutCloseButton"
                flush="left"
              >
                {i18n.FLYOUT_CLOSE}
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                fill
                href={services.http.basePath.prepend(getAlertEpisodeDetailsPath(episodeId))}
                data-test-subj="alertingV2EpisodeFlyoutViewDetailsButton"
                iconType="eye"
              >
                {i18n.FLYOUT_VIEW_DETAILS}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
