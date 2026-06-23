/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiDescriptionList,
  EuiHealth,
  EuiIcon,
  EuiLink,
  EuiSkeletonText,
  EuiPopover,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useMemo, useState, useCallback } from 'react';

import type {
  EncryptedSyntheticsSavedMonitor,
  ServiceLocation,
} from '../../../../../../common/runtime_types';
import { useStatusByLocation } from '../../../hooks';

export const MonitorLocationSelect = ({
  monitorLocations,
  configId,
  selectedLocation,
  compressed,
  onChange,
  isDisabled,
}: {
  compressed?: boolean;
  isDisabled?: boolean;
  configId: string;
  onChange: (label: string, id: string) => void;
  selectedLocation?: ServiceLocation | null;
  monitorLocations?: EncryptedSyntheticsSavedMonitor['locations'];
}) => {
  const theme = useEuiTheme();
  const { locations: locationsStatus, loading: loadingLocationsStatus } = useStatusByLocation({
    configId,
    monitorLocations,
  });

  const [isLocationListOpen, setIsLocationListOpen] = useState(false);
  const openLocationList = useCallback(() => setIsLocationListOpen(true), []);
  const closeLocationList = useCallback(() => setIsLocationListOpen(false), []);

  const locationList = useMemo(() => {
    if (!selectedLocation || !monitorLocations) {
      return '';
    }

    const showSelection =
      monitorLocations.length === 1 && monitorLocations[0].id !== selectedLocation?.id;

    if (monitorLocations.length > 1 || showSelection) {
      const button = (
        <EuiLink
          data-test-subj="syntheticsLocationListLink"
          onClick={openLocationList}
          disabled={isDisabled}
        >
          {selectedLocation.label}{' '}
          {!isDisabled ? <EuiIcon type="chevronSingleDown" aria-hidden={true} /> : null}
        </EuiLink>
      );

      const menuItems =
        loadingLocationsStatus && !locationsStatus
          ? [
              <span key="loading">
                {i18n.translate('xpack.synthetics.locationList.span.loadingLabel', {
                  defaultMessage: 'Loading...',
                })}
              </span>,
            ]
          : locationsStatus
              .map((location) => {
                return (
                  <EuiContextMenuItem
                    key={location.label}
                    icon={<EuiHealth color={location.color} />}
                    css={
                      selectedLocation?.id === location.id
                        ? {
                            textDecoration: 'underline',
                            backgroundColor: theme.euiTheme.colors.lightShade,
                            pointerEvents: 'none',
                          }
                        : undefined
                    }
                    onClick={
                      selectedLocation?.id !== location.id
                        ? () => {
                            closeLocationList();
                            onChange(location.id, location.label);
                          }
                        : undefined
                    }
                  >
                    {location.label}
                  </EuiContextMenuItem>
                );
              })
              .filter((l): l is JSX.Element => typeof l !== undefined);

      return (
        <EuiPopover
          button={button}
          isOpen={isLocationListOpen}
          closePopover={closeLocationList}
          panelPaddingSize="none"
          aria-label={i18n.translate('xpack.synthetics.monitorLocationSelect.popoverAriaLabel', {
            defaultMessage: 'Location selection menu',
          })}
        >
          <EuiContextMenuPanel
            items={menuItems}
            title={i18n.translate(
              'xpack.synthetics.monitorLocation.locationContextMenuTitleLabel',
              { defaultMessage: 'Go to location' }
            )}
          />
        </EuiPopover>
      );
    } else {
      return selectedLocation.label;
    }
  }, [
    closeLocationList,
    isDisabled,
    isLocationListOpen,
    loadingLocationsStatus,
    locationsStatus,
    monitorLocations,
    onChange,
    openLocationList,
    selectedLocation,
    theme.euiTheme.colors.lightShade,
  ]);

  if (!selectedLocation || !monitorLocations) {
    if (selectedLocation) {
      return (
        <EuiDescriptionList
          compressed={compressed}
          listItems={[{ title: LOCATION_LABEL, description: selectedLocation?.label }]}
        />
      );
    }
    return (
      <EuiDescriptionList
        compressed={compressed}
        listItems={[{ title: LOCATION_LABEL, description: <EuiSkeletonText lines={1} /> }]}
      />
    );
  }

  return (
    <EuiDescriptionList
      compressed={compressed}
      listItems={[{ title: LOCATION_LABEL, description: locationList }]}
    />
  );
};

const LOCATION_LABEL = i18n.translate('xpack.synthetics.monitorLocation.locationLabel', {
  defaultMessage: 'Location',
});
