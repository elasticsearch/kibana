/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo, useState } from 'react';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiInMemoryTable, EuiPanel, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { FF_ENABLE_ENTITY_STORE_V2, useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { useUiSetting } from '@kbn/kibana-react-plugin/public';
import { convertHighlightedFieldsToTableRow } from '../utils/highlighted_fields_helpers';
import { HighlightedFieldsCell } from './highlighted_fields_cell';
import type { OpenFlyoutLinkRenderer } from './highlighted_fields_cell';
import type { CellActionRenderer } from '../../../shared/components/cell_actions';
import { HIGHLIGHTED_FIELDS_DETAILS_TEST_ID, HIGHLIGHTED_FIELDS_TITLE_TEST_ID } from './test_ids';
import { useHighlightedFields } from '../hooks/use_highlighted_fields';
import { EditHighlightedFieldsButton } from './highlighted_fields_button';
import { useEntityFromStore } from '../../../../flyout/entity_details/shared/hooks/use_entity_from_store';

export interface HighlightedFieldsTableRow {
  /**
   * Highlighted field name (overrideField or if null, falls back to id)
   */
  field: string;
  description: {
    /**
     * Highlighted field name (overrideField or if null, falls back to id)
     */
    field: string;
    /**
     * Highlighted field's original name, when the field is overridden
     */
    originalField?: string;
    /**
     * Highlighted field value
     */
    values: string[] | null | undefined;
    /**
     * Maintain backwards compatibility // TODO remove when possible
     * Only needed if alerts page flyout (which uses CellActions), NOT in EASE alert summary flyout.
     */
    scopeId: string;
    /**
     * The indexName to be passed to the flyout preview panel
     * when clicking on "Source event" id
     */
    ancestorsIndexName?: string;
    entityId?: string;
    entityType?: string;
  };
}

export interface HighlightedFieldsProps {
  /**
   * Document record to extract highlighted fields from
   */
  hit: DataTableRecord;
  /**
   * User defined fields to highlight (defined on the rule)
   */
  investigationFields: string[];
  /**
   * Maintain backwards compatibility // TODO remove when possible
   * Only needed if alerts page flyout (which uses CellActions), NOT in EASE alert summary flyout.
   */
  scopeId?: string;
  /**
   * Render function for cell actions. The caller decides what to inject
   * (real security cell actions in Security Solution, no-op in Discover).
   */
  renderCellActions: CellActionRenderer;
  /**
   * If true, the edit button will be forced to be hidden.
   * False by default — the edit button is shown unless explicitly hidden.
   */
  hideEditButton?: boolean;
  /**
   * The indexName to be passed to the flyout preview panel
   * when clicking on "Source event" id
   */
  ancestorsIndexName?: string;
  /**
   * If true, certain field values render as a PreviewLink opening a preview flyout.
   * False by default — only enable where preview panels exist (old flyout).
   */
  showPreview?: boolean;
  /**
   * Optional wrapper that renders a preview link for supported field types (e.g. IP).
   * Injected by the caller so each flyout context controls its own navigation.
   */
  renderFlyoutLink?: OpenFlyoutLinkRenderer;
}

/**
 * Component that displays the highlighted fields in the right panel under the Investigation section.
 * It is used in both in the alerts page and EASE alert summary page. The latter has no CellActions enabled.
 */
export const HighlightedFields = memo(
  ({
    hit,
    investigationFields,
    scopeId = '',
    renderCellActions,
    hideEditButton = false,
    ancestorsIndexName,
    showPreview = false,
    renderFlyoutLink,
  }: HighlightedFieldsProps) => {
    const [isEditLoading, setIsEditLoading] = useState(false);

    const highlightedFields = useHighlightedFields({
      hit,
      investigationFields,
    });

    const entityStoreV2Enabled = useUiSetting<boolean>(FF_ENABLE_ENTITY_STORE_V2);
    const euidApi = useEntityStoreEuidApi();
    const hostDocumentIdentityFields = useMemo(
      () => euidApi?.euid.getEntityIdentifiersFromDocument('host', hit.flattened) ?? null,
      [euidApi?.euid, hit.flattened]
    );
    const userDocumentIdentityFields = useMemo(
      () => euidApi?.euid.getEntityIdentifiersFromDocument('user', hit.flattened) ?? null,
      [euidApi?.euid, hit.flattened]
    );
    const isHostEntity = hostDocumentIdentityFields != null;
    const hostEuidFromDocument = useMemo(
      () => euidApi?.euid.getEuidFromObject('host', hit.flattened),
      [euidApi?.euid, hit.flattened]
    );
    const userEuidFromDocument = useMemo(
      () => euidApi?.euid.getEuidFromObject('user', hit.flattened),
      [euidApi?.euid, hit.flattened]
    );
    const hostEntityFromStore = useEntityFromStore({
      entityId: hostEuidFromDocument,
      identityFields: hostDocumentIdentityFields ?? undefined,
      entityType: 'host',
      skip: !entityStoreV2Enabled || !isHostEntity,
    });
    const userEntityFromStore = useEntityFromStore({
      entityId: userEuidFromDocument,
      identityFields: userDocumentIdentityFields ?? undefined,
      entityType: 'user',
      skip: !entityStoreV2Enabled || isHostEntity,
    });
    const entityId = useMemo(() => {
      if (entityStoreV2Enabled) {
        if (isHostEntity) {
          return (
            hostEntityFromStore.entityRecord?.entity?.id ??
            hostDocumentIdentityFields?.['entity.id']
          );
        }
        return (
          userEntityFromStore.entityRecord?.entity?.id ?? userDocumentIdentityFields?.['entity.id']
        );
      }
      if (isHostEntity) {
        return hostDocumentIdentityFields?.['entity.id'];
      }
      return userDocumentIdentityFields?.['entity.id'];
    }, [
      entityStoreV2Enabled,
      isHostEntity,
      hostDocumentIdentityFields,
      userDocumentIdentityFields,
      hostEntityFromStore.entityRecord,
      userEntityFromStore.entityRecord,
    ]);

    const items = useMemo(
      () =>
        convertHighlightedFieldsToTableRow(highlightedFields, scopeId, false, ancestorsIndexName),
      [highlightedFields, scopeId, ancestorsIndexName]
    );

    const columns: Array<EuiBasicTableColumn<HighlightedFieldsTableRow>> = useMemo(
      () => [
        {
          field: 'field',
          name: (
            <FormattedMessage
              id="xpack.securitySolution.flyout.document.investigation.highlightedFields.tableFieldColumnLabel"
              defaultMessage="Field"
            />
          ),
          'data-test-subj': 'fieldCell',
          width: '30%',
        },
        {
          field: 'description',
          name: (
            <FormattedMessage
              id="xpack.securitySolution.flyout.document.investigation.highlightedFields.tableValueColumnLabel"
              defaultMessage="Value"
            />
          ),
          'data-test-subj': 'valueCell',
          width: '70%',
          render: (description: {
            field: string;
            originalField?: string;
            values: string[] | null | undefined;
            scopeId: string;
            ancestorsIndexName?: string;
          }) =>
            renderCellActions({
              field: description.field,
              value: description.values,
              scopeId: description.scopeId,
              children: (
                <HighlightedFieldsCell
                  values={description.values}
                  field={description.field}
                  originalField={description.originalField}
                  scopeId={description.scopeId}
                  showPreview={showPreview}
                  ancestorsIndexName={description.ancestorsIndexName}
                  hit={hit}
                  entityId={entityId}
                  renderFlyoutLink={renderFlyoutLink}
                />
              ),
            }),
        },
      ],
      [renderCellActions, showPreview, hit, entityId, renderFlyoutLink]
    );

    return (
      <EuiFlexGroup direction="column" gutterSize="none">
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" css={{ minHeight: '40px' }}>
            <EuiFlexItem data-test-subj={HIGHLIGHTED_FIELDS_TITLE_TEST_ID}>
              <EuiTitle size="xxs">
                <h5>
                  <FormattedMessage
                    id="xpack.securitySolution.flyout.document.investigation.highlightedFields.highlightedFieldsTitle"
                    defaultMessage="Highlighted fields"
                  />
                </h5>
              </EuiTitle>
            </EuiFlexItem>
            {!hideEditButton && (
              <EuiFlexItem grow={false}>
                <EditHighlightedFieldsButton
                  customHighlightedFields={investigationFields}
                  hit={hit}
                  setIsEditLoading={setIsEditLoading}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem data-test-subj={HIGHLIGHTED_FIELDS_DETAILS_TEST_ID}>
          <EuiPanel hasBorder hasShadow={false}>
            <EuiInMemoryTable
              items={items}
              columns={columns}
              compressed
              loading={isEditLoading}
              tableCaption={i18n.translate(
                'xpack.securitySolution.flyout.document.investigation.highlightedFields.highlightedFieldsCaption',
                {
                  defaultMessage: 'Highlighted fields',
                }
              )}
              noItemsMessage={
                <FormattedMessage
                  id="xpack.securitySolution.flyout.document.investigation.highlightedFields.noDataDescription"
                  defaultMessage="There's no highlighted fields for this alert."
                />
              }
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
);

HighlightedFields.displayName = 'HighlightedFields';
