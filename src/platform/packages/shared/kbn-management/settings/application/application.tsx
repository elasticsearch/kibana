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
  EuiText,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  Query,
  EuiTabs,
  EuiCallOut,
} from '@elastic/eui';
import { getCategoryCounts } from '@kbn/management-settings-utilities';
import { Form } from '@kbn/management-settings-components-form';
import type { SettingsTabs } from '@kbn/management-settings-types/tab';
import { EmptyState } from './empty_state';
import { i18nTexts } from './i18n_texts';
import { Tab } from './tab';
import { readOnlyBadge } from './read_only_badge';
import { useScopeFields } from './hooks/use_scope_fields';
import type { QueryInputProps } from './query_input';
import { QueryInput } from './query_input';
import { useServices } from './services';

export const DATA_TEST_SUBJ_SETTINGS_TITLE = 'managementSettingsTitle';
export const SPACE_SETTINGS_TAB_ID = 'space-settings';
export const GLOBAL_SETTINGS_TAB_ID = 'global-settings';

function addQueryParam(url: string, param: string, value: string) {
  const urlObj = new URL(url);
  if (value) {
    urlObj.searchParams.set(param, value);
  } else {
    urlObj.searchParams.delete(param);
  }

  return urlObj.search;
}

function getQueryParam(url: string) {
  if (url) {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('query') || '';
  }
  return '';
}

/**
 * Component for displaying the {@link SettingsApplication} component.
 */
export const SettingsApplication = () => {
  const { addUrlToHistory, getSections, getToastsService, getCapabilities, setBadge } =
    useServices();

  const queryParam = getQueryParam(window.location.href);
  const [query, setQuery] = useState<Query>(Query.parse(queryParam));

  const onQueryChange: QueryInputProps['onQueryChange'] = (newQuery = Query.parse('')) => {
    setQuery(newQuery);

    const search = addQueryParam(window.location.href, 'query', newQuery.text);
    addUrlToHistory(search);
  };

  const {
    spaceFields: spaceAllFields,
    globalFields: globalAllFields,
    isLoading: allFieldsLoading,
  } = useScopeFields();
  const {
    spaceFields: spaceFilteredFields,
    globalFields: globalFilteredFields,
    isLoading: filteredFieldsLoading,
  } = useScopeFields(query);
  const isLoading = allFieldsLoading || filteredFieldsLoading;

  const [selectedTabId, setSelectedTabId] = useState(SPACE_SETTINGS_TAB_ID);

  const {
    spaceSettings: { save: canSaveSpaceSettings },
    globalSettings: { save: canSaveGlobalSettings, show: canShowGlobalSettings },
  } = getCapabilities();
  if (!canSaveSpaceSettings || (!canSaveGlobalSettings && canShowGlobalSettings)) {
    setBadge(readOnlyBadge);
  }

  if (isLoading) {
    return <EuiLoadingSpinner size="xl" />;
  }

  // Only enabled the Global settings tab if there are any global settings
  // and if global settings can be shown
  const globalTabEnabled = globalAllFields.length > 0 && canShowGlobalSettings;

  const tabs: SettingsTabs = {
    [SPACE_SETTINGS_TAB_ID]: {
      name: i18nTexts.spaceTabTitle,
      fields: spaceFilteredFields,
      categoryCounts: getCategoryCounts(spaceAllFields),
      callOutTitle: i18nTexts.spaceCalloutTitle,
      callOutText: i18nTexts.spaceCalloutText,
      sections: getSections('namespace'),
      isSavingEnabled: canSaveSpaceSettings,
    },
  };
  if (globalTabEnabled) {
    tabs[GLOBAL_SETTINGS_TAB_ID] = {
      name: i18nTexts.globalTabTitle,
      fields: globalFilteredFields,
      categoryCounts: getCategoryCounts(globalAllFields),
      callOutTitle: i18nTexts.globalCalloutTitle,
      callOutText: i18nTexts.globalCalloutText,
      sections: getSections('global'),
      isSavingEnabled: canSaveGlobalSettings,
    };
  }

  const selectedTab = tabs[selectedTabId];

  return (
    <div>
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiText>
            <h1 data-test-subj={DATA_TEST_SUBJ_SETTINGS_TITLE}>
              {i18nTexts.advancedSettingsTitle}
            </h1>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <QueryInput
            {...{ categories: Object.keys(selectedTab.categoryCounts), query, onQueryChange }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      {globalTabEnabled && (
        <>
          <EuiTabs>
            {Object.keys(tabs).map((id, i) => (
              <Tab
                id={id}
                key={i}
                name={tabs[id].name}
                onChangeSelectedTab={() => setSelectedTabId(id)}
                isSelected={id === selectedTabId}
              />
            ))}
          </EuiTabs>
          <EuiSpacer size="xl" />
          <EuiCallOut announceOnMount={false} title={selectedTab.callOutTitle} iconType="warning">
            <p>{selectedTab.callOutText}</p>
          </EuiCallOut>
        </>
      )}
      <EuiSpacer size="xl" />
      {selectedTab.fields.length ? (
        <>
          <Form
            fields={selectedTab.fields}
            categoryCounts={selectedTab.categoryCounts}
            isSavingEnabled={selectedTab.isSavingEnabled}
            onClearQuery={() => onQueryChange()}
            scope={selectedTabId === SPACE_SETTINGS_TAB_ID ? 'namespace' : 'global'}
          />
          <EuiSpacer size="l" />
          {selectedTab.sections.length > 0 &&
            selectedTab.sections.map(({ Component, queryMatch }, index) => {
              if (queryMatch(query.text)) {
                return (
                  <Component
                    key={`component-${index}`}
                    toasts={getToastsService()}
                    enableSaving={{
                      global: canSaveGlobalSettings,
                      namespace: canSaveSpaceSettings,
                    }}
                  />
                );
              }
            })}
        </>
      ) : (
        <EmptyState {...{ queryText: query?.text, onClearQuery: () => onQueryChange() }} />
      )}
    </div>
  );
};
