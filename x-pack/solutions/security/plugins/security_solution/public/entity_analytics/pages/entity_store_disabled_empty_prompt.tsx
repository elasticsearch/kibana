/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import { EuiEmptyPrompt, EuiFlexGroup, EuiImage, EuiText } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { SecurityPageName } from '../../../common/constants';
import { SecuritySolutionLinkButton } from '../../common/components/links';
import { SecuritySolutionPageWrapper } from '../../common/components/page_wrapper';
import { HeaderPage } from '../../common/components/header_page';
import { EntityAnalyticsLearnMoreLink } from '../components/entity_analytics_learn_more_link';
import illustrationSearchAnalytics from '../../common/images/illustration_search_analytics.svg';

/**
 * Body-only variant of the "Entity Store is disabled" prompt: the `EuiEmptyPrompt`
 * with shared i18n strings, illustration, "Enable" deep link, and learn-more link,
 * but without the full-page `SecuritySolutionPageWrapper` / `HeaderPage` / 100vh
 * sizing.
 *
 * Use this when embedding the prompt inside a smaller surface (e.g. the cases
 * "Entities" attachment accordion); pages should keep using
 * `EntityStoreDisabledEmptyPrompt` below for the full-page layout.
 */
export const EntityStoreDisabledEmptyPromptBody = React.memo(() => (
  <EuiEmptyPrompt
    color="plain"
    css={css`
      .euiEmptyPrompt__icon {
        min-inline-size: 160px;
        text-align: center;
      }
      .euiEmptyPrompt__content {
        flex: 1;
      }
    `}
    data-test-subj="entityStoreDisabledEmptyPrompt"
    icon={<EuiImage size={128} alt="" url={illustrationSearchAnalytics} />}
    layout="horizontal"
    style={{ maxWidth: 624 }}
    title={
      <h2>
        <FormattedMessage
          id="xpack.securitySolution.entityAnalytics.homePage.enableEntityAnalytics"
          defaultMessage="Enable Entity analytics to collect entity data and access analytics capabilities"
        />
      </h2>
    }
    actions={
      <SecuritySolutionLinkButton
        fill
        deepLinkId={SecurityPageName.entityAnalyticsManagement}
        iconType="external"
        iconSide="right"
        target="_blank"
      >
        <FormattedMessage
          id="xpack.securitySolution.entityAnalytics.homePage.enableEntityAnalytics.action"
          defaultMessage="Enable Entity analytics"
        />
      </SecuritySolutionLinkButton>
    }
    footer={
      <FormattedMessage
        id="xpack.securitySolution.entityAnalytics.homePage.enableEntityAnalytics.footer"
        defaultMessage="<semibold>Want to learn more?</semibold> {docsLink}"
        values={{
          semibold: (chunks: React.ReactNode) => (
            <EuiText size="s" component="span" css={{ fontWeight: 600 }}>
              {chunks}
            </EuiText>
          ),
          docsLink: (
            <EntityAnalyticsLearnMoreLink
              title={
                <FormattedMessage
                  id="xpack.securitySolution.entityAnalytics.homePage.enableEntityAnalytics.footerLink"
                  defaultMessage="Read the docs"
                />
              }
            />
          ),
        }}
      />
    }
  />
));
EntityStoreDisabledEmptyPromptBody.displayName = 'EntityStoreDisabledEmptyPromptBody';

export const EntityStoreDisabledEmptyPrompt = React.memo(() => (
  <SecuritySolutionPageWrapper
    css={css`
      height: calc(100vh - 240px);
    `}
  >
    <HeaderPage
      title={
        <FormattedMessage
          id="xpack.securitySolution.entityAnalytics.homePage.pageTitle"
          defaultMessage="Entity analytics"
        />
      }
    />
    <EuiFlexGroup
      alignItems="center"
      justifyContent="center"
      css={css`
        height: 100%;
      `}
    >
      <EntityStoreDisabledEmptyPromptBody />
    </EuiFlexGroup>
  </SecuritySolutionPageWrapper>
));
EntityStoreDisabledEmptyPrompt.displayName = 'EntityStoreDisabledEmptyPrompt';
