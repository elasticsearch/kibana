/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiListGroupItem } from '@elastic/eui';
import { useChangeHistoryModal } from '../../provider/use_change_history_modal';
import * as i18n from '../timeline/translations';

export function ChangeHistoryListGroupItem(): JSX.Element {
  const { openModal } = useChangeHistoryModal();

  const handleClick = useCallback(() => {
    openModal();
  }, [openModal]);

  return (
    <EuiListGroupItem
      iconType="clockCounter"
      label={i18n.HISTORY_LIST_ITEM_LABEL}
      onClick={handleClick}
      data-test-subj="changeHistoryListGroupItem"
    />
  );
}
