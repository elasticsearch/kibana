/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode, FunctionComponent } from 'react';
import { useMemo } from 'react';
import React, { useCallback, useState } from 'react';
import styled from 'styled-components';

import {
  EuiButton,
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiSpacer,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';

import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

import { useLocalSearch, searchIdField } from '../../../../hooks';

import type { IntegrationCardItem } from '../../screens/home';

import type {
  ExtendedIntegrationCategory,
  CategoryFacet,
} from '../../screens/home/category_facets';

import type { IntegrationsURLParameters } from '../../screens/home/hooks/use_available_packages';

import { promoteFeaturedIntegrations } from '../utils';

import { ControlsColumn } from './controls';
import { GridColumn } from './grid';
import { MissingIntegrationContent } from './missing_integrations';
import { SearchBox } from './search_box';

const StickySidebar = styled(EuiFlexItem)`
  @media (min-width: ${(props) => props.theme.eui.euiBreakpoints.m}) {
    position: sticky;
    top: calc(
      var(--kbn-application--sticky-headers-offset, 96px) +
        ${(props) => props.theme.eui.euiSizeL /* 24px */}
    );
  }
`;

export interface PackageListGridProps {
  isLoading?: boolean;
  controls?: ReactNode | ReactNode[];
  emptyStateStyles?: Record<string, string>;
  list: IntegrationCardItem[];
  searchTerm: string;
  setSearchTerm: (search: string) => void;
  selectedCategory: ExtendedIntegrationCategory;
  setCategory: (category: ExtendedIntegrationCategory) => void;
  categories: CategoryFacet[];
  setUrlandReplaceHistory: (params: IntegrationsURLParameters) => void;
  setUrlandPushHistory: (params: IntegrationsURLParameters) => void;
  callout?: JSX.Element | null;
  // Props to decide the size of the spacer above callout. Security Solution uses this prop to customize the size of the spacer
  calloutTopSpacerSize?: 's' | 'm' | 'xs' | 'l' | 'xl' | 'xxl';
  // Props used only in AvailablePackages component:
  showCardLabels?: boolean;
  title?: string;
  availableSubCategories?: CategoryFacet[];
  selectedSubCategory?: string;
  setSelectedSubCategory?: (c: string | undefined) => void;
  showMissingIntegrationMessage?: boolean;
  showControls?: boolean;
  showSearchTools?: boolean;
  // Customizing whether to sort by the default featured integrations' categories. Security Solution has custom sorting logic
  sortByFeaturedIntegrations?: boolean;
  spacer?: boolean;
  // Security Solution sends the id to determine which element to scroll when the user interacting with the package list
  scrollElementId?: string;
  onlyAgentlessFilter?: boolean;
  backgroundColor?: 'plain' | 'transparent';
}

export const PackageListGrid: FunctionComponent<PackageListGridProps> = ({
  isLoading,
  controls,
  emptyStateStyles,
  title,
  list,
  searchTerm,
  setSearchTerm,
  selectedCategory,
  setCategory,
  categories,
  availableSubCategories,
  setSelectedSubCategory,
  selectedSubCategory,
  setUrlandReplaceHistory,
  setUrlandPushHistory,
  showMissingIntegrationMessage = false,
  onlyAgentlessFilter = false,
  sortByFeaturedIntegrations = true,
  callout,
  calloutTopSpacerSize = 'l', // Default EUI spacer size
  showCardLabels = true,
  showControls = true,
  showSearchTools = true,
  spacer = true,
  scrollElementId,
  backgroundColor,
}) => {
  const euiTheme = useEuiTheme();
  const localSearch = useLocalSearch(list, !!isLoading);

  const [isPopoverOpen, setPopover] = useState(false);

  const MAX_SUBCATEGORIES_NUMBER = 6;

  const onButtonClick = () => {
    setPopover(!isPopoverOpen);
  };

  const closePopover = () => {
    setPopover(false);
  };

  const resetQuery = () => {
    setSearchTerm('');
    setUrlandReplaceHistory({
      searchString: '',
      categoryId: '',
      subCategoryId: '',
      onlyAgentless: onlyAgentlessFilter,
    });
  };

  const onSubCategoryClick = useCallback(
    (subCategory: string) => {
      if (setSelectedSubCategory) setSelectedSubCategory(subCategory);
      setUrlandPushHistory({
        categoryId: selectedCategory,
        subCategoryId: subCategory,
        onlyAgentless: onlyAgentlessFilter,
      });
    },
    [selectedCategory, setSelectedSubCategory, setUrlandPushHistory, onlyAgentlessFilter]
  );

  const filteredPromotedList: IntegrationCardItem[] = useMemo(() => {
    if (isLoading) return [];

    const searchResults =
      (localSearch?.search(searchTerm) as IntegrationCardItem[]).map(
        (match) => match[searchIdField]
      ) ?? [];

    const filteredList = searchTerm
      ? list.filter((item) => searchResults.includes(item[searchIdField]) ?? [])
      : list;

    return sortByFeaturedIntegrations
      ? promoteFeaturedIntegrations(filteredList, selectedCategory)
      : filteredList;
  }, [isLoading, list, localSearch, searchTerm, selectedCategory, sortByFeaturedIntegrations]);
  const splitSubcategories = (
    subcategories: CategoryFacet[] | undefined
  ): { visibleSubCategories?: CategoryFacet[]; hiddenSubCategories?: CategoryFacet[] } => {
    if (!subcategories) return {};
    else if (subcategories && subcategories?.length < MAX_SUBCATEGORIES_NUMBER) {
      return { visibleSubCategories: subcategories, hiddenSubCategories: [] };
    } else if (subcategories && subcategories?.length >= MAX_SUBCATEGORIES_NUMBER) {
      return {
        visibleSubCategories: subcategories.slice(0, MAX_SUBCATEGORIES_NUMBER),
        hiddenSubCategories: subcategories.slice(MAX_SUBCATEGORIES_NUMBER),
      };
    }
    return {};
  };

  const splitSubcat = splitSubcategories(availableSubCategories);
  const { visibleSubCategories } = splitSubcat;
  const hiddenSubCategoriesItems = useMemo(() => {
    return splitSubcat?.hiddenSubCategories?.map((subCategory) => {
      return (
        <EuiContextMenuItem
          key={subCategory.id}
          onClick={() => {
            onSubCategoryClick(subCategory.id);
            closePopover();
          }}
          icon={selectedSubCategory === subCategory.id ? 'check' : 'empty'}
        >
          {subCategory.title}
        </EuiContextMenuItem>
      );
    });
  }, [onSubCategoryClick, selectedSubCategory, splitSubcat?.hiddenSubCategories]);

  return (
    <EuiFlexGroup
      justifyContent="flexEnd"
      alignItems="flexStart"
      gutterSize="xl"
      data-test-subj="epmList.integrationCards"
    >
      {showControls && (
        <StickySidebar data-test-subj="epmList.controlsSideColumn" grow={1}>
          <ControlsColumn controls={controls} title={title} />
        </StickySidebar>
      )}

      <EuiFlexItem
        grow={5}
        data-test-subj="epmList.mainColumn"
        style={{
          position: 'relative',
          backgroundColor:
            backgroundColor === 'transparent'
              ? 'transparent'
              : euiTheme.euiTheme.colors.backgroundBasePlain,
          alignSelf: 'stretch',
        }}
      >
        {showSearchTools && (
          <EuiFlexItem grow={false}>
            <SearchBox
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              selectedCategory={selectedCategory}
              setCategory={setCategory}
              categories={categories}
              availableSubCategories={availableSubCategories}
              setSelectedSubCategory={setSelectedSubCategory}
              selectedSubCategory={selectedSubCategory}
              setUrlandReplaceHistory={setUrlandReplaceHistory}
              onlyAgentlessFilter={onlyAgentlessFilter}
            />
          </EuiFlexItem>
        )}

        {availableSubCategories?.length ? <EuiSpacer size="m" /> : null}

        <EuiFlexItem grow={false}>
          <EuiFlexGroup
            data-test-subj="epmList.subcategoriesRow"
            justifyContent="flexStart"
            direction="row"
            gutterSize="s"
            style={{
              maxWidth: '100%',
              flexWrap: 'wrap',
            }}
          >
            {visibleSubCategories?.map((subCategory) => {
              const isSelected = subCategory.id === selectedSubCategory;
              return (
                <EuiFlexItem grow={false} key={subCategory.id}>
                  <EuiButton
                    css={isSelected ? 'color: white' : ''}
                    color={isSelected ? 'accent' : 'text'}
                    fill={isSelected}
                    aria-label={subCategory?.title}
                    onClick={() => onSubCategoryClick(subCategory.id)}
                    size="s"
                  >
                    <FormattedMessage
                      id="xpack.fleet.epmList.subcategoriesButton"
                      defaultMessage="{subcategory}"
                      values={{
                        subcategory: subCategory.title,
                      }}
                    />
                  </EuiButton>
                </EuiFlexItem>
              );
            })}
            {hiddenSubCategoriesItems?.length ? (
              <EuiFlexItem grow={false}>
                <EuiPopover
                  aria-label={i18n.translate('xpack.fleet.epmList.subcategoriesPopoverAriaLabel', {
                    defaultMessage: 'More subcategories',
                  })}
                  data-test-subj="epmList.showMoreSubCategoriesButton"
                  id="moreSubCategories"
                  button={
                    <EuiToolTip content="Show more subcategories" disableScreenReaderOutput>
                      <EuiButtonIcon
                        display="base"
                        onClick={onButtonClick}
                        iconType="boxesVertical"
                        aria-label="Show more subcategories"
                        size="s"
                      />
                    </EuiToolTip>
                  }
                  isOpen={isPopoverOpen}
                  closePopover={closePopover}
                  panelPaddingSize="none"
                  anchorPosition="downLeft"
                >
                  <EuiContextMenuPanel items={hiddenSubCategoriesItems} />
                </EuiPopover>
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        </EuiFlexItem>
        {callout ? (
          <>
            <EuiSpacer size={calloutTopSpacerSize} />
            {callout}
          </>
        ) : null}
        {spacer && <EuiSpacer size="m" />}
        <EuiFlexItem>
          <GridColumn
            emptyStateStyles={emptyStateStyles}
            isLoading={!!isLoading}
            list={filteredPromotedList}
            showMissingIntegrationMessage={showMissingIntegrationMessage}
            showCardLabels={showCardLabels}
            scrollElementId={scrollElementId}
          />
        </EuiFlexItem>
        {showMissingIntegrationMessage && (
          <>
            <EuiSpacer />
            <MissingIntegrationContent
              setUrlandPushHistory={setUrlandPushHistory}
              resetQuery={resetQuery}
              setSelectedCategory={setCategory}
            />
            <EuiSpacer />
          </>
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
