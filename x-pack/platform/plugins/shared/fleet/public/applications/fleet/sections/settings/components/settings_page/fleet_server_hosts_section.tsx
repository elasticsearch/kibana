/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { EuiLink, EuiSpacer, EuiButtonEmpty } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

import type { FleetServerHost } from '../../../../types';
import { useAuthz, useLink, useStartServices } from '../../../../hooks';
import { FleetServerHostsTable } from '../fleet_server_hosts_table';

import { SettingsSectionPanel } from './settings_section_panel';

export interface FleetServerHostsSectionProps {
  fleetServerHosts: FleetServerHost[];
  deleteFleetServerHost: (fleetServerHost: FleetServerHost) => void;
}

export const FleetServerHostsSection: React.FunctionComponent<FleetServerHostsSectionProps> = ({
  fleetServerHosts,
  deleteFleetServerHost,
}) => {
  const authz = useAuthz();
  const { docLinks } = useStartServices();
  const { getHref } = useLink();

  return (
    <SettingsSectionPanel
      data-test-subj="fleetServerHostHeader"
      title={
        <FormattedMessage
          id="xpack.fleet.settings.fleetServerHostSectionTitle"
          defaultMessage="Fleet server hosts"
        />
      }
      description={
        <FormattedMessage
          id="xpack.fleet.settings.fleetServerHostSectionSubtitle"
          defaultMessage="Specify the URLs that your agents will use to connect to a Fleet Server. If multiple URLs exist, Fleet will show the first provided URL for enrollment purposes. For more information, see the {guideLink} ."
          values={{
            guideLink: (
              <EuiLink href={docLinks.links.fleet.guide} target="_blank" external>
                <FormattedMessage
                  id="xpack.fleet.settings.fleetUserGuideLink"
                  defaultMessage="Fleet and Elastic Agent Guide"
                />
              </EuiLink>
            ),
          }}
        />
      }
    >
      <FleetServerHostsTable
        fleetServerHosts={fleetServerHosts}
        deleteFleetServerHost={deleteFleetServerHost}
      />
      {authz.fleet.addFleetServers ? (
        <>
          <EuiSpacer size="s" />
          <EuiButtonEmpty
            iconType="plusCircle"
            href={getHref('settings_create_fleet_server_hosts')}
            data-test-subj="settings.fleetServerHosts.addFleetServerHostBtn"
          >
            <FormattedMessage
              id="xpack.fleet.settings.fleetServerHostCreateButtonLabel"
              defaultMessage="Add Fleet Server"
            />
          </EuiButtonEmpty>
        </>
      ) : null}
    </SettingsSectionPanel>
  );
};
