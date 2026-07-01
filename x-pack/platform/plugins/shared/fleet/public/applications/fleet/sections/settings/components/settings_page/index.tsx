/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';

import type { Output, DownloadSource, FleetServerHost, FleetProxy } from '../../../../types';

import { FleetServerHostsSection } from './fleet_server_hosts_section';
import { OutputSection } from './output_section';
import { AgentBinarySection } from './agent_binary_section';
import { FleetProxiesSection } from './fleet_proxies_section';
import { AdvancedSection } from './advanced_section';

// EUI's default restricted page width is 1200px (PAGE_MAX_WIDTH), but it is not
// exported publicly. Named const for reuse within this file.
const PAGE_CONTENT_MAX_WIDTH = 1200;

const settingsPageContentWrapperCss = css`
  max-width: ${PAGE_CONTENT_MAX_WIDTH}px;
  margin-inline: auto;
`;

export interface SettingsPageProps {
  outputs: Output[];
  proxies: FleetProxy[];
  fleetServerHosts: FleetServerHost[];
  deleteOutput: (output: Output) => void;
  deleteFleetServerHost: (fleetServerHost: FleetServerHost) => void;
  downloadSources: DownloadSource[];
  deleteDownloadSource: (ds: DownloadSource) => void;
  deleteFleetProxy: (proxy: FleetProxy) => void;
}

export const SettingsPage: React.FunctionComponent<SettingsPageProps> = ({
  outputs,
  proxies,
  fleetServerHosts,
  deleteOutput,
  deleteFleetServerHost,
  downloadSources,
  deleteDownloadSource,
  deleteFleetProxy,
}) => {
  return (
    <div css={settingsPageContentWrapperCss}>
      <EuiFlexGroup direction="column" gutterSize="m">
        <EuiFlexItem grow={false}>
          <FleetServerHostsSection
            fleetServerHosts={fleetServerHosts}
            deleteFleetServerHost={deleteFleetServerHost}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <OutputSection outputs={outputs} deleteOutput={deleteOutput} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <AgentBinarySection
            downloadSources={downloadSources}
            deleteDownloadSource={deleteDownloadSource}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <FleetProxiesSection proxies={proxies} deleteFleetProxy={deleteFleetProxy} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <AdvancedSection />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer />
    </div>
  );
};
