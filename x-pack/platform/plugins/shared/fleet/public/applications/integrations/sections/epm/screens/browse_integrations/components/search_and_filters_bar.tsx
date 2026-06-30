/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback, useMemo, useState } from 'react';

import {
  EuiButton,
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFieldSearch,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormPrepend,
  EuiIcon,
  EuiPopover,
  EuiScreenReaderOnly,
  EuiSelectable,
  EuiSpacer,
  EuiToolTip,
  mathWithUnits,
  useEuiTheme,
} from '@elastic/eui';
import type { UseEuiTheme, EuiSelectableOption } from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import styled from '@emotion/styled';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';
import useDebounce from 'react-use/lib/useDebounce';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';

import type { CategoryFacet } from '../../home/category_facets';

import { useUrlFilters, useAddUrlFilters } from '../hooks/url_filters';
import {
  useUrlCategories,
  useSetUrlCategory,
  useUrlDefaultCategories,
} from '../hooks/url_categories';
import type {
  BrowseIntegrationSortType,
  IntegrationStatusFilterType,
  SetupMethodFilterType,
  SignalFilterType,
} from '../types';
import { SETUP_METHOD_AGENTLESS, SETUP_METHOD_ELASTIC_AGENT } from '../types';
import { dataTypes } from '../../../../../../../../common/constants';
import { StatusFilter } from '../../../components/status_filter';

const SEARCH_DEBOUNCE_MS = 150;

export const StickyFlexItem = styled(EuiFlexItem)`
  position: sticky;
  background-color: ${(props) => props.theme.euiTheme.colors.backgroundBasePlain};
  z-index: ${(props) => props.theme.euiTheme.levels.menu};
  top: var(--kbn-application--sticky-headers-offset, var(--kbn-layout--header-height, '0px'));
  padding-top: ${(props) => props.theme.euiTheme.size.m};
`;

const SortFilter: React.FC = () => {
  const urlFilters = useUrlFilters();
  const addUrlFilters = useAddUrlFilters();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const togglePopover = useCallback(() => setIsOpen((prevIsOpen) => !prevIsOpen), []);
  const closePopover = useCallback(() => setIsOpen(false), []);
  const options = useMemo(
    () => [
      // TODO enabled when supported
      // {
      //   label: i18n.translate(
      //     'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.sortByRecentOldOption',
      //     {
      //       defaultMessage: 'Recent-Old',
      //     }
      //   ),
      //   key: 'recent-old',
      // },
      // {
      //   label: i18n.translate(
      //     'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.sortByOldRecentOption',
      //     {
      //       defaultMessage: 'Old-Recent',
      //     }
      //   ),
      //   key: 'old-recent',
      // },
      {
        label: i18n.translate(
          'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.sortByAZOption',
          {
            defaultMessage: 'A-Z',
          }
        ),
        key: 'a-z',
        'data-test-subj': 'browseIntegrations.searchBar.sortByAZOption',
      },
      {
        label: i18n.translate(
          'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.sortByZAOption',
          {
            defaultMessage: 'Z-A',
          }
        ),
        key: 'z-a',
        'data-test-subj': 'browseIntegrations.searchBar.sortByZAOption',
      },
    ],
    []
  );

  const selectedOption = useMemo(() => {
    if (!urlFilters.sort) {
      return options[0];
    }

    return options.find((option) => option.key === urlFilters.sort) ?? options[0];
  }, [urlFilters.sort, options]);

  return (
    <EuiFilterGroup compressed>
      <EuiPopover
        id="browseIntegrationsSortPopover"
        aria-label={i18n.translate(
          'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.sortPopoverAriaLabel',
          { defaultMessage: 'Sort options' }
        )}
        isOpen={isOpen}
        closePopover={closePopover}
        panelPaddingSize="s"
        button={
          <EuiFilterButton
            data-test-subj="browseIntegrations.searchBar.sortBtn"
            iconType="chevronSingleDown"
            onClick={togglePopover}
            isSelected={isOpen}
          >
            {selectedOption.label}
          </EuiFilterButton>
        }
      >
        <EuiSelectable
          searchable={false}
          singleSelection={true}
          options={options}
          onChange={(newOptions) => {
            const selected = newOptions.find((option) => option.checked);
            if (selected) {
              addUrlFilters({ sort: selected.key as BrowseIntegrationSortType });
              closePopover();
            }
          }}
          listProps={{
            showIcons: false,
          }}
        >
          {(list) => list}
        </EuiSelectable>
      </EuiPopover>
    </EuiFilterGroup>
  );
};

const SetupMethodFilter: React.FC<{
  selectedMethods?: SetupMethodFilterType[];
  onChange: (methods: SetupMethodFilterType[]) => void;
}> = ({ selectedMethods = [], onChange }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const togglePopover = useCallback(() => setIsOpen((prevIsOpen) => !prevIsOpen), []);
  const closePopover = useCallback(() => setIsOpen(false), []);

  const options: EuiSelectableOption[] = useMemo(
    () => [
      {
        label: i18n.translate(
          'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.setupMethodAgentlessOption',
          { defaultMessage: 'Managed Integration' }
        ),
        key: SETUP_METHOD_AGENTLESS,
        checked: selectedMethods.includes(SETUP_METHOD_AGENTLESS) ? 'on' : undefined,
        'data-test-subj': 'browseIntegrations.searchBar.setupMethodAgentlessOption',
      },
      {
        label: i18n.translate(
          'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.setupMethodElasticAgentOption',
          { defaultMessage: 'Elastic Agent' }
        ),
        key: SETUP_METHOD_ELASTIC_AGENT,
        checked: selectedMethods.includes(SETUP_METHOD_ELASTIC_AGENT) ? 'on' : undefined,
        'data-test-subj': 'browseIntegrations.searchBar.setupMethodElasticAgentOption',
      },
    ],
    [selectedMethods]
  );

  const activeCount = selectedMethods.length;

  const onSelectionChange = useCallback(
    (newOptions: EuiSelectableOption[]) => {
      const newMethods: SetupMethodFilterType[] = [];
      newOptions.forEach((option) => {
        if (option.checked === 'on' && option.key) {
          newMethods.push(option.key as SetupMethodFilterType);
        }
      });
      onChange(newMethods);
    },
    [onChange]
  );

  return (
    <EuiPopover
      id="browseIntegrationsSetupMethodPopover"
      aria-label={i18n.translate(
        'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.setupMethodPopoverAriaLabel',
        { defaultMessage: 'Setup method options' }
      )}
      isOpen={isOpen}
      closePopover={closePopover}
      panelPaddingSize="s"
      button={
        <EuiFilterButton
          data-test-subj="browseIntegrations.searchBar.setupMethodBtn"
          iconType="arrowDown"
          onClick={togglePopover}
          isSelected={isOpen}
          numFilters={activeCount}
          hasActiveFilters={activeCount > 0}
          numActiveFilters={activeCount}
        >
          <FormattedMessage
            id="xpack.fleet.epm.browseIntegrations.searchAndFilterBar.setupMethodLabel"
            defaultMessage="Setup method"
          />
        </EuiFilterButton>
      }
    >
      <EuiSelectable
        data-test-subj="browseIntegrations.searchBar.setupMethodSelectableList"
        searchable={false}
        options={options}
        onChange={onSelectionChange}
        listProps={{
          showIcons: true,
          style: { minWidth: 250 },
        }}
      >
        {(list) => list}
      </EuiSelectable>
    </EuiPopover>
  );
};

const SignalFilter: React.FC<{
  selectedSignals?: SignalFilterType[];
  onChange: (signals: SignalFilterType[]) => void;
}> = ({ selectedSignals = [], onChange }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const togglePopover = useCallback(() => setIsOpen((prevIsOpen) => !prevIsOpen), []);
  const closePopover = useCallback(() => setIsOpen(false), []);

  const options: EuiSelectableOption[] = useMemo(
    () => [
      {
        label: i18n.translate(
          'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.signalLogsOption',
          { defaultMessage: 'Logs' }
        ),
        key: dataTypes.Logs,
        checked: selectedSignals.includes(dataTypes.Logs) ? 'on' : undefined,
        'data-test-subj': 'browseIntegrations.searchBar.signalLogsOption',
      },
      {
        label: i18n.translate(
          'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.signalMetricsOption',
          { defaultMessage: 'Metrics' }
        ),
        key: dataTypes.Metrics,
        checked: selectedSignals.includes(dataTypes.Metrics) ? 'on' : undefined,
        'data-test-subj': 'browseIntegrations.searchBar.signalMetricsOption',
      },
      {
        label: i18n.translate(
          'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.signalTracesOption',
          { defaultMessage: 'Traces' }
        ),
        key: dataTypes.Traces,
        checked: selectedSignals.includes(dataTypes.Traces) ? 'on' : undefined,
        'data-test-subj': 'browseIntegrations.searchBar.signalTracesOption',
      },
    ],
    [selectedSignals]
  );

  const activeCount = selectedSignals.length;

  const onSelectionChange = useCallback(
    (newOptions: EuiSelectableOption[]) => {
      const newSignals: SignalFilterType[] = [];
      newOptions.forEach((option) => {
        if (option.checked === 'on' && option.key) {
          newSignals.push(option.key as SignalFilterType);
        }
      });
      onChange(newSignals);
    },
    [onChange]
  );

  return (
    <EuiPopover
      id="browseIntegrationsSignalPopover"
      aria-label={i18n.translate(
        'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.signalPopoverAriaLabel',
        { defaultMessage: 'Signal type options' }
      )}
      isOpen={isOpen}
      closePopover={closePopover}
      panelPaddingSize="s"
      button={
        <EuiFilterButton
          data-test-subj="browseIntegrations.searchBar.signalBtn"
          iconType="arrowDown"
          onClick={togglePopover}
          isSelected={isOpen}
          numFilters={activeCount}
          hasActiveFilters={activeCount > 0}
          numActiveFilters={activeCount}
        >
          <FormattedMessage
            id="xpack.fleet.epm.browseIntegrations.searchAndFilterBar.allSignalsLabel"
            defaultMessage="All signals"
          />
        </EuiFilterButton>
      }
    >
      <EuiSelectable
        data-test-subj="browseIntegrations.searchBar.signalSelectableList"
        searchable={false}
        options={options}
        onChange={onSelectionChange}
        listProps={{
          showIcons: true,
          style: { minWidth: 250 },
        }}
      >
        {(list) => list}
      </EuiSelectable>
    </EuiPopover>
  );
};

const ContentFilter: React.FC<{
  selected?: boolean;
  onChange: (show: boolean) => void;
}> = ({ selected = false, onChange }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const togglePopover = useCallback(() => setIsOpen((prevIsOpen) => !prevIsOpen), []);
  const closePopover = useCallback(() => setIsOpen(false), []);

  const options: EuiSelectableOption[] = useMemo(
    () => [
      {
        label: i18n.translate(
          'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.contentShowContentPacksOption',
          { defaultMessage: 'Show content packs' }
        ),
        key: 'show',
        checked: selected ? 'on' : undefined,
        'data-test-subj': 'browseIntegrations.searchBar.contentShowContentPacksOption',
      },
    ],
    [selected]
  );

  const activeCount = selected ? 1 : 0;

  const onSelectionChange = useCallback(
    (newOptions: EuiSelectableOption[]) => {
      const isSelected = newOptions.some(
        (option) => option.key === 'show' && option.checked === 'on'
      );
      onChange(isSelected);
      closePopover();
    },
    [onChange, closePopover]
  );

  return (
    <EuiPopover
      id="browseIntegrationsContentPopover"
      aria-label={i18n.translate(
        'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.contentPopoverAriaLabel',
        { defaultMessage: 'Content options' }
      )}
      isOpen={isOpen}
      closePopover={closePopover}
      panelPaddingSize="s"
      button={
        <EuiFilterButton
          data-test-subj="browseIntegrations.searchBar.contentBtn"
          iconType="arrowDown"
          onClick={togglePopover}
          isSelected={isOpen}
          numFilters={activeCount}
          hasActiveFilters={selected}
          numActiveFilters={activeCount}
        >
          <FormattedMessage
            id="xpack.fleet.epm.browseIntegrations.searchAndFilterBar.contentLabel"
            defaultMessage="Content"
          />
        </EuiFilterButton>
      }
    >
      <EuiSelectable
        data-test-subj="browseIntegrations.searchBar.contentSelectableList"
        searchable={false}
        options={options}
        onChange={onSelectionChange}
        listProps={{
          showIcons: true,
          style: { minWidth: 250 },
        }}
      >
        {(list) => list}
      </EuiSelectable>
    </EuiPopover>
  );
};

interface SearchBarProps {
  categories?: CategoryFacet[];
  availableSubCategories?: CategoryFacet[];
}

const SearchBar: React.FC<SearchBarProps> = ({ categories, availableSubCategories }) => {
  const urlFilters = useUrlFilters();
  const addUrlFilters = useAddUrlFilters();
  const { category: selectedCategory, subCategory: selectedSubCategory } = useUrlCategories();
  const urlDefaultCategories = useUrlDefaultCategories();
  const setUrlCategory = useSetUrlCategory();
  const styles = useMemoCss(searchBarStyles);

  const [searchTerms, setSearchTerms] = useState(urlFilters.q);

  useDebounce(
    () => {
      addUrlFilters(
        {
          q: searchTerms,
        },
        { replace: true }
      );
    },
    SEARCH_DEBOUNCE_MS,
    [searchTerms]
  );

  const selectedCategoryTitle = selectedCategory
    ? categories?.find((category) => category.id === selectedCategory)?.title
    : undefined;

  const categoryBadgeLabel = useMemo(() => {
    if (selectedCategory) {
      const selectedSubCategoryTitle =
        selectedSubCategory && availableSubCategories
          ? availableSubCategories.find((subCat) => subCat.id === selectedSubCategory)?.title
          : undefined;

      if (selectedCategoryTitle && selectedSubCategoryTitle) {
        return `${selectedCategoryTitle}, ${selectedSubCategoryTitle}`;
      }
      return selectedCategoryTitle ?? '';
    }

    // Multi-default categories from URL search params
    const defaultTitles = urlDefaultCategories
      .map((catId) => categories?.find((c) => c.id === catId)?.title)
      .filter(Boolean) as string[];
    return defaultTitles.join(', ');
  }, [
    availableSubCategories,
    categories,
    selectedCategory,
    selectedCategoryTitle,
    selectedSubCategory,
    urlDefaultCategories,
  ]);

  const handleCategoryBadgeDismiss = useCallback(() => {
    if (selectedSubCategory) {
      setUrlCategory({ category: selectedCategory });
    } else {
      setUrlCategory({ category: '' });
    }
  }, [selectedCategory, selectedSubCategory, setUrlCategory]);

  return (
    <EuiFieldSearch
      compressed
      placeholder={i18n.translate(
        'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.searchPlaceholder',
        {
          defaultMessage: 'Search integrations',
        }
      )}
      value={searchTerms}
      data-test-subj="epmList.searchBar"
      onChange={(e) => setSearchTerms(e.target.value)}
      fullWidth
      prepend={
        categoryBadgeLabel ? (
          <EuiFormPrepend
            label={
              <>
                <EuiScreenReaderOnly>
                  <span>
                    {i18n.translate(
                      'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.categoryBadgeScreenReader',
                      { defaultMessage: 'Searching category: ' }
                    )}
                  </span>
                </EuiScreenReaderOnly>
                {categoryBadgeLabel}
              </>
            }
            data-test-subj="epmList.categoryBadge"
          >
            <button
              css={styles.clearButton}
              onClick={handleCategoryBadgeDismiss}
              aria-label={i18n.translate(
                'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.removeCategoryFilter',
                { defaultMessage: 'Remove filter' }
              )}
              data-test-subj="epmList.categoryBadge.closeBtn"
            >
              <EuiIcon type="cross" color="text" size="s" aria-hidden={true} />
            </button>
          </EuiFormPrepend>
        ) : undefined
      }
    />
  );
};

const searchBarStyles = {
  clearButton: ({ euiTheme }: UseEuiTheme) =>
    css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      blockSize: euiTheme.size.m,
      inlineSize: euiTheme.size.m,
      padding: euiTheme.size.s,
      borderRadius: mathWithUnits(euiTheme.border.radius.small, (x) => x / 2),
      backgroundColor: euiTheme.colors.backgroundLightText,
    }),
};

const MAX_VISIBLE_SUBCATEGORIES = 6;

interface SearchAndFiltersBarProps {
  categories?: CategoryFacet[];
  availableSubCategories?: CategoryFacet[];
}

export const SearchAndFiltersBar: React.FC<SearchAndFiltersBarProps> = ({
  categories,
  availableSubCategories,
}) => {
  const { euiTheme } = useEuiTheme();
  const urlFilters = useUrlFilters();
  const addUrlFilters = useAddUrlFilters();
  const { category: selectedCategory, subCategory: selectedSubCategory } = useUrlCategories();
  const setUrlCategory = useSetUrlCategory();

  const [isSubCategoryPopoverOpen, setIsSubCategoryPopoverOpen] = useState(false);

  const handleStatusChange = useCallback(
    (statuses: IntegrationStatusFilterType[]) => {
      addUrlFilters({ status: statuses.length > 0 ? statuses : undefined });
    },
    [addUrlFilters]
  );

  const handleSetupMethodChange = useCallback(
    (methods: SetupMethodFilterType[]) => {
      addUrlFilters({ setupMethod: methods.length > 0 ? methods : undefined });
    },
    [addUrlFilters]
  );

  const handleSignalChange = useCallback(
    (signals: SignalFilterType[]) => {
      addUrlFilters({ signal: signals.length > 0 ? signals : undefined });
    },
    [addUrlFilters]
  );

  const handleContentChange = useCallback(
    (show: boolean) => {
      addUrlFilters({ showContent: show ? true : undefined });
    },
    [addUrlFilters]
  );

  const handleSubCategoryClick = useCallback(
    (subCategoryId: string) => {
      const parentId =
        availableSubCategories?.find((c) => c.id === subCategoryId)?.parent_id ?? selectedCategory;
      setUrlCategory({ category: parentId, subCategory: subCategoryId });
    },
    [availableSubCategories, selectedCategory, setUrlCategory]
  );

  const visibleSubCategories = useMemo(
    () => availableSubCategories?.slice(0, MAX_VISIBLE_SUBCATEGORIES),
    [availableSubCategories]
  );

  const hiddenSubCategoriesItems = useMemo(() => {
    return availableSubCategories?.slice(MAX_VISIBLE_SUBCATEGORIES).map((subCategory) => (
      <EuiContextMenuItem
        key={subCategory.id}
        onClick={() => {
          handleSubCategoryClick(subCategory.id);
          setIsSubCategoryPopoverOpen(false);
        }}
        icon={selectedSubCategory === subCategory.id ? 'check' : 'empty'}
      >
        {subCategory.title}
      </EuiContextMenuItem>
    ));
  }, [availableSubCategories, handleSubCategoryClick, selectedSubCategory]);

  return (
    <StickyFlexItem>
      <EuiFlexGroup gutterSize="s" alignItems="center" wrap>
        <EuiFlexItem grow={true}>
          <SearchBar categories={categories} availableSubCategories={availableSubCategories} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFilterGroup compressed>
            <SetupMethodFilter
              selectedMethods={urlFilters.setupMethod}
              onChange={handleSetupMethodChange}
            />
            <SignalFilter selectedSignals={urlFilters.signal} onChange={handleSignalChange} />

            <StatusFilter
              selectedStatuses={urlFilters.status}
              onChange={handleStatusChange}
              testSubjPrefix="browseIntegrations.searchBar"
              popoverId="browseIntegrationsStatusPopover"
            />
            <ContentFilter selected={urlFilters.showContent} onChange={handleContentChange} />
          </EuiFilterGroup>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <SortFilter />
        </EuiFlexItem>
      </EuiFlexGroup>

      {visibleSubCategories && visibleSubCategories.length > 0 && (
        <>
          <EuiSpacer size="m" />
          <EuiFlexGroup
            data-test-subj="browseIntegrations.subcategoriesRow"
            justifyContent="flexStart"
            direction="row"
            gutterSize="s"
            wrap
          >
            {visibleSubCategories.map((subCategory) => {
              const isSelected = subCategory.id === selectedSubCategory;
              return (
                <EuiFlexItem grow={false} key={subCategory.id}>
                  <EuiButton
                    css={
                      isSelected
                        ? css`
                            color: ${euiTheme.colors.textInverse};
                          `
                        : undefined
                    }
                    color={isSelected ? 'accent' : 'text'}
                    fill={isSelected}
                    aria-label={subCategory.title}
                    onClick={() => handleSubCategoryClick(subCategory.id)}
                    size="s"
                  >
                    {subCategory.title}
                  </EuiButton>
                </EuiFlexItem>
              );
            })}
            {hiddenSubCategoriesItems && hiddenSubCategoriesItems.length > 0 && (
              <EuiFlexItem grow={false}>
                <EuiPopover
                  data-test-subj="browseIntegrations.showMoreSubCategoriesButton"
                  id="browseIntegrationsMoreSubCategories"
                  aria-label={i18n.translate(
                    'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.moreSubCategoriesPopoverAriaLabel',
                    { defaultMessage: 'More subcategories' }
                  )}
                  button={
                    <EuiToolTip
                      content={i18n.translate(
                        'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.showMoreSubCategories',
                        { defaultMessage: 'Show more subcategories' }
                      )}
                      disableScreenReaderOutput
                    >
                      <EuiButtonIcon
                        display="base"
                        onClick={() => setIsSubCategoryPopoverOpen((prev) => !prev)}
                        iconType="boxesHorizontal"
                        aria-label={i18n.translate(
                          'xpack.fleet.epm.browseIntegrations.searchAndFilterBar.showMoreSubCategories',
                          { defaultMessage: 'Show more subcategories' }
                        )}
                        size="s"
                      />
                    </EuiToolTip>
                  }
                  isOpen={isSubCategoryPopoverOpen}
                  closePopover={() => setIsSubCategoryPopoverOpen(false)}
                  panelPaddingSize="none"
                  anchorPosition="downLeft"
                >
                  <EuiContextMenuPanel items={hiddenSubCategoriesItems} />
                </EuiPopover>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </>
      )}

      <EuiSpacer size="m" />
    </StickyFlexItem>
  );
};
