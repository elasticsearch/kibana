/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiIcon } from '@elastic/eui';
import * as i18n from './translations';

export const headerTypeOptions = [
  {
    value: 'config',
    inputDisplay: (
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="controls" size="s" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <span>{i18n.CONFIG_OPTION}</span>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    'data-test-subj': 'option-config',
  },
  {
    value: 'secret',
    inputDisplay: (
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="lock" size="s" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <span>{i18n.SECRET_OPTION}</span>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    'data-test-subj': 'option-secret',
  },
];
