/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with, at
 * your election, the Elastic License 2.0.
 */

import React, { useCallback } from 'react';
import type { EuiListGroupItemProps } from '@elastic/eui';
import { EuiListGroupItem } from '@elastic/eui';
import { useChangeHistoryConfig } from '../../provider/use_change_history_config';
import * as i18n from '../timeline/translations';

export interface ChangeHistoryListGroupItemProps {
  onClick?: () => void;
  label?: EuiListGroupItemProps['label'];
  listGroupItemProps?: Partial<EuiListGroupItemProps>;
}

export function ChangeHistoryListGroupItem({
  onClick,
  label,
  listGroupItemProps,
}: ChangeHistoryListGroupItemProps): JSX.Element {
  const { openModal } = useChangeHistoryConfig();

  const handleClick = useCallback(() => {
    onClick?.();
    openModal();
  }, [onClick, openModal]);

  return (
    <EuiListGroupItem
      iconType="clockCounter"
      label={label ?? i18n.HISTORY_LIST_ITEM_LABEL}
      onClick={handleClick}
      data-test-subj="changeHistoryListGroupItem"
      {...listGroupItemProps}
    />
  );
}
