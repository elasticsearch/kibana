/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

interface Props {
  onClick: () => void;
}

const duplicateLabel = i18n.translate('kbnDesignTools.edit.outline.controls.duplicateElement', {
  defaultMessage: 'Duplicate element',
});

export const DuplicateButton = ({ onClick }: Props) => (
  <EuiToolTip content={duplicateLabel} disableScreenReaderOutput>
    <EuiButtonIcon
      iconType="copy"
      color="text"
      size="xs"
      aria-label={duplicateLabel}
      onClick={onClick}
      data-test-subj="editOutlineDuplicateButton"
    />
  </EuiToolTip>
);
