/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import type { Dispatch, SetStateAction } from 'react';
import { useMemo, useState } from 'react';

import { useInspect } from '../../../../../../../common/components/inspect/use_inspect';

import * as i18n from './translations';

const defaultInitialPanelId = 'default-initial-panel';

interface Props {
  onResetStackByFields: () => void;
  queryId: string;
}

export const useChartSettingsPopoverConfiguration = ({
  onResetStackByFields,
  queryId,
}: Props): {
  defaultInitialPanelId: string;
  defaultMenuItems: EuiContextMenuPanelDescriptor[];
  isPopoverOpen: boolean;
  setIsPopoverOpen: Dispatch<SetStateAction<boolean>>;
} => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { handleClick } = useInspect({
    queryId,
  });

  const defaultMenuItems: EuiContextMenuPanelDescriptor[] = useMemo(
    () => [
      {
        id: defaultInitialPanelId,
        items: [
          {
            icon: 'inspect',
            name: i18n.INSPECT,
            onClick: () => {
              setIsPopoverOpen(false);
              handleClick();
            },
            'data-test-subj': 'inspect',
          },
          {
            name: i18n.RESET_GROUP_BY_FIELDS,
            onClick: () => {
              setIsPopoverOpen(false);
              onResetStackByFields();
            },
            'data-test-subj': 'reset-group-by',
          },
        ],
      },
    ],
    [handleClick, onResetStackByFields]
  );

  return {
    defaultInitialPanelId,
    defaultMenuItems,
    isPopoverOpen,
    setIsPopoverOpen,
  };
};
