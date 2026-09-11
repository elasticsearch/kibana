/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { ComponentProps } from 'react';
import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import useDebounce from 'react-use/lib/useDebounce';
import type { EuiFlyoutProps } from '@elastic/eui';
import {
  EuiFlyout,
  useEuiTheme,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiTitle,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { getFilteredGroups } from '../../utils/get_filtered_groups';
import { DocumentationMainContent, DocumentationNavigation, SEARCH_DEBOUNCE_TIME } from '../shared';
import { getESQLDocsSections } from '../../sections';
import type { LanguageDocumentationSections } from '../../types';

interface DocumentationFlyoutProps {
  isHelpMenuOpen: boolean;
  onHelpMenuVisibilityChange: (status: boolean) => void;
  searchInDescription?: boolean;
  linkToDocumentation?: string;
  /**
   * Flyout width. Defaults to a fixed pixel width. Pass a named size (e.g. `'s'`)
   * when this flyout is opened as a child of another flyout.
   */
  size?: EuiFlyoutProps['size'];
}

function DocumentationFlyout({
  searchInDescription,
  linkToDocumentation,
  isHelpMenuOpen,
  onHelpMenuVisibilityChange,
  size,
}: DocumentationFlyoutProps) {
  const [documentationSections, setDocumentationSections] =
    useState<LanguageDocumentationSections>();

  const { euiTheme } = useEuiTheme();
  const DEFAULT_WIDTH = euiTheme.base * 34;

  const [selectedSection, setSelectedSection] = useState<string | undefined>();
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');

  useDebounce(
    () => {
      setDebouncedSearchText(searchText);
    },
    SEARCH_DEBOUNCE_TIME,
    [searchText]
  );

  const scrollTargets = useRef<Record<string, HTMLElement>>({});

  const onNavigationChange = useCallback<
    NonNullable<ComponentProps<typeof DocumentationNavigation>>['onNavigationChange']
  >((selectedOptions) => {
    setSelectedSection(selectedOptions.length ? selectedOptions[0].label : undefined);
    if (selectedOptions.length) {
      const scrollToElement = scrollTargets.current[selectedOptions[0].label];
      scrollToElement.scrollIntoView();
    }
  }, []);

  useEffect(() => {
    onHelpMenuVisibilityChange(isHelpMenuOpen ?? false);
  }, [isHelpMenuOpen, onHelpMenuVisibilityChange]);

  useEffect(() => {
    async function getDocumentation() {
      const sections = await getESQLDocsSections();
      setDocumentationSections(sections);
    }
    if (!documentationSections) {
      getDocumentation();
    }
  }, [documentationSections]);

  const filteredGroups = useMemo(() => {
    return getFilteredGroups(debouncedSearchText, searchInDescription, documentationSections, 1);
  }, [documentationSections, debouncedSearchText, searchInDescription]);

  return (
    <>
      {isHelpMenuOpen && (
        <EuiFlyout
          ownFocus
          onClose={() => onHelpMenuVisibilityChange(false)}
          aria-labelledby="esqlInlineDocumentationFlyout"
          data-test-subj="esqlInlineDocumentationFlyout"
          css={{ zIndex: 1 }}
          type="push"
          size={size ?? DEFAULT_WIDTH}
          paddingSize="m"
          className="esqlInlineDocumentationFlyout"
        >
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="s">
              <h3 id="esqlInlineDocumentationFlyout">
                {i18n.translate('languageDocumentation.documentationFlyoutTitle', {
                  defaultMessage: 'ES|QL quick reference',
                })}
              </h3>
            </EuiTitle>
            <EuiSpacer size="m" />
            <DocumentationNavigation
              searchText={searchText}
              setSearchText={setSearchText}
              onNavigationChange={onNavigationChange}
              filteredGroups={filteredGroups}
              linkToDocumentation={linkToDocumentation}
              selectedSection={selectedSection}
            />
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <DocumentationMainContent
              searchText={debouncedSearchText}
              scrollTargets={scrollTargets}
              filteredGroups={filteredGroups}
              sections={documentationSections}
            />
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  );
}

export const LanguageDocumentationFlyout = React.memo(DocumentationFlyout);
