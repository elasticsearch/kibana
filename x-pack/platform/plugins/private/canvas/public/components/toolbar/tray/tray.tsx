/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode, MouseEventHandler } from 'react';
import React from 'react';
import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

const strings = {
  getCloseTrayAriaLabel: () =>
    i18n.translate('xpack.canvas.toolbarTray.closeTrayAriaLabel', {
      defaultMessage: 'Close tray',
    }),
};

interface Props {
  children: ReactNode;
  done: MouseEventHandler<HTMLAnchorElement>;
}

export const Tray = ({ children, done }: Props) => {
  return (
    <>
      <EuiFlexGroup className="canvasTray__toggle" justifyContent="spaceAround">
        <EuiFlexItem grow={false}>
          <EuiToolTip content={strings.getCloseTrayAriaLabel()} disableScreenReaderOutput>
            <EuiButtonIcon
              size="s"
              onClick={done}
              aria-label={strings.getCloseTrayAriaLabel()}
              iconType="chevronSingleDown"
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
      <div className="canvasTray">{children}</div>
    </>
  );
};
