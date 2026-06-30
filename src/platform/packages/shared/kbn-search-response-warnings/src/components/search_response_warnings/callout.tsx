/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useState } from 'react';
import { EuiCallOut, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { ViewDetailsPopover } from './view_details_popover';
import { getWarningsDescription, getWarningsTitle } from './i18n_utils';
import type { SearchResponseWarning } from '../../types';

const CALLOUT_DISMISSED_KEY = 'discover:warningCalloutDismissed';

interface Props {
  warnings: SearchResponseWarning[];
}

export const SearchResponseWarningsCallout = (props: Props) => {
  const [isDismissed, setIsDismissed] = useState(
    () => sessionStorage.getItem(CALLOUT_DISMISSED_KEY) === 'true'
  );

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    sessionStorage.setItem(CALLOUT_DISMISSED_KEY, 'true');
  }, []);

  if (!props.warnings.length || isDismissed) {
    return null;
  }

  return (
    <EuiCallOut
      title={getWarningsTitle(props.warnings)}
      color="warning"
      iconType="warning"
      size="s"
      data-test-subj="searchResponseWarningsCallout"
      onDismiss={handleDismiss}
    >
      <EuiFlexGroup gutterSize="xs" alignItems="center" direction="row">
        <EuiFlexItem grow={false}>{getWarningsDescription(props.warnings)}</EuiFlexItem>
        <EuiFlexItem grow={false}>
          <ViewDetailsPopover displayAsLink={true} warnings={props.warnings} />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiCallOut>
  );
};
