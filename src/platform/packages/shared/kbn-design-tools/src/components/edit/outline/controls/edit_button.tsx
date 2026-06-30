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

const editLabel = i18n.translate('kbnDesignTools.edit.outline.controls.editElement', {
  defaultMessage: 'Edit element',
});

export const EditButton = ({ onClick }: Props) => (
  <EuiToolTip content={editLabel} disableScreenReaderOutput>
    <EuiButtonIcon
      iconType="pencil"
      color="text"
      size="xs"
      aria-label={editLabel}
      onClick={onClick}
      data-test-subj="editOutlineEditButton"
    />
  </EuiToolTip>
);
