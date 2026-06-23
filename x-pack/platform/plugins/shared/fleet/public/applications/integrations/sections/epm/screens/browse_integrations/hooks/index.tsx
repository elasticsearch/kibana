/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';

import { searchIdField, useLocalSearch } from '../../../../../hooks';

import { useAvailablePackages } from '../../home/hooks/use_available_packages';
import type { IntegrationCardItem } from '../../home';

import { useUrlFilters } from './url_filters';
import { useUrlCategories, useUrlDefaultCategories, useSetUrlCategory } from './url_categories';

export function useBrowseIntegrationHook({
  prereleaseIntegrationsEnabled,
}: {
  prereleaseIntegrationsEnabled: boolean;
}) {
  const { category: urlCategory, subCategory: selectedSubCategory } = useUrlCategories();
  const urlDefaultCategories = useUrlDefaultCategories();
  const setUrlCategory = useSetUrlCategory();

  // Priority: path-based single category (sidebar click) > URL query params (multi-default).
  // Config defaults are written to the URL once on first load (in BrowseIntegrationsPage) and
  // are not re-applied here so that navigating to "All categories" or clicking X clears them.
  const effectiveCategories = useMemo<string[]>(() => {
    if (urlCategory) return [urlCategory];
    return urlDefaultCategories;
  }, [urlCategory, urlDefaultCategories]);

  // Single string used for subcategory lookup; first of effective categories, or empty for "All".
  const selectedCategory = effectiveCategories[0] || '';
  const {
    initialSelectedCategory,
    allCategories,
    isLoading,
    isLoadingCategories,
    isLoadingAllPackages,
    isLoadingAppendCustomIntegrations,
    eprPackageLoadingError,
    eprCategoryLoadingError,
    allCards: originalFilteredCards,
  } = useAvailablePackages({ prereleaseIntegrationsEnabled });

  const urlFilters = useUrlFilters();

  const localSearch = useLocalSearch(originalFilteredCards, !!isLoading);
  const searchTerm = urlFilters.q ?? urlFilters.q !== '' ? urlFilters.q : undefined;

  const sortedCards: IntegrationCardItem[] = useMemo(() => {
    const sortKey = urlFilters.sort ?? 'recent-old';

    if (sortKey === 'a-z') {
      return [...originalFilteredCards].sort((a, b) => {
        return a.title.localeCompare(b.title);
      });
    } else if (sortKey === 'z-a') {
      return [...originalFilteredCards].sort((a, b) => {
        return b.title.localeCompare(a.title);
      });
    } else {
      // TODO implement recent-old and old-recent sorting when we have a date field
      return originalFilteredCards;
    }
  }, [originalFilteredCards, urlFilters.sort]);

  // Cards filtered by non-category filters (search, status, setup method, signal).
  // Used to compute accurate category counts in the sidebar.
  const nonCategoryFilteredCards = useMemo(() => {
    const searchResults = searchTerm
      ? (localSearch?.search(searchTerm) as IntegrationCardItem[])?.map(
          (match) => match[searchIdField]
        ) ?? []
      : [];

    let cards = searchTerm
      ? sortedCards.filter((item) => searchResults.includes(item[searchIdField]) ?? [])
      : sortedCards;

    // Apply status filters
    const statusFilters = urlFilters.status;
    if (statusFilters && statusFilters.length > 0) {
      const filterDeprecated = statusFilters.includes('deprecated');

      if (filterDeprecated) {
        cards = cards.filter((card) => {
          return 'isDeprecated' in card && card.isDeprecated === true;
        });
      }
    }

    // Apply setup method filters (union: show cards matching ANY selected method)
    const setupMethodFilters = urlFilters.setupMethod;
    if (setupMethodFilters && setupMethodFilters.length > 0) {
      cards = cards.filter((card) => {
        return setupMethodFilters.some((method) => {
          switch (method) {
            case 'agentless':
              return card.supportsAgentless === true;
            case 'elastic_agent':
              return card.type === 'integration' || card.type === 'input';
            default:
              return false;
          }
        });
      });
    }

    // Apply signal filters (union: show cards matching ANY selected signal)
    const signalFilters = urlFilters.signal;
    if (signalFilters && signalFilters.length > 0) {
      cards = cards.filter((card) => signalFilters.some((s) => card.signalTypes?.includes(s)));
    }

    // Hide content packs by default; only show when the user has explicitly enabled the filter
    if (!urlFilters.showContent) {
      cards = cards.filter((card) => card.type !== 'content');
    }

    return cards;
  }, [
    localSearch,
    searchTerm,
    sortedCards,
    urlFilters.status,
    urlFilters.setupMethod,
    urlFilters.signal,
    urlFilters.showContent,
  ]);

  // Apply category filter on top of non-category filters.
  // When multiple effective categories are active, show cards matching ANY of them (OR logic).
  const filteredCards = useMemo(() => {
    if (effectiveCategories.length > 0 || selectedSubCategory) {
      return nonCategoryFilteredCards.filter((c) => {
        if (selectedSubCategory) return c.categories.includes(selectedSubCategory);
        return effectiveCategories.some((cat) => c.categories.includes(cat));
      });
    }
    return nonCategoryFilteredCards;
  }, [nonCategoryFilteredCards, effectiveCategories, selectedSubCategory]);

  // Recompute category counts based on non-category filtered cards so
  // sidebar counts reflect active filters (e.g. agentless, search, signal).
  const filteredAllCategories = useMemo(() => {
    return allCategories.map((category) => {
      if (category.id === '') {
        return { ...category, count: nonCategoryFilteredCards.length };
      }
      const count = nonCategoryFilteredCards.filter((card) =>
        card.categories.includes(category.id)
      ).length;
      return { ...category, count };
    });
  }, [allCategories, nonCategoryFilteredCards]);

  const filteredMainCategories = useMemo(() => {
    return filteredAllCategories.filter((category) => category.parent_id === undefined);
  }, [filteredAllCategories]);

  const availableSubCategories = useMemo(() => {
    return filteredAllCategories?.filter(
      (c) => c.parent_id !== undefined && effectiveCategories.includes(c.parent_id)
    );
  }, [filteredAllCategories, effectiveCategories]);

  const onCategoryChange = useCallback(
    ({ id }: { id: string }) => {
      setUrlCategory({ category: id });
    },
    [setUrlCategory]
  );

  const onSortChange = useCallback((sortKey: string) => {}, []);

  return {
    initialSelectedCategory,
    selectedCategory,
    selectedCategories: effectiveCategories,
    allCategories: filteredAllCategories,
    mainCategories: filteredMainCategories,
    isLoading,
    isLoadingCategories,
    isLoadingAllPackages,
    isLoadingAppendCustomIntegrations,
    eprPackageLoadingError,
    eprCategoryLoadingError,
    filteredCards,
    availableSubCategories,
    onCategoryChange,
    onSortChange,
  };
}
