/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { useEuiTheme } from '@elastic/eui';
import type { AggregateQuery, Filter, Query } from '@kbn/es-query';
import { getCoreStart } from '../services';
import { useAsCodeFilterConversion } from '../hooks/use_as_code_filter_conversion';
import type { SearchBarProps, SearchBarWrapperProps } from './search_bar';

type FallbackProps = Pick<SearchBarProps<AggregateQuery>, 'displayStyle'>;

const Fallback = ({ displayStyle }: FallbackProps) => {
  const { euiTheme } = useEuiTheme();
  return (
    <div
      css={{
        minHeight: `calc(${euiTheme.size.xxl} + ${euiTheme.size.s} * 2)`, // in px
        marginBottom:
          displayStyle && ['detached', 'withBorders'].includes(displayStyle)
            ? euiTheme.border.width.thin // in px
            : '0px',
      }}
    />
  );
};

const LazySearchBar = React.lazy(async () => {
  const { SearchBar } = await import('../ui_module');
  return { default: SearchBar };
});
const WrappedSearchBar = <QT extends AggregateQuery | Query = Query>(
  props: Omit<SearchBarWrapperProps<QT>, 'intl' | 'kibana'>
) => {
  const typeCastedProps = props as SearchBarWrapperProps<AggregateQuery>;
  const { displayStyle, asCodeFilterMode, filters, onFiltersUpdated, ...restProps } =
    typeCastedProps;
  const coreStart = getCoreStart();
  const convertedProps = useAsCodeFilterConversion({
    asCodeFilterMode,
    filters,
    onFiltersUpdated: onFiltersUpdated as ((filters: Filter[]) => void) | undefined,
    toasts: coreStart.notifications.toasts,
  });

  return (
    <React.Suspense fallback={<Fallback {...{ displayStyle }} />}>
      <LazySearchBar
        {...restProps}
        displayStyle={displayStyle}
        filters={convertedProps.filters}
        onFiltersUpdated={convertedProps.onFiltersUpdated}
      />
    </React.Suspense>
  );
};

export const SearchBar = WrappedSearchBar;
export type { StatefulSearchBarProps } from './create_search_bar';
export type {
  SearchBarFilterProps,
  SearchBarProps,
  SearchBarOwnProps,
  SearchBarWrapperProps,
} from './search_bar';
