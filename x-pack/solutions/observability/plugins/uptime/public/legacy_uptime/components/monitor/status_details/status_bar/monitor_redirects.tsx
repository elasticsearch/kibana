/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiPopover,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
  EuiButtonEmpty,
} from '@elastic/eui';
import type { Ping } from '../../../../../../common/runtime_types';
import { PingRedirects } from '../../ping_list/ping_redirects';

interface Props {
  monitorStatus: Ping | null;
}

export const MonitorRedirects: React.FC<Props> = ({ monitorStatus }) => {
  const list = monitorStatus?.http?.response?.redirects;

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const button = (
    <EuiDescriptionListDescription>
      <EuiButtonEmpty
        className="euiLink euiLink--primary"
        onClick={() => setIsPopoverOpen(!isPopoverOpen)}
        data-test-subj="uptimeMonitorRedirectInfo"
        iconType="chevronSingleDown"
        iconSide="right"
      >
        {i18n.translate('xpack.uptime.monitorList.redirects.title.number', {
          defaultMessage: '{number}',
          values: {
            number: list?.length ?? 0,
          },
        })}
      </EuiButtonEmpty>
    </EuiDescriptionListDescription>
  );

  return list ? (
    <>
      <EuiDescriptionListTitle>Redirects</EuiDescriptionListTitle>
      <EuiPopover
        aria-label={i18n.translate('xpack.uptime.monitorRedirects.popoverAriaLabel', {
          defaultMessage: 'Monitor redirects details',
        })}
        button={button}
        isOpen={isPopoverOpen}
        anchorPosition="downLeft"
        closePopover={() => setIsPopoverOpen(false)}
      >
        <PingRedirects monitorStatus={monitorStatus} />
      </EuiPopover>
    </>
  ) : null;
};
