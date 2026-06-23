/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React, { useMemo, useState } from 'react';
import { EuiPopover, EuiButtonEmpty, EuiButton, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useHistory } from 'react-router-dom';

export const ViewLocationMonitors = ({
  count,
  locationName,
}: {
  count: number;
  locationName: string;
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const onButtonClick = () => setIsPopoverOpen((prevState) => !prevState);
  const closePopover = () => setIsPopoverOpen(false);

  const button = (
    <EuiButtonEmpty data-test-subj="syntheticsViewLocationMonitorsButton" onClick={onButtonClick}>
      {count}
    </EuiButtonEmpty>
  );

  const history = useHistory();

  const { formattedLocationName, href, viewMonitorsMessage } = useMemo(
    () => ({
      formattedLocationName: <strong>{locationName}</strong>,
      href:
        count > 0
          ? history.createHref({
              pathname: '/monitors',
              search: `?locations=${JSON.stringify([locationName])}`,
            })
          : history.createHref({
              pathname: '/add-monitor',
            }),
      viewMonitorsMessage: count > 0 ? VIEW_LOCATION_MONITORS : CREATE_MONITOR,
    }),
    [count, history, locationName]
  );

  return (
    <EuiPopover
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      aria-label={i18n.translate('xpack.synthetics.viewLocationMonitors.popoverAriaLabel', {
        defaultMessage: 'Location monitors details',
      })}
    >
      {count > 0 ? (
        <GreaterThanZeroMessage count={count} name={formattedLocationName} />
      ) : (
        <ZeroMessage name={formattedLocationName} />
      )}

      <EuiSpacer size="s" />
      <ViewLocationMonitorsButton href={href}>{viewMonitorsMessage}</ViewLocationMonitorsButton>
    </EuiPopover>
  );
};

const ViewLocationMonitorsButton: FC<PropsWithChildren<{ href: string }>> = ({
  href,
  children,
}) => {
  return (
    <EuiButton data-test-subj="syntheticsViewLocationMonitorsButton" href={href}>
      {children}
    </EuiButton>
  );
};

const VIEW_LOCATION_MONITORS = i18n.translate(
  'xpack.synthetics.monitorManagement.viewLocationMonitors',
  {
    defaultMessage: 'View monitors',
  }
);

const CREATE_MONITOR = i18n.translate('xpack.synthetics.monitorManagement.createLocationMonitors', {
  defaultMessage: 'Create monitor',
});

const GreaterThanZeroMessage = ({ count, name }: { count: number; name: JSX.Element }) => (
  <FormattedMessage
    id="xpack.synthetics.monitorManagement.viewMonitors"
    defaultMessage="{name} is used in {count, number} {count, plural,one {monitor} other {monitors}}."
    values={{ count, name }}
  />
);

const ZeroMessage = ({ name }: { name: JSX.Element }) => (
  <FormattedMessage
    id="xpack.synthetics.monitorManagement.viewZeroMonitors"
    defaultMessage="{name} isn't used in any monitors yet."
    values={{ name }}
  />
);
