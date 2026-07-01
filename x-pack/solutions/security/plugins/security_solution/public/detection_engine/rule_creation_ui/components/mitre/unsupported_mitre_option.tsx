/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiSuperSelectOption } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiTextColor } from '@elastic/eui';

import * as i18n from './translations';

interface UnsupportedMitreEntity {
  id: string;
  name?: string;
}

const UnsupportedMitreOptionDisplay: React.FC<UnsupportedMitreEntity> = ({ id, name }) => (
  <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
    <EuiFlexItem grow={false}>
      <EuiIcon type="warning" color="warning" aria-hidden={true} />
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiTextColor color="warning">{i18n.UNSUPPORTED_MITRE_OPTION_LABEL(id, name)}</EuiTextColor>
    </EuiFlexItem>
  </EuiFlexGroup>
);

/**
 * Builds a disabled "ghost" `EuiSuperSelect` option that represents a MITRE
 * ATT&CK® entity no longer present in the bundled dataset. Use this to keep
 * the unsupported value visible in the select while signaling that the user
 * must replace it with a supported value.
 *
 * The option's `value` is the raw MITRE ID so that the consuming select can
 * set `valueOfSelected` to the same id and render this option in the trigger.
 * When the stored entity carries a name it is rendered alongside the id using
 * the same `Name (ID)` format as supported options.
 */
export const createUnsupportedMitreOption = (
  entity: UnsupportedMitreEntity
): EuiSuperSelectOption<string> => ({
  value: entity.id,
  inputDisplay: <UnsupportedMitreOptionDisplay id={entity.id} name={entity.name} />,
  dropdownDisplay: <UnsupportedMitreOptionDisplay id={entity.id} name={entity.name} />,
  disabled: true,
  'data-test-subj': `mitreUnsupportedOption-${entity.id}`,
});
