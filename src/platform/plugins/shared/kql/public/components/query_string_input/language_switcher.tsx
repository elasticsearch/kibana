/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PopoverAnchorPosition } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiHorizontalRule,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelectable,
  EuiToolTip,
  toSentenceCase,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { useState } from 'react';
import type { DocLinksStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';

export const strings = {
  getSwitchLanguageButtonText: () =>
    i18n.translate('kql.switchLanguage.buttonText', {
      defaultMessage: 'Switch language button.',
    }),
  getFilterLanguageLabel: () =>
    i18n.translate('kql.switchLanguage.filterLanguageLabel', {
      defaultMessage: 'Filter language',
    }),
  documentationLabel: () =>
    i18n.translate('kql.switchLanguage.documentationLabel', {
      defaultMessage: 'Documentation',
    }),
};

export interface QueryLanguageSwitcherProps {
  language: string;
  onSelectLanguage: (newLanguage: string) => void;
  anchorPosition?: PopoverAnchorPosition;
  nonKqlMode?: 'lucene' | 'text';
  isOnTopBarMenu?: boolean;
  isDisabled?: boolean;
  deps: {
    docLinks: DocLinksStart;
  };
}

export const QueryLanguageSwitcher = React.memo(function QueryLanguageSwitcher({
  language,
  anchorPosition,
  onSelectLanguage,
  nonKqlMode = 'lucene',
  isOnTopBarMenu,
  isDisabled,
  deps: { docLinks },
}: QueryLanguageSwitcherProps) {
  const kueryQuerySyntaxDocs = docLinks.links.query.kueryQuerySyntax;
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const button = (
    <EuiToolTip content={strings.getSwitchLanguageButtonText()} disableScreenReaderOutput>
      <EuiButtonIcon
        size="s"
        iconType="filter"
        onClick={() => setIsPopoverOpen(!isPopoverOpen)}
        className="kqlQueryBar__languageSwitcherButton"
        data-test-subj={'switchQueryLanguageButton'}
        aria-label={strings.getSwitchLanguageButtonText()}
        disabled={isDisabled}
      />
    </EuiToolTip>
  );

  const isKqlSelected = language === 'kuery';

  const languageMenuItem = (
    <>
      <EuiSelectable
        aria-label={strings.getFilterLanguageLabel()}
        options={[
          {
            key: 'kuery',
            label: 'KQL',
            'data-test-subj': 'kqlLanguageMenuItem',
            checked: isKqlSelected ? 'on' : undefined,
          },
          {
            key: nonKqlMode,
            label: toSentenceCase(nonKqlMode),
            'data-test-subj': 'luceneLanguageMenuItem',
            checked: !isKqlSelected ? 'on' : undefined,
          },
        ]}
        onChange={(newOptions) => {
          const selectedOptions = newOptions.find((option) => option.checked === 'on');

          if (selectedOptions) {
            onSelectLanguage(selectedOptions.key);
          }
        }}
        singleSelection={true}
        listProps={{ bordered: false, paddingSize: 's' }}
      >
        {(list) => list}
      </EuiSelectable>
      <EuiHorizontalRule margin="xs" />
      <EuiContextMenuItem
        key={'documentation'}
        icon={'documentation'}
        href={kueryQuerySyntaxDocs}
        target="_blank"
      >
        {strings.documentationLabel()}
      </EuiContextMenuItem>
    </>
  );

  const languageQueryStringComponent = (
    <EuiPopover
      id="queryLanguageSwitcherPopover"
      anchorPosition={anchorPosition || 'downLeft'}
      button={button}
      isOpen={isPopoverOpen}
      closePopover={() => setIsPopoverOpen(false)}
      repositionOnScroll
      panelPaddingSize="none"
      aria-label={i18n.translate('kql.query.queryBar.syntaxOptionsPopover.ariaLabel', {
        defaultMessage: 'Syntax options',
      })}
    >
      <EuiPopoverTitle paddingSize="s">
        <FormattedMessage
          id="kql.query.queryBar.syntaxOptionsTitle"
          defaultMessage="Syntax options"
        />
      </EuiPopoverTitle>
      {languageMenuItem}
    </EuiPopover>
  );

  return Boolean(isOnTopBarMenu) ? languageMenuItem : languageQueryStringComponent;
});
