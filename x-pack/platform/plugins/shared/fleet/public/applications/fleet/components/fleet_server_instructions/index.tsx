/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback } from 'react';
import {
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLink,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  EuiFlexItem,
  EuiButton,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import styled from 'styled-components';

import { MAX_FLYOUT_WIDTH } from '../../constants';
import { useStartServices, useFlyoutContext, useCheckPermissions } from '../../hooks';
import { FleetServerMissingESPrivileges } from '../../sections/agents/components';

import { QuickStartTab } from './quick_start_tab';
import { AdvancedTab } from './advanced_tab';

const ContentWrapper = styled(EuiFlexGroup)`
  height: 100%;
  margin: 0 auto;
`;

interface Props {
  onClose: () => void;
}

const useFleetServerTabs = (onClose: () => void) => {
  const [currentTab, setCurrentTab] = useState('quickStart');

  const quickStartTab = {
    id: 'quickStart',
    label: 'Quick Start',
    content: <QuickStartTab onClose={onClose} />,
    'data-test-subj': 'fleetServerFlyoutTab-quickStart',
  };

  const advancedTab = {
    id: 'advanced',
    label: 'Advanced',
    content: <AdvancedTab onClose={onClose} />,
    'data-test-subj': 'fleetServerFlyoutTab-advanced',
  };

  const currentTabContent =
    currentTab === 'quickStart' ? quickStartTab.content : advancedTab.content;

  return { tabs: [quickStartTab, advancedTab], currentTab, setCurrentTab, currentTabContent };
};

const Header: React.FunctionComponent<{
  isFlyout?: boolean;
  currentTab: string;
  tabs: Array<{ id: string; label: string; content: React.ReactNode }>;
  onTabClick: (id: string) => void;
}> = ({ isFlyout = false, currentTab: currentTabId, tabs, onTabClick }) => {
  const { docLinks } = useStartServices();

  return (
    <>
      <EuiTitle size="m">
        <h2 data-test-subj="addFleetServerHeader" id="FleetAddFleetServerFlyoutTitle">
          <FormattedMessage
            id="xpack.fleet.fleetServerFlyout.title"
            defaultMessage="Add a Fleet Server"
          />
        </h2>
      </EuiTitle>

      <EuiSpacer size="m" />

      <EuiText>
        <FormattedMessage
          id="xpack.fleet.fleetServerFlyout.instructions"
          defaultMessage="A Fleet Server is required before you can enroll agents with Fleet. Follow the instructions below to set up a Fleet Server. For more information, see the {userGuideLink}"
          values={{
            userGuideLink: (
              <EuiLink
                href={docLinks.links.fleet.fleetServerAddFleetServer}
                external
                target="_blank"
              >
                <FormattedMessage
                  id="xpack.fleet.fleetServerSetup.setupGuideLink"
                  defaultMessage="Fleet and Elastic Agent Guide"
                />
              </EuiLink>
            ),
          }}
        />
      </EuiText>

      <EuiSpacer size="xl" />

      <EuiButtonGroup
        legend="Fleet Server instructions"
        isFullWidth
        options={tabs}
        idSelected={currentTabId}
        onChange={(id) => onTabClick(id)}
        style={{ maxWidth: '500px' }}
      />
    </>
  );
};

// Renders instructions inside of a flyout
export const FleetServerFlyout: React.FunctionComponent<Props> = ({ onClose }) => {
  const { tabs, currentTab, setCurrentTab, currentTabContent } = useFleetServerTabs(onClose);

  const { permissionsError, isPermissionsLoading } = useCheckPermissions();

  let errorContent: React.ReactNode | undefined;
  if (permissionsError === 'MISSING_FLEET_SERVER_SETUP_PRIVILEGES') {
    errorContent = (
      <ContentWrapper gutterSize="none" justifyContent="center" direction="column">
        <FleetServerMissingESPrivileges />
      </ContentWrapper>
    );
  }

  return (
    <EuiFlyout
      data-test-subj="fleetServerFlyout"
      onClose={onClose}
      maxWidth={MAX_FLYOUT_WIDTH}
      aria-labelledby="FleetAddFleetServerFlyoutTitle"
    >
      <EuiFlyoutHeader hasBorder aria-labelledby="FleetAddFleetServerFlyoutTitle">
        <Header
          tabs={tabs}
          currentTab={currentTab}
          onTabClick={(id) => setCurrentTab(id)}
          isFlyout
        />
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {isPermissionsLoading ? null : errorContent ? errorContent : currentTabContent}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

export const AddFleetServerLanding: React.FunctionComponent = () => {
  const { docLinks } = useStartServices();
  const flyoutContext = useFlyoutContext();

  const onClickAddFleetServer = useCallback(() => {
    flyoutContext.openFleetServerFlyout();
  }, [flyoutContext]);

  return (
    <ContentWrapper gutterSize="none" justifyContent="center" direction="column">
      <EuiFlexGroup alignItems="center" direction="column">
        <EuiFlexItem>
          <EuiTitle size="m">
            <h2 data-test-subj="addFleetServerHeader">
              <FormattedMessage
                id="xpack.fleet.fleetServerLanding.title"
                defaultMessage="Add a Fleet Server"
              />
            </h2>
          </EuiTitle>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiText
            css={`
              max-width: 500px;
              text-align: center;
            `}
          >
            <FormattedMessage
              id="xpack.fleet.fleetServerLanding.instructions"
              defaultMessage="A Fleet Server is required before you can enroll agents with Fleet. Follow the instructions below to set up a Fleet Server. For more information, see the {userGuideLink}"
              values={{
                userGuideLink: (
                  <EuiLink
                    href={docLinks.links.fleet.fleetServerAddFleetServer}
                    external
                    target="_blank"
                  >
                    <FormattedMessage
                      id="xpack.fleet.fleetServerSetup.setupGuideLink"
                      defaultMessage="Fleet and Elastic Agent Guide"
                    />
                  </EuiLink>
                ),
              }}
            />
          </EuiText>
        </EuiFlexItem>
        <EuiSpacer size="s" />
        <EuiFlexItem>
          <EuiToolTip
            content={
              <FormattedMessage
                id="xpack.fleet.fleetServerLanding.addFleetServerButton.tooltip"
                defaultMessage="Fleet Server is a component of the Elastic Stack used to centrally manage Elastic Agents"
              />
            }
          >
            <EuiButton
              onClick={onClickAddFleetServer}
              fill
              data-test-subj="fleetServerLanding.addFleetServerButton"
            >
              <FormattedMessage
                id="xpack.fleet.fleetServerLanding.addFleetServerButton"
                defaultMessage="Add Fleet Server"
              />
            </EuiButton>
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
    </ContentWrapper>
  );
};
