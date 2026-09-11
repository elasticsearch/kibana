/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { Fragment, useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  useEuiTheme,
  EuiToolTip,
  EuiPopover,
  EuiButtonIcon,
  EuiPopoverTitle,
  EuiText,
  EuiDescriptionList,
  useGeneratedHtmlId,
  logicalCSS,
  mathWithUnits,
  euiYScroll,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { esqlKeyboardShortcuts } from './esql_keyboard_shortcuts';

const renderShortcutKeys = (keys: readonly string[]) =>
  keys.map((key, index) => (
    <Fragment key={`${key}-${index}`}>
      {index > 0 ? ' ' : null}
      <kbd>{key}</kbd>
    </Fragment>
  ));

export function KeyboardShortcuts() {
  const euiThemeContext = useEuiTheme();
  const { euiTheme } = euiThemeContext;

  const [isOpen, setIsOpen] = useState(false);

  const label = i18n.translate('esqlEditor.query.keyboardShortcutsLabel', {
    defaultMessage: 'Keyboard shortcuts',
  });
  const labelId = useGeneratedHtmlId();

  const containerStyles = css`
    ${logicalCSS('max-height', '80vh')}
    ${logicalCSS(
      'max-width',
      mathWithUnits(euiTheme.size.xxl, (x) => x * 10)
    )}
    padding: ${euiTheme.size.m};
    ${euiYScroll(euiThemeContext)}

    .euiDescriptionList {
      row-gap: 0; /* Row spacing handled by default EuiText dd/dt styles */
    }
  `;
  return (
    <>
      <EuiPopover
        aria-labelledby={labelId}
        data-test-subj="editorKeyboardShortcutsPopover"
        isOpen={isOpen}
        closePopover={() => setIsOpen(false)}
        anchorPosition="downRight"
        panelPaddingSize="none"
        button={
          <EuiToolTip content={label} disableScreenReaderOutput>
            <EuiButtonIcon
              size="xs"
              iconType="keyboard"
              data-test-subj="editorKeyboardShortcutsButton"
              onClick={() => setIsOpen(!isOpen)}
              aria-label={label}
              color="text"
            />
          </EuiToolTip>
        }
      >
        <EuiPopoverTitle paddingSize="s">
          <h2 id={labelId}>{label}</h2>
        </EuiPopoverTitle>
        <EuiText css={containerStyles} className="keyboardShortcuts" size="xs">
          <EuiDescriptionList
            aria-labelledby={labelId}
            type="column"
            columnWidths={['auto', 'auto']}
            align="center"
            compressed
            listItems={esqlKeyboardShortcuts.map(({ keys, label: shortcutLabel }) => ({
              title: renderShortcutKeys(keys),
              description: shortcutLabel,
            }))}
          />
        </EuiText>
      </EuiPopover>
    </>
  );
}
