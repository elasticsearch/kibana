/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiHorizontalRule, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { CortexPageRow } from './page_row';
import type { CortexPageSummary } from './types';

interface CortexActivityProps {
  pages: CortexPageSummary[];
  onSelectPage: (id: string) => void;
}

export function CortexActivity({ pages, onSelectPage }: CortexActivityProps) {
  const recent = useMemo(
    () => [...pages].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [pages]
  );

  return (
    <div data-test-subj="nightshiftCortexActivity">
      <EuiTitle size="m">
        <h2>
          <FormattedMessage
            id="xpack.significantEventsApp.cortex.activityTitle"
            defaultMessage="Activity"
          />
        </h2>
      </EuiTitle>
      <EuiSpacer />
      {recent.length === 0 ? (
        <EuiText color="subdued">
          <FormattedMessage
            id="xpack.significantEventsApp.cortex.activityEmptyDescription"
            defaultMessage="No Cortex updates yet. Pages appear here after investigations write to the wiki."
          />
        </EuiText>
      ) : (
        recent.map((page, index) => (
          <React.Fragment key={page.id}>
            {index > 0 && <EuiHorizontalRule margin="s" />}
            <CortexPageRow page={page} onSelectPage={onSelectPage} />
          </React.Fragment>
        ))
      )}
    </div>
  );
}
