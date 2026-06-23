/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useHistory } from 'react-router-dom';
import { EuiLink, EuiIcon } from '@elastic/eui';
import { InPortal } from 'react-reverse-portal';
import { useSelectedLocation } from '../monitor_details/hooks/use_selected_location';
import { useUrlSpaceId } from '../../hooks/use_url_space_id';
import { buildMonitorParamsSearch } from '../../utils/url_params';
import { MonitorDetailsLinkPortalNode } from './portals';

interface Props {
  name: string;
  configId: string;
  locationId?: string;
  updateUrl?: boolean;
  remoteName?: string;
}

export const MonitorDetailsLinkPortal = ({
  name,
  configId,
  locationId,
  updateUrl,
  remoteName,
}: Props) => {
  return (
    <InPortal node={MonitorDetailsLinkPortalNode}>
      {locationId ? (
        <MonitorDetailsLinkWithLocation
          name={name}
          configId={configId}
          locationId={locationId}
          updateUrl={updateUrl}
          remoteName={remoteName}
        />
      ) : (
        <MonitorDetailsLink name={name} configId={configId} remoteName={remoteName} />
      )}
    </InPortal>
  );
};

const MonitorDetailsLinkWithLocation = ({
  name,
  configId,
  locationId,
  updateUrl,
  remoteName,
}: Props) => {
  const selectedLocation = useSelectedLocation({ updateUrl });
  const spaceId = useUrlSpaceId();

  let locId = locationId;

  if (selectedLocation?.id && !locationId) {
    locId = selectedLocation.id;
  }

  const history = useHistory();
  const href = history.createHref({
    pathname: `monitor/${configId}`,
    search: buildMonitorParamsSearch({ locationId: locId, spaceId, remoteName }),
  });
  return <MonitorLink href={href} name={name} />;
};

const MonitorDetailsLink = ({ name, configId, remoteName }: Props) => {
  const spaceId = useUrlSpaceId();
  const history = useHistory();
  const href = history.createHref({
    pathname: `monitor/${configId}`,
    search: buildMonitorParamsSearch({ spaceId, remoteName }),
  });
  return <MonitorLink href={href} name={name} />;
};

const MonitorLink = ({ href, name }: { href: string; name: string }) => {
  return (
    <EuiLink data-test-subj="syntheticsMonitorDetailsLinkLink" href={href}>
      <EuiIcon type="chevronSingleLeft" aria-hidden={true} /> {name}
    </EuiLink>
  );
};
