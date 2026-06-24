/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiLink, EuiButtonEmpty } from '@elastic/eui';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { useSelectedLocation } from '../../monitor_details/hooks/use_selected_location';
import { useSyntheticsSettingsContext } from '../../../contexts';
import { getErrorDetailsUrl } from '../../monitor_details/monitor_errors/errors_list';
import { useGetUrlParams } from '../../../hooks';
import { useUrlSpaceId } from '../../../hooks/use_url_space_id';

export const ErrorDetailsLink = ({
  stateId,
  configId,
  label,
  locationId,
}: {
  configId: string;
  stateId: string;
  label: string;
  locationId?: string;
}) => {
  const link = useErrorDetailsLink({ configId, stateId, locationId });

  return (
    <EuiLink data-test-subj="syntheticsErrorDetailsLinkLink" href={link}>
      {label ?? VIEW_DETAILS}
    </EuiLink>
  );
};

export const ErrorDetailsButton = ({
  stateId,
  configId,
  label,
}: {
  configId: string;
  stateId: string;
  label?: string;
}) => {
  const selectedLocation = useSelectedLocation();
  const link = useErrorDetailsLink({ configId, stateId, locationId: selectedLocation?.id });

  return (
    <EuiButtonEmpty
      data-test-subj="syntheticsErrorDetailsButtonButton"
      flush="left"
      iconType="warning"
      color="danger"
      href={link}
    >
      {label ?? VIEW_DETAILS}
    </EuiButtonEmpty>
  );
};

export const useErrorDetailsLink = ({
  stateId,
  configId,
  locationId,
  remoteName: remoteNameOverride,
}: {
  configId: string;
  stateId: string;
  locationId?: string;
  remoteName?: string;
}) => {
  const { basePath } = useSyntheticsSettingsContext();
  const spaceId = useUrlSpaceId();
  const { remoteName: remoteNameFromUrl } = useGetUrlParams();
  const remoteName = remoteNameOverride ?? remoteNameFromUrl;

  return getErrorDetailsUrl({
    basePath,
    configId,
    stateId,
    locationId,
    spaceId,
    remoteName,
  });
};

const VIEW_DETAILS = i18n.translate('xpack.synthetics.monitor.step.viewErrorDetails', {
  defaultMessage: 'View error details',
});
