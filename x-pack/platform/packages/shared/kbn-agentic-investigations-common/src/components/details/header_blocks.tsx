/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiAvatar, EuiBadge, EuiText } from '@elastic/eui';
import { InfoBlocks, type InfoBlockItem } from '@kbn/flyout-info-blocks';
import type { Investigation } from '../../types';
import { getEmptyValue } from '../helpers';
import { TEMPLATE_UI_LABELS } from '../../template_ui/translations';

export interface InvestigationHeaderBlocksProps {
  investigation: Investigation;
}

/**
 * Status and assignee tiles shown above the flyout tabs.
 *
 * Read-only: the only way to write conversation template metadata today is Agent Builder's
 * internal HTTP route, which is on neither its public start contract nor a package constant.
 */
export const InvestigationHeaderBlocks = ({ investigation }: InvestigationHeaderBlocksProps) => {
  const { status, assignee } = investigation;

  const items = useMemo<InfoBlockItem[]>(
    () => [
      {
        id: 'status',
        title: TEMPLATE_UI_LABELS.status,
        value: <EuiBadge color="hollow">{status ?? getEmptyValue()}</EuiBadge>,
      },
      {
        id: 'assignees',
        title: TEMPLATE_UI_LABELS.assignees,
        value: assignee ? (
          <EuiAvatar size="s" name={assignee} />
        ) : (
          <EuiText size="s" color="subdued">
            {TEMPLATE_UI_LABELS.unassigned}
          </EuiText>
        ),
      },
    ],
    [status, assignee]
  );

  return <InfoBlocks items={items} maxColumns={2} data-test-subj="investigationHeaderBlocks" />;
};
