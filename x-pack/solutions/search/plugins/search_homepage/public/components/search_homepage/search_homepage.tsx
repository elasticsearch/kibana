/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo } from 'react';
import { EuiHorizontalRule, EuiTitle, useEuiTheme } from '@elastic/eui';
import { layoutFillRowCss, layoutRowCss } from '@kbn/css-utils/public/layout_css';
import { i18n } from '@kbn/i18n';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { KibanaVersionBadge } from '@kbn/search-shared-ui';
import { TrialUsageBadge, CloudLinks } from '@kbn/shared-components';
import { useAuthenticatedUser } from '../../hooks/use_authenticated_user';
import { useKibana } from '../../hooks/use_kibana';
import { BasicMetricBadges } from './basic_metric_badges';
import { ConnectToElasticsearch } from './connect_to_elasticsearch';
import { SearchHomepageBody } from './search_homepage_body';
import { LicenseBadge } from './license_badge';
import { docLinks } from '../../../common/doc_links';
import { verticalSeparatorStyle } from './search_homepage_styles';

export const SearchHomepagePage = () => {
  const {
    services: { console: consolePlugin, history, searchNavigation, cloud, kibanaVersion },
  } = useKibana();

  const { user } = useAuthenticatedUser();
  const { euiTheme } = useEuiTheme();

  useEffect(() => {
    if (searchNavigation) {
      searchNavigation.breadcrumbs.setSearchBreadCrumbs([
        {
          text: i18n.translate('xpack.searchHomepage.breadcrumbs.home', { defaultMessage: 'Home' }),
        },
      ]);
    }
  }, [searchNavigation]);

  const embeddableConsole = useMemo(
    () => (consolePlugin?.EmbeddableConsole ? <consolePlugin.EmbeddableConsole /> : null),
    [consolePlugin]
  );

  return (
    <KibanaPageTemplate
      offset={0}
      restrictWidth={true}
      data-test-subj="search-homepage"
      grow={false}
      solutionNav={searchNavigation?.useClassicNavigation(history)}
    >
      <KibanaPageTemplate.Section restrictWidth={true} grow={false}>
        <div css={layoutRowCss({ gap: euiTheme.size.m, justify: 'spaceBetween' })}>
          <div
            css={layoutRowCss({ gap: euiTheme.size.s, shrinkItems: false })}
            data-test-subj="searchHomepageHeaderLeftsideGroup"
          >
            <EuiTitle size="s">
              <h3>
                {user?.full_name
                  ? i18n.translate('xpack.searchHomepage.welcome.title', {
                      defaultMessage: 'Welcome, {username}',
                      values: { username: user.full_name },
                    })
                  : i18n.translate('xpack.searchHomepage.welcome.title.default', {
                      defaultMessage: 'Welcome',
                    })}
              </h3>
            </EuiTitle>
            {cloud?.isInTrial() ? (
              <TrialUsageBadge cloud={cloud} />
            ) : !cloud?.isCloudEnabled ? (
              <LicenseBadge />
            ) : null}
            {cloud?.isCloudEnabled && cloud?.baseUrl ? (
              // Grouped so the separator wraps with the pill instead of being orphaned
              // at the end of the previous line.
              <div css={layoutRowCss({ gap: euiTheme.size.s, shrinkItems: false })}>
                <span css={verticalSeparatorStyle} />
                <CloudLinks cloud={cloud} />
              </div>
            ) : null}
          </div>
          <ConnectToElasticsearch />
        </div>

        <EuiHorizontalRule margin="s" />
        <div css={layoutFillRowCss({ gap: euiTheme.size.s })}>
          <BasicMetricBadges />
          <KibanaVersionBadge
            docLink={
              cloud?.isServerlessEnabled
                ? docLinks.serverlessReleaseNotes
                : cloud?.isCloudEnabled
                ? docLinks.hostedCloudReleaseNotes
                : docLinks.releaseNotes
            }
            kibanaVersion={
              !cloud?.isServerlessEnabled
                ? `v${kibanaVersion}`
                : i18n.translate('xpack.searchHomepage.versionLabel.changelog', {
                    defaultMessage: 'Changelog',
                  })
            }
          />
        </div>
      </KibanaPageTemplate.Section>
      <SearchHomepageBody />
      {embeddableConsole}
    </KibanaPageTemplate>
  );
};
