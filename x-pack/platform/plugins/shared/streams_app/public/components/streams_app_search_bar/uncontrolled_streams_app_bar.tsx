/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import type { StatefulSearchBarProps } from '@kbn/unified-search-plugin/public';
import { useKibana } from '../../hooks/use_kibana';

export type UncontrolledStreamsAppSearchBarProps = Omit<
  StatefulSearchBarProps & { asCodeFilterMode?: false },
  'appName'
>;

export function UncontrolledStreamsAppSearchBar(props: UncontrolledStreamsAppSearchBarProps) {
  const { unifiedSearch } = useKibana().dependencies.start;

  return (
    <unifiedSearch.ui.SearchBar
      appName="streamsApp"
      showDatePicker={false}
      showFilterBar={false}
      showQueryMenu={false}
      showQueryInput={false}
      submitButtonStyle="iconOnly"
      displayStyle="inPage"
      disableQueryLanguageSwitcher
      query={undefined}
      isAutoRefreshDisabled={true}
      {...props}
    />
  );
}
