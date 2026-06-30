/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiEmptyPrompt, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { NightshiftIllustration } from './nightshift_illustration';

export function NightshiftApp() {
  return (
    <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: '60vh' }}>
      <EuiFlexItem grow={false}>
        <EuiEmptyPrompt
          data-test-subj="nightshiftEmptyState"
          icon={<NightshiftIllustration />}
          title={
            <h2>
              {i18n.translate('xpack.nightshift.emptyState.title', {
                defaultMessage: 'Nightshift',
              })}
            </h2>
          }
          body={
            <EuiText color="subdued" size="s">
              <p>
                {i18n.translate('xpack.nightshift.emptyState.comingSoon', {
                  defaultMessage: 'Coming soon',
                })}
              </p>
            </EuiText>
          }
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
