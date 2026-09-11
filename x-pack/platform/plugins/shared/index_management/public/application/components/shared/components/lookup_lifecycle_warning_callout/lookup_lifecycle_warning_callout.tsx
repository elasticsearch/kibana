/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ReactNode } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { KbnWarningCallout } from '@kbn/ui-callout';

interface Props {
  description: ReactNode;
}

// ES accepts lifecycle settings on lookup index templates but does not apply them to lookup-mode indices, so wizard steps warn without blocking.
export const LookupLifecycleWarningCallout = ({ description }: Props) => (
  <KbnWarningCallout
    announceOnMount
    title={
      <FormattedMessage
        id="xpack.idxMgmt.lookupLifecycleWarning.title"
        defaultMessage="Lifecycle settings are not applied to lookup indices"
      />
    }
    text={<p>{description}</p>}
    data-test-subj="lookupLifecycleWarning"
  />
);
