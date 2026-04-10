/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import { EuiPageTemplate } from '@elastic/eui';
import { GETTING_STARTED_SESSIONSTORAGE_KEY } from '@kbn/search-shared-ui';
import { useUsageTracker } from '../contexts/usage_tracker_context';
import { AnalyticsEvents } from '../../common';
import { SearchGettingStartedPageTemplate } from '../layout/page_template';
// import { ConsoleTutorialsGroup } from './tutorials/console_tutorials_group';
import { SearchGettingStartedConnectCode } from './connect_code';
import { AgentInstallSection } from './agent_install/agent_install';
import { GettingStartedFooter } from './footer';
import { SearchGettingStartedHeader } from './header';
import { UpdatedTutorials } from './tutorials/new_tutorial_components/updated_tutorials';

export const SearchGettingStartedPage: React.FC = () => {
  const usageTracker = useUsageTracker();
  useEffect(() => {
    usageTracker.load(AnalyticsEvents.gettingStartedLoaded);
    sessionStorage.setItem(GETTING_STARTED_SESSIONSTORAGE_KEY, 'true');
  }, [usageTracker]);

  return (
    <SearchGettingStartedPageTemplate>
      <EuiPageTemplate.Section data-test-subj="gettingStartedHeader" paddingSize="xl" grow={false}>
        <SearchGettingStartedHeader />
      </EuiPageTemplate.Section>
      <EuiPageTemplate.Section data-test-subj="gettingStartedAgentInstall">
        <AgentInstallSection />
      </EuiPageTemplate.Section>
      <EuiPageTemplate.Section data-test-subj="gettingStartedConsoleTutorials" paddingSize="xl">
        {/* <ConsoleTutorialsGroup /> */}
        <UpdatedTutorials />
      </EuiPageTemplate.Section>
      <EuiPageTemplate.Section data-test-subj="gettingStartedCodeExamples">
        <SearchGettingStartedConnectCode />
      </EuiPageTemplate.Section>
      <EuiPageTemplate.Section data-test-subj="gettingStartedFooter">
        <GettingStartedFooter />
      </EuiPageTemplate.Section>
    </SearchGettingStartedPageTemplate>
  );
};
