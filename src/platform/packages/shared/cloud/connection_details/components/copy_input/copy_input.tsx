/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as React from 'react';
import {
  EuiButtonIcon,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiScreenReaderOnly,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

export interface CopyInputProps {
  value: string;
  onCopyClick?: React.MouseEventHandler<HTMLAnchorElement>;
  onCopySuccess?: () => void;
  screenReaderHint?: string;
}

export const CopyInput: React.FC<CopyInputProps> = ({
  value,
  onCopyClick,
  onCopySuccess,
  screenReaderHint,
}) => {
  const textRef = React.useRef<HTMLSpanElement>(null);
  const screenReaderHintId = React.useId();
  const hasScreenReaderHint = Boolean(screenReaderHint);

  return (
    <EuiPanel borderRadius="none" hasShadow={false} color={'subdued'} grow={false}>
      <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
        <EuiFlexItem>
          <EuiText
            size={'s'}
            color={'subdued'}
            style={{ wordBreak: 'break-all' }}
            data-test-subj="copyInputValue"
          >
            <span
              ref={textRef}
              onMouseDown={(event) => {
                const span = textRef.current;
                if (!span) return;
                if (window.getSelection && document.createRange) {
                  const selection = window.getSelection();
                  if (!selection) return;
                  event.preventDefault();
                  const range = document.createRange();
                  range.selectNodeContents(span);
                  selection.removeAllRanges();
                  selection.addRange(range);
                }
              }}
              data-test-subj="copyText"
            >
              {value}
            </span>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {hasScreenReaderHint && (
            <EuiScreenReaderOnly>
              <span id={screenReaderHintId}>{screenReaderHint}</span>
            </EuiScreenReaderOnly>
          )}
          <EuiCopy textToCopy={value}>
            {(copy) => (
              <EuiToolTip
                content={i18n.translate(
                  'cloud.connectionDetails.components.copyInput.copyBtn.label',
                  {
                    defaultMessage: 'Copy to clipboard',
                  }
                )}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
                    onCopyClick?.(event);
                    copy();
                    onCopySuccess?.();
                  }}
                  iconType="copy"
                  size="m"
                  color={'text'}
                  aria-describedby={hasScreenReaderHint ? screenReaderHintId : undefined}
                  aria-label={i18n.translate(
                    'cloud.connectionDetails.components.copyInput.copyBtn.label',
                    {
                      defaultMessage: 'Copy to clipboard',
                    }
                  )}
                />
              </EuiToolTip>
            )}
          </EuiCopy>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
