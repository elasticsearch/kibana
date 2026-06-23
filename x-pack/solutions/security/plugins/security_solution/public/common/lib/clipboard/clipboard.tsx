/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import classNames from 'classnames';
import copy from 'copy-to-clipboard';
import React from 'react';

import * as i18n from './translations';
import { useAppToasts } from '../../hooks/use_app_toasts';

export const COPY_TO_CLIPBOARD_BUTTON_CLASS_NAME = 'copy-to-clipboard';

export type OnCopy = ({
  content,
  isSuccess,
}: {
  content: string | number;
  isSuccess: boolean;
}) => void;

interface Props {
  children?: JSX.Element;
  content: string | number;
  isHoverAction?: boolean;
  onCopy?: OnCopy;
  titleSummary?: string;
  toastLifeTimeMs?: number;
}

export const Clipboard = ({
  children,
  content,
  isHoverAction,
  onCopy,
  titleSummary,
  toastLifeTimeMs,
}: Props) => {
  const { addSuccess } = useAppToasts();
  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const isSuccess = copy(`${content}`, { debug: true });

    if (onCopy != null) {
      onCopy({ content, isSuccess });
    }

    if (isSuccess) {
      addSuccess(`${i18n.COPIED} ${titleSummary} ${i18n.TO_THE_CLIPBOARD}`, { toastLifeTimeMs });
    }
  };

  const className = classNames(COPY_TO_CLIPBOARD_BUTTON_CLASS_NAME, {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    securitySolution__hoverActionButton: isHoverAction,
  });

  return (
    <EuiToolTip content={i18n.COPY_TO_THE_CLIPBOARD} disableScreenReaderOutput>
      <EuiButtonIcon
        aria-label={i18n.COPY_TO_THE_CLIPBOARD}
        className={className}
        data-test-subj="clipboard"
        iconType="copy"
        onClick={onClick}
      >
        {children}
      </EuiButtonIcon>
    </EuiToolTip>
  );
};
