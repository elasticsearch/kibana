/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiText, type IconType } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { UserContentCommonSchema } from '@kbn/content-management-table-list-view-common';
import { createFilterControl, defineContentListFilter } from '@kbn/content-list-provider-client';
import { getTypes } from '../../services';

/**
 * KQL field for the type filter. Matches the `typeTitle` the Type column
 * renders and the `typeTitle` sort field, so search, sort, and filter all key
 * off the same value.
 */
const TYPE_FIELD = 'typeTitle';

const typeFilterTitle = i18n.translate('visualizations.listing.typeFilter.title', {
  defaultMessage: 'Type',
});

/**
 * The filter dimension registered on the provider via `features.filters`.
 * No static `options`, so the control lists only the types present in the
 * current page (faceted) — the toolbar control is placed by
 * {@link VisualizeTypeFilter}.
 */
export const visualizeTypeFilter = defineContentListFilter<
  UserContentCommonSchema & { typeTitle?: string }
>({
  id: 'visualizationType',
  queryField: TYPE_FIELD,
  title: typeFilterTitle,
  getItemValue: (item) => item.typeTitle,
});

interface TypeIconMeta {
  icon?: IconType;
  image?: string;
}

/**
 * Lazily builds a `typeTitle -> { icon, image }` map from the visualization
 * type registry — the same source the Type column icon resolves from. Shared
 * across option rows via a single in-flight promise.
 */
let iconMetaPromise: Promise<Map<string, TypeIconMeta>> | undefined;
const loadTypeIconMeta = (): Promise<Map<string, TypeIconMeta>> => {
  if (!iconMetaPromise) {
    iconMetaPromise = (async () => {
      const map = new Map<string, TypeIconMeta>();
      const add = (title?: string, icon?: IconType, image?: string) => {
        if (title && !map.has(title)) {
          map.set(title, { icon, image });
        }
      };
      const types = getTypes();
      for (const visType of await types.all()) {
        add(visType.title, visType.icon, visType.image);
      }
      for (const alias of types.getAliases()) {
        add(alias.title, alias.icon);
      }
      return map;
    })();
  }
  return iconMetaPromise;
};

/** Type label with its registry icon, mirroring the Type column cell. */
const VisualizeTypeOption = ({ value, label }: { value: string; label: string }) => {
  const [meta, setMeta] = useState<TypeIconMeta>({});

  useEffect(() => {
    let cancelled = false;
    loadTypeIconMeta().then((map) => {
      if (!cancelled) {
        setMeta(map.get(value) ?? {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const { icon, image } = meta;

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        {image ? (
          <img src={image} alt="" aria-hidden width={16} height={16} />
        ) : (
          <EuiIcon type={icon || 'empty'} size="m" aria-hidden />
        )}
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText size="s" data-test-subj={`visualizeListingTypeOption-${value}`}>
          {label}
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

/**
 * Declarative control for the toolbar's `<Filters>` slot. Pair with
 * {@link visualizeTypeFilter} registered on the provider.
 */
export const VisualizeTypeFilter = createFilterControl(visualizeTypeFilter, {
  'data-test-subj': 'visualizeListingTypeFilter',
  renderOptionContent: ({ value, label }) => <VisualizeTypeOption {...{ value, label }} />,
});
