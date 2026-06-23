/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC } from 'react';
import React, { useState } from 'react';
import { EuiButtonIcon, EuiPopover, EuiToolTip } from '@elastic/eui';
import { strings } from './action_strings';
import type { FilterItemActionsProps } from './types';
import { FilterItemActions } from './actions';

export const MinimisedFilterItemActions: FC<FilterItemActionsProps> = (props) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const onMoreActionsButtonClick = () => {
    setIsPopoverOpen((isOpen) => !isOpen);
  };

  const closePopover = () => setIsPopoverOpen(false);

  const button = (
    <EuiToolTip content={strings.getMoreActionsLabel()} disableScreenReaderOutput>
      <EuiButtonIcon
        iconType="boxesVertical"
        color="text"
        aria-label={strings.getMoreActionsLabel()}
        onClick={onMoreActionsButtonClick}
      />
    </EuiToolTip>
  );

  return (
    <EuiPopover
      ownFocus={false}
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      aria-label={strings.getMoreActionsLabel()}
    >
      <FilterItemActions {...props} minimizePaddings={true} />
    </EuiPopover>
  );
};
