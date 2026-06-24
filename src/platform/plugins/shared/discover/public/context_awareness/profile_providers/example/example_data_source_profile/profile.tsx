/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiBadge, EuiFlyout } from '@elastic/eui';
import type { DataViewField } from '@kbn/data-views-plugin/common';
import type { RowControlColumn } from '@kbn/discover-utils';
import { AppMenuActionId, getFieldValue } from '@kbn/discover-utils';
import { capitalize } from 'lodash';
import React from 'react';
import type { DataSourceProfileProvider } from '../../../profiles';
import { DataSourceCategory } from '../../../profiles';
import { extractIndexPatternFrom } from '../../extract_index_pattern_from';
import { ChartWithCustomButtons, CustomDocViewerFooter, CustomDocViewerHeader } from './components';
import { CustomDocView } from './components/custom_doc_view';
import { RestorableStateDocView } from './components/restorable_state_doc_view';

export const createExampleDataSourceProfileProvider = (): DataSourceProfileProvider<{
  formatRecord: (flattenedRecord: Record<string, unknown>) => string;
}> => ({
  profileId: 'example-data-source-profile',
  isExperimental: true,
  profile: {
    getCellRenderers: (prev) => (params) => ({
      ...prev(params),
      'log.level': (props) => {
        const level = getFieldValue(props.row, 'log.level') as string;

        if (!level) {
          return (
            <span
              css={({ euiTheme }) => ({
                color: euiTheme.colors.textSubdued,
              })}
              data-test-subj="exampleDataSourceProfileLogLevelEmpty"
            >
              (None)
            </span>
          );
        }

        const levelMap: Record<string, string> = {
          info: 'primary',
          debug: 'default',
          error: 'danger',
        };

        return (
          <EuiBadge
            color={levelMap[level]}
            title={level}
            data-test-subj="exampleDataSourceProfileLogLevel"
          >
            {capitalize(level)}
          </EuiBadge>
        );
      },
    }),
    getDocViewer:
      (prev, { context, toolkit }) =>
      (params) => {
        const { openInNewTab, updateESQLQuery } = toolkit.actions;
        const recordId = params.record.id;
        const prevValue = prev(params);

        return {
          title: `Record #${recordId}`,
          docViewsRegistry: (registry) => {
            registry.add({
              id: 'doc_view_example',
              title: 'Example',
              order: 0,
              render: () => (
                <CustomDocView
                  formattedRecord={context.formatRecord(params.record.flattened)}
                  openInNewTab={openInNewTab}
                  updateESQLQuery={updateESQLQuery}
                />
              ),
            });

            registry.add({
              id: 'doc_view_restorable_state_example',
              title: 'Restorable State Example',
              order: 1,
              render: (props) => <RestorableStateDocView {...props} />,
            });

            return prevValue.docViewsRegistry(registry);
          },
          renderHeader: (props) => <CustomDocViewerHeader {...props} />,
          renderFooter: (props) => <CustomDocViewerFooter {...props} />,
        };
      },
    /**
     * The `getAppMenu` extension point gives access to AppMenuRegistry with methods like `registerCustomItem` and
     * `registerPopoverItem`.
     * The extension also provides the essential params like current dataView, adHocDataViews etc when defining a custom action implementation.
     * And it supports opening custom flyouts and any other modals on the click.
     * `getAppMenu` can be configured in both root and data source profiles.
     * @param prev
     */
    getAppMenu: (prev) => (params) => {
      const prevValue = prev(params);

      // This is what is available via params:
      // const { dataView, services, isEsqlMode, adHocDataViews, actions } = params;

      return {
        appMenuRegistry: (registry) => {
          // Note: Only 2 custom actions are allowed to be rendered in the app menu. The rest will be ignored.

          // Can be a on-click action, link or a submenu with an array of actions and horizontal rules
          registry.registerCustomItem({
            id: 'example-custom-action',
            order: 1,
            label: 'Custom action',
            testId: 'example-custom-action',
            iconType: 'logoElasticsearch',
            run: ({ context: { onFinishAction } }) => {
              alert('Example Custom action clicked');
              onFinishAction(); // This allows to return focus back to the app menu DOM node
            },

            // In case of a submenu, you can add actions to it under `actions`
            // actions: [
            //   {
            //     id: 'example-custom-action-1-1',
            //     type: AppMenuActionType.custom,
            //     controlProps: {
            //       label: 'Custom action',
            //       onClick: ({ onFinishAction }) => {
            //         alert('Example Custom action clicked');
            //         onFinishAction();
            //       },
            //     },
            //   },
            //   {
            //     id: 'example-custom-action-1-2',
            //     type: AppMenuActionType.submenuHorizontalRule
            //   },
            //   ...
            // ],
          });

          // This example shows how to add a custom action under the Alerts submenu
          registry.registerPopoverItem(AppMenuActionId.alerts, {
            // It's also possible to override the submenu actions by using the same id
            // as `AppMenuActionId.createRule` or `AppMenuActionId.manageRulesAndConnectors`
            id: 'example-custom-action4',
            order: 101,
            label: 'Create SLO (Custom action)',
            iconType: 'chartGauge',
            testId: 'example-custom-action-under-alerts',
            render: ({ context: { onFinishAction } }) => {
              // This is an example of a custom action that opens a flyout or any other custom modal.
              // To do so, simply return a React element and call onFinishAction when you're done.
              return (
                <EuiFlyout aria-label="Example custom action flyout" onClose={onFinishAction}>
                  <div>Example custom action clicked</div>
                </EuiFlyout>
              );
            },
          });

          // This submenu was defined in the root profile example_root_pofile/profile.tsx
          // And we can still add actions to it from the data source profile here.
          registry.registerPopoverItem('example-custom-root-submenu', {
            id: 'example-custom-action5',
            order: 1,
            label: 'Custom action (from Data Source profile)',
            run: ({ context: { onFinishAction } }) => {
              alert('Example Data source action under root submenu clicked');
              onFinishAction();
            },
          });

          return prevValue.appMenuRegistry(registry);
        },
      };
    },
    getRowAdditionalLeadingControls: (prev) => (params) => {
      const additionalControls = prev(params) || [];

      return [
        ...additionalControls,
        ...['chartBarVerticalStack', 'heart', 'inspect'].map(
          (iconType): RowControlColumn => ({
            id: `exampleControl_${iconType}`,
            render: (Control, rowProps) => {
              return (
                <Control
                  data-test-subj={`exampleLogsControl_${iconType}`}
                  label={`Example ${iconType}`}
                  tooltipContent={`Example ${iconType}`}
                  iconType={iconType}
                  onClick={() => {
                    alert(`Example "${iconType}" control clicked. Row index: ${rowProps.rowIndex}`);
                  }}
                />
              );
            },
          })
        ),
      ];
    },
    getDefaultAppState: () => () => ({
      breakdownField: 'log.level',
      columns: [
        {
          name: '@timestamp',
          width: 212,
        },
        {
          name: 'log.level',
          width: 150,
        },
        {
          name: 'message',
        },
      ],
      rowHeight: 5,
    }),
    getAdditionalCellActions: (prev) => () =>
      [
        ...prev(),
        {
          id: 'example-data-source-action',
          getDisplayName: () => 'Example data source action',
          getIconType: () => 'plus',
          execute: () => {
            alert('Example data source action executed');
          },
        },
        {
          id: 'another-example-data-source-action',
          getDisplayName: () => 'Another example data source action',
          getIconType: () => 'minus',
          execute: () => {
            alert('Another example data source action executed');
          },
          isCompatible: ({ field }) => field.name !== 'message',
        },
      ],
    getPaginationConfig: (prev) => () => ({
      ...prev(),
      paginationMode: 'singlePage',
    }),
    /**
     * The `getRecommendedFields` extension point allows profiles to define fields that should be surfaced
     * as recommended in the field list sidebar. These fields appear in a dedicated "Recommended Fields" section.
     * This is useful for highlighting important fields for specific data source types.
     * @param prev
     */
    getRecommendedFields: (prev) => () => {
      // Define example recommended field names for the example logs data source
      const exampleRecommendedFieldNames: Array<DataViewField['name']> = [
        'log.level',
        'message',
        'service.name',
        'host.name',
      ];

      return {
        ...prev(),
        recommendedFields: exampleRecommendedFieldNames,
      };
    },
    getChartSectionConfiguration:
      (prev, { toolkit }) =>
      () => {
        return {
          ...prev(),
          renderChartSection: (props) => (
            <ChartWithCustomButtons {...props} actions={toolkit.actions} />
          ),
          localStorageKeyPrefix: 'discover:exampleDataSource',
          replaceDefaultChart: true,
        };
      },
  },
  resolve: (params) => {
    const indexPattern = extractIndexPatternFrom(params);

    if (indexPattern !== 'my-example-logs' && indexPattern !== 'my-example-logs,logstash*') {
      return { isMatch: false };
    }

    return {
      isMatch: true,
      context: {
        category: DataSourceCategory.Logs,
        formatRecord: (record) => JSON.stringify(record, null, 2),
      },
    };
  },
});
