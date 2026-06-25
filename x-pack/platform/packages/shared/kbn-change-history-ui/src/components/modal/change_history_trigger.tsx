/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiButtonProps } from '@elastic/eui';
import { EuiButton } from '@elastic/eui';
import { useChangeHistoryConfig } from '../../provider/use_change_history_config';
import * as i18n from '../timeline/translations';

export interface ChangeHistoryTriggerProps {
  buttonProps?: Partial<EuiButtonProps>;
  children?: React.ReactNode;
}

export function ChangeHistoryTrigger({
  buttonProps,
  children,
}: ChangeHistoryTriggerProps): JSX.Element {
  const { openModal } = useChangeHistoryConfig();

  return (
    <EuiButton
      iconType="clock"
      onClick={openModal}
      data-test-subj="changeHistoryTrigger"
      {...buttonProps}
    >
      {children ?? i18n.TRIGGER_LABEL}
    </EuiButton>
  );
}
