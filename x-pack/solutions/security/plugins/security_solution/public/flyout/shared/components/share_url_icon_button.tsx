/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { memo } from 'react';
import { EuiButtonIcon, EuiCopy, EuiFlexItem, EuiToolTip } from '@elastic/eui';

export interface ShareUrlIconButtonProps {
  /**
   * Absolute URL to copy; when null/undefined, nothing is rendered
   */
  url: string | null | undefined;
  /**
   * Tooltip content
   */
  tooltip: ReactNode;
  /**
   * Accessible label for the icon button
   */
  ariaLabel: string;
  /**
   * data-test-subj for the button
   */
  dataTestSubj: string;
}

/**
 * Share icon that copies a URL to the clipboard (EuiCopy + EuiButtonIcon).
 */
export const ShareUrlIconButton = memo(
  ({ url, tooltip, ariaLabel, dataTestSubj }: ShareUrlIconButtonProps) => {
    if (!url) {
      return null;
    }

    return (
      <EuiFlexItem grow={false}>
        <EuiToolTip content={tooltip}>
          <EuiCopy textToCopy={url}>
            {(copy) => (
              <EuiToolTip content={ariaLabel} disableScreenReaderOutput>
                <EuiButtonIcon
                  iconType="share"
                  color="text"
                  aria-label={ariaLabel}
                  data-test-subj={dataTestSubj}
                  onClick={copy}
                  onKeyDown={copy}
                />
              </EuiToolTip>
            )}
          </EuiCopy>
        </EuiToolTip>
      </EuiFlexItem>
    );
  }
);

ShareUrlIconButton.displayName = 'ShareUrlIconButton';
