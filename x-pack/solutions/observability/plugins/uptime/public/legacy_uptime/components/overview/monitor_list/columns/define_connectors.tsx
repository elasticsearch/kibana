/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { EuiSwitch, EuiPopover, EuiText, EuiFormRow } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { ReactRouterEuiLink } from '../../../common/react_router_helpers';
import { SETTINGS_ROUTE } from '../../../../../../common/constants';
import { ENABLE_STATUS_ALERT } from './translations';

export const DefineAlertConnectors = () => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const onButtonClick = () => setIsPopoverOpen((val) => !val);
  const closePopover = () => setIsPopoverOpen(false);

  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.uptime.monitorList.defineConnectors.popoverAriaLabel', {
        defaultMessage: 'Default connector information',
      })}
      button={
        <>
          <EuiFormRow>
            <EuiSwitch
              id={'defineAlertSettingsSwitch'}
              label={ENABLE_STATUS_ALERT}
              showLabel={false}
              aria-label={ENABLE_STATUS_ALERT}
              // this switch is read only, no onChange applied
              onChange={onButtonClick}
              checked={false}
              compressed={true}
              data-test-subj={'uptimeDisplayDefineConnector'}
            />
          </EuiFormRow>
        </>
      }
      isOpen={isPopoverOpen}
      closePopover={closePopover}
    >
      <EuiText style={{ width: '350px' }} data-test-subj={'uptimeSettingsDefineConnector'}>
        <ReactRouterEuiLink
          to={SETTINGS_ROUTE + '?focusConnectorField=true'}
          data-test-subj={'uptimeSettingsLink'}
        >
          <FormattedMessage
            id="xpack.uptime.page_header.defineConnector.popover.defaultLink"
            defaultMessage="Define a default connector"
          />
        </ReactRouterEuiLink>{' '}
        <FormattedMessage
          id="xpack.uptime.monitorList.defineConnector.popover.description"
          defaultMessage="to receive status alerts."
        />
      </EuiText>
    </EuiPopover>
  );
};
