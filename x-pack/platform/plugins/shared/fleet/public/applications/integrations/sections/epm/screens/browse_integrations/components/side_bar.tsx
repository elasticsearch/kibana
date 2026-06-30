/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFacetButton,
  EuiFacetGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiLink,
  EuiNotificationBadge,
  EuiSpacer,
  useEuiTheme,
} from '@elastic/eui';
import type { IntegrationCategory } from '@kbn/custom-integrations-plugin/common';
import React from 'react';

import { i18n } from '@kbn/i18n';
import styled from '@emotion/styled';

import { Loading } from '../../../../../../../components';

export interface CategoryFacet {
  count: number;
  id: string;
  title: string;
  parent_id?: string;
  parent_title?: string;
}

export const UPDATES_AVAILABLE = 'updates_available';
export const INSTALL_FAILED = 'install_failed';
export const UPDATE_FAILED = 'update_failed';

export type ExtendedIntegrationCategory = IntegrationCategory | typeof UPDATES_AVAILABLE | '';

export const ALL_CATEGORY = {
  id: '',
  title: i18n.translate('xpack.fleet.epmList.allPackagesFilterLinkText', {
    defaultMessage: 'All categories',
  }),
};

export const ALL_INSTALLED_CATEGORY = {
  id: '',
  title: i18n.translate('xpack.fleet.epmList.allPackagesInstalledFilterLinkText', {
    defaultMessage: 'All installed',
  }),
};

export const UPDATES_AVAILABLE_CATEGORY = {
  id: UPDATES_AVAILABLE,
  title: i18n.translate('xpack.fleet.epmList.updatesAvailableFilterLinkText', {
    defaultMessage: 'Updates available',
  }),
};

export const INSTALL_FAILED_CATEGORY = {
  id: INSTALL_FAILED,
  title: i18n.translate('xpack.fleet.epmList.installFailedFilterLinkText', {
    defaultMessage: 'Install failed',
  }),
};

export const UPDATE_FAILED_CATEGORY = {
  id: UPDATE_FAILED,
  title: i18n.translate('xpack.fleet.epmList.updateFailedFilterLinkText', {
    defaultMessage: 'Update failed',
  }),
};

export interface Props {
  isLoading?: boolean;
  categories: CategoryFacet[];
  selectedCategories: string[];
  onCategoryChange: (category: CategoryFacet) => void;
}

const StickySidebar = styled(EuiFlexItem)`
  @media screen and (min-width: ${(props) => props.theme.euiTheme.breakpoint.m}px) {
    position: sticky;
    top: var(--kbn-application--sticky-headers-offset, var(--kbn-layout--header-height, '0px'));
    max-height: calc(
      100vh - var(--kbn-application--sticky-headers-offset, var(--kbn-layout--header-height, '0px'))
    );
    overflow: scroll;
  }
  padding-top: ${(props) => props.theme.euiTheme.size.m};
  padding-right: ${(props) => props.theme.euiTheme.size.m};
`;

export interface SidebarProps extends Props {
  CreateIntegrationCardButton?: React.ComponentType;
  hasCreatedIntegrations?: boolean;
  createdIntegrationsCount?: number;
  isLoadingCreatedIntegrations?: boolean;
  manageIntegrationsHref?: string;
  onManageIntegrationsClick?: (ev: React.MouseEvent<HTMLAnchorElement>) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isLoading,
  categories,
  selectedCategories,
  onCategoryChange,
  CreateIntegrationCardButton,
  hasCreatedIntegrations,
  createdIntegrationsCount,
  isLoadingCreatedIntegrations,
  manageIntegrationsHref,
  onManageIntegrationsClick,
}) => {
  const { euiTheme } = useEuiTheme();

  return (
    <StickySidebar>
      {CreateIntegrationCardButton && !isLoadingCreatedIntegrations && (
        <>
          {hasCreatedIntegrations ? (
            <EuiLink
              color="text"
              href={manageIntegrationsHref}
              onClick={onManageIntegrationsClick}
              data-test-subj="manageCreatedIntegrationsLink"
              css={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                gap: euiTheme.size.s,
                textDecoration: 'none',
              }}
            >
              <EuiIcon type="gear" aria-hidden={true} />
              <span
                style={{
                  color: euiTheme.colors.text,
                  fontSize: euiTheme.size.m,
                  fontWeight: euiTheme.font.weight.bold,
                  flexGrow: 1,
                }}
              >
                {i18n.translate('xpack.fleet.epmList.manageCreatedIntegrationsLinkLabel', {
                  defaultMessage: 'Manage my integrations',
                })}
              </span>
              {createdIntegrationsCount ? (
                <EuiNotificationBadge
                  size="m"
                  color="accent"
                  className="euiFacetButton__quantity"
                  data-test-subj="manageCreatedIntegrationsCount"
                >
                  {createdIntegrationsCount}
                </EuiNotificationBadge>
              ) : null}
            </EuiLink>
          ) : (
            <CreateIntegrationCardButton />
          )}
          <EuiHorizontalRule margin="m" />
        </>
      )}
      <CategoryFacets
        isLoading={isLoading}
        categories={categories}
        selectedCategories={selectedCategories}
        onCategoryChange={onCategoryChange}
      />
    </StickySidebar>
  );
};

export function CategoryFacets({
  isLoading,
  categories,
  selectedCategories,
  onCategoryChange,
}: Props) {
  const controls = (
    <EuiFacetGroup gutterSize="s">
      {isLoading ? (
        <>
          <EuiSpacer size="m" />
          <Loading size="l" />
          <EuiSpacer size="m" />
        </>
      ) : (
        categories.map((category) => {
          return (
            <EuiFacetButton
              data-test-subj={`epmList.categories.${category.id}`}
              isSelected={
                selectedCategories.length === 0
                  ? category.id === ''
                  : selectedCategories.includes(category.id)
              }
              key={category.id}
              id={category.id}
              style={{
                padding: 0,
              }}
              quantity={category.count}
              onClick={() => onCategoryChange(category)}
              aria-label={i18n.translate('xpack.fleet.epmList.facetButton.ariaLabel', {
                defaultMessage:
                  '{key}, {count} {count, plural, one { integration } other { integrations }}',
                values: {
                  key: category.title,
                  count: category.count,
                },
              })}
            >
              {category.title}
            </EuiFacetButton>
          );
        })
      )}
    </EuiFacetGroup>
  );

  return controls;
}
