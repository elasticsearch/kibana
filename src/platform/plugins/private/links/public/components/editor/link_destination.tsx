/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';

import { EuiFormRow } from '@elastic/eui';

import { DASHBOARD_LINK_TYPE, EXTERNAL_LINK_TYPE } from '../../../common/constants';
import type { LinkType } from '../../../common/types';
import type { ResolvedLink } from '../../types';
import { DashboardLinkDestinationPicker } from '../dashboard_link/dashboard_link_destination_picker';
import { ExternalLinkDestinationPicker } from '../external_link/external_link_destination_picker';
import { LinksStrings } from '../links_strings';

export const LinkDestination = ({
  link,
  setDestination,
  parentDashboardId,
  selectedLinkType,
}: {
  selectedLinkType: LinkType;
  parentDashboardId?: string;
  link?: ResolvedLink;
  setDestination: (
    destination?: string,
    defaultLabel?: string,
    defaultDescription?: string
  ) => void;
}) => {
  const [destinationError, setDestinationError] = useState<string | undefined>();

  /**
   * Store the dashboard / external destinations separately so that we can remember the selections
   * made in each component even when the selected link type changes
   */
  const [dashboardLinkDestination, setDashboardLinkDestination] = useState<string | undefined>(
    link && link.type === DASHBOARD_LINK_TYPE ? link.destination : undefined
  );
  const [externalLinkDestination, setExternalLinkDestination] = useState<string | undefined>(
    link && link.type === EXTERNAL_LINK_TYPE ? link.destination : undefined
  );

  const isInvalid = Boolean(destinationError);

  return (
    <EuiFormRow
      error={destinationError}
      isInvalid={isInvalid}
      label={LinksStrings.editor.linkEditor.getLinkDestinationLabel()}
      data-test-subj={`links--linkDestination${isInvalid ? '--error' : ''}`}
    >
      {selectedLinkType === DASHBOARD_LINK_TYPE ? (
        <DashboardLinkDestinationPicker
          onUnmount={(selectedDashboardId) => {
            setDestination(undefined, undefined);
            if (selectedDashboardId) setDashboardLinkDestination(selectedDashboardId);
          }}
          parentDashboardId={parentDashboardId}
          initialSelection={dashboardLinkDestination}
          onDestinationPicked={(dashboard) =>
            setDestination(dashboard?.id, dashboard?.title, dashboard?.description)
          }
        />
      ) : (
        <ExternalLinkDestinationPicker
          onUnmount={(selectedUrl) => {
            setDestinationError(undefined);
            setDestination(undefined, undefined);
            if (selectedUrl) setExternalLinkDestination(selectedUrl);
          }}
          initialSelection={externalLinkDestination}
          onDestinationPicked={(url) => setDestination(url, url)}
          setDestinationError={setDestinationError}
        />
      )}
    </EuiFormRow>
  );
};
