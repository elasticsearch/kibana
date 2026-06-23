/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import { css } from '@emotion/react';
import {
  EuiButtonIcon,
  EuiCodeBlock,
  EuiCopy,
  EuiToolTip,
  useEuiTheme,
  type EuiCodeBlockProps,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

const DEFAULT_MASK = '********';

export const maskSecretValues = (value: string, secrets: string[]): string =>
  secrets
    .filter((secret) => secret.length > 0)
    .sort((a, b) => b.length - a.length)
    .reduce((maskedValue, secret) => maskedValue.split(secret).join(DEFAULT_MASK), value);

interface MaskedCodeBlockProps {
  value: string;
  secrets: string[];
  language: EuiCodeBlockProps['language'];
  paddingSize?: EuiCodeBlockProps['paddingSize'];
  overflowHeight?: EuiCodeBlockProps['overflowHeight'];
  dataTestSubj: string;
}

export const MaskedCodeBlock: React.FC<MaskedCodeBlockProps> = ({
  value,
  secrets,
  language,
  paddingSize = 'm',
  overflowHeight,
  dataTestSubj,
}) => {
  const { euiTheme } = useEuiTheme();
  const [showSecrets, setShowSecrets] = useState(false);
  const hasSecrets = secrets.some((secret) => secret.length > 0 && value.includes(secret));
  const displayedValue = useMemo(
    () => (showSecrets || !hasSecrets ? value : maskSecretValues(value, secrets)),
    [hasSecrets, secrets, showSecrets, value]
  );
  const copyLabel = i18n.translate(
    'xpack.observability_onboarding.maskedCodeBlock.copyUnmaskedSnippetButtonLabel',
    { defaultMessage: 'Copy to clipboard' }
  );
  const showSecretsLabel = i18n.translate(
    'xpack.observability_onboarding.maskedCodeBlock.showSecretsButtonLabel',
    { defaultMessage: 'Show secrets' }
  );
  const hideSecretsLabel = i18n.translate(
    'xpack.observability_onboarding.maskedCodeBlock.hideSecretsButtonLabel',
    { defaultMessage: 'Hide secrets' }
  );
  const showSecretsToggleLabel = showSecrets ? hideSecretsLabel : showSecretsLabel;
  const maxHeight = typeof overflowHeight === 'number' ? `${overflowHeight}px` : overflowHeight;

  return (
    <div
      css={css`
        position: relative;
      `}
    >
      {hasSecrets ? (
        <div
          css={css`
            position: absolute;
            right: ${euiTheme.size.xs};
            top: ${euiTheme.size.xs};
            z-index: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: ${euiTheme.size.xs};
          `}
        >
          <EuiCopy textToCopy={value}>
            {(copyToClipboard) => (
              <EuiToolTip content={copyLabel} disableScreenReaderOutput>
                <EuiButtonIcon
                  aria-label={copyLabel}
                  color="text"
                  data-test-subj={`${dataTestSubj}CopyButtonIcon`}
                  iconType="copy"
                  onClick={copyToClipboard}
                  size="s"
                />
              </EuiToolTip>
            )}
          </EuiCopy>
          <EuiToolTip content={showSecretsToggleLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              aria-label={showSecretsToggleLabel}
              aria-pressed={showSecrets}
              color="text"
              data-test-subj={`${dataTestSubj}ShowSecretsButton`}
              iconType={showSecrets ? 'eyeSlash' : 'eye'}
              onClick={() => setShowSecrets((currentShowSecrets) => !currentShowSecrets)}
              size="s"
            />
          </EuiToolTip>
        </div>
      ) : null}
      <div
        css={css`
          ${maxHeight
            ? `
                max-height: ${maxHeight};
                overflow: auto;
              `
            : ''}

          .euiCodeBlock__pre {
            ${hasSecrets ? `padding-right: calc(${euiTheme.size.xxl} + ${euiTheme.size.s});` : ''}
          }
        `}
      >
        <EuiCodeBlock
          paddingSize={paddingSize}
          language={language}
          isCopyable={!hasSecrets}
          data-test-subj={dataTestSubj}
        >
          {displayedValue}
        </EuiCodeBlock>
      </div>
    </div>
  );
};
