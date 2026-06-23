/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import React, { useCallback, useEffect, useState } from 'react';
import type { TableListViewTableProps } from '@kbn/content-management-table-list-view-table';
import type { UserContentCommonSchema } from '@kbn/content-management-table-list-view-common';
import type { TableListViewProps } from '@kbn/content-management-table-list-view';

export interface TableListBreadcrumb {
  text: string;
  href: string;
}

export type TableListTabParentProps<T extends UserContentCommonSchema = UserContentCommonSchema> =
  Pick<TableListViewTableProps<T>, 'onFetchSuccess' | 'setPageDataTestSubject'> & {
    getBreadcrumbs?: (appId: string) => TableListBreadcrumb[];
    showCreateButton?: boolean;
  };

export interface TableListTab<T extends UserContentCommonSchema = UserContentCommonSchema> {
  title: string;
  id: string;
  getTableList: (
    propsFromParent: TableListTabParentProps<T>
  ) => Promise<React.ReactNode> | React.ReactNode;
}

type TabbedTableListViewProps = Pick<
  TableListViewProps<UserContentCommonSchema>,
  'description' | 'headingId' | 'children'
> & {
  title?: TableListViewProps<UserContentCommonSchema>['title'];
  tabs: TableListTab[];
  activeTabId: string;
  changeActiveTab: (id: string) => void;
  getBreadcrumbs?: TableListTabParentProps['getBreadcrumbs'];
  showCreateButton?: boolean;
  hideTabs?: boolean;
};

export const TabbedTableListView = ({
  title,
  description,
  headingId,
  children,
  tabs,
  activeTabId,
  changeActiveTab,
  getBreadcrumbs,
  showCreateButton,
  hideTabs,
}: TabbedTableListViewProps) => {
  const [hasInitialFetchReturned, setHasInitialFetchReturned] = useState(false);
  const [pageDataTestSubject, setPageDataTestSubject] = useState<string>();

  const getActiveTab = useCallback(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs]
  );

  const onFetchSuccess = useCallback(() => {
    setHasInitialFetchReturned(true);
  }, []);

  const [tableList, setTableList] = useState<React.ReactNode>(null);

  useEffect(() => {
    async function loadTableList() {
      const newTableList = await getActiveTab().getTableList({
        onFetchSuccess,
        setPageDataTestSubject,
        getBreadcrumbs,
        showCreateButton,
      });
      setTableList(newTableList);
    }

    loadTableList();
  }, [activeTabId, tabs, getActiveTab, onFetchSuccess, getBreadcrumbs, showCreateButton]);

  const hideHeader = !title && !description && hideTabs;

  return (
    <KibanaPageTemplate panelled data-test-subj={pageDataTestSubject}>
      {!hideHeader && (
        <KibanaPageTemplate.Header
          pageTitle={title ? <span id={headingId}>{title}</span> : undefined}
          description={description}
          data-test-subj="top-nav"
          tabs={
            hideTabs
              ? undefined
              : tabs.map((tab) => ({
                  onClick: () => changeActiveTab(tab.id),
                  isSelected: tab.id === getActiveTab().id,
                  label: tab.title,
                }))
          }
        />
      )}
      <KibanaPageTemplate.Section
        aria-labelledby={hasInitialFetchReturned && title ? headingId : undefined}
      >
        {/* Any children passed to the component */}
        {children}

        {tableList}
      </KibanaPageTemplate.Section>
    </KibanaPageTemplate>
  );
};
