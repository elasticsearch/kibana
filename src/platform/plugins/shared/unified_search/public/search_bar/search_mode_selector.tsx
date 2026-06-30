/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import {
  EuiButtonIcon,
  EuiFlexItem,
  EuiFlexGroup,
  EuiPopover,
  EuiSwitch,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';

interface SearchModeSelectorProps {
  useApproximation: boolean;
  onChange: (useApproximation: boolean) => void;
}

export const SearchModeSelector = ({ useApproximation, onChange }: SearchModeSelectorProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  return (
    <EuiFlexItem grow={false}>
      <EuiPopover
        button={
          <EuiButtonIcon
            iconType="bolt"
            aria-label={i18n.translate(
              'unifiedSearch.searchModeSelector.button.ariaLabel',
              { defaultMessage: 'Search performance options' }
            )}
            size="s"
            color={useApproximation ? 'success' : 'text'}
            display={useApproximation ? 'base' : 'empty'}
            data-test-subj="searchModeSelectorButton"
            onClick={() => setIsPopoverOpen((open) => !open)}
          />
        }
        isOpen={isPopoverOpen}
        closePopover={() => setIsPopoverOpen(false)}
        panelPaddingSize="m"
        anchorPosition="downRight"
      >
        <div
          css={css`
            max-width: 280px;
          `}
        >
          <EuiFlexGroup direction="column" gutterSize="s">
            <EuiFlexItem>
              <EuiTitle size="xs">
                <h3>
                  {i18n.translate('unifiedSearch.searchModeSelector.title', {
                    defaultMessage: 'Optimize search performance',
                  })}
                </h3>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="s">
                <p>
                  {i18n.translate('unifiedSearch.searchModeSelector.description', {
                    defaultMessage:
                      'Use approximate execution to return faster, estimated results (~90% confidence).',
                  })}
                </p>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="xs" color="subdued">
                <p>
                  {i18n.translate('unifiedSearch.searchModeSelector.disclaimer', {
                    defaultMessage: 'Results might slightly differ from exact values.',
                  })}
                </p>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiSwitch
                label={
                  useApproximation
                    ? i18n.translate('unifiedSearch.searchModeSelector.fastMode.label', {
                        defaultMessage: 'Fast mode',
                      })
                    : i18n.translate('unifiedSearch.searchModeSelector.exactMode.label', {
                        defaultMessage: 'Exact mode',
                      })
                }
                checked={useApproximation}
                onChange={(e) => onChange(e.target.checked)}
                data-test-subj="searchModeSelectorSwitch"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </div>
      </EuiPopover>
    </EuiFlexItem>
  );
};
