/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useMemo, useState } from 'react';
import { css } from '@emotion/react';
import { EuiButtonEmpty, useEuiTheme } from '@elastic/eui';
import type { DataTableRecord } from '@kbn/discover-utils';
import { FormattedMessage } from '@kbn/i18n-react';
import { getAgentTypeForAgentIdField } from '../../../../common/lib/endpoint/utils/get_agent_type_for_agent_id_field';
import type { ResponseActionAgentType } from '../../../../../common/endpoint/service/response_actions/constants';
import { AgentStatus } from '../../../../common/components/endpoint/agents/agent_status';
import { AGENT_STATUS_FIELD_NAME } from '../../../../timelines/components/timeline/body/renderers/constants';
import {
  HIGHLIGHTED_FIELDS_AGENT_STATUS_CELL_TEST_ID,
  HIGHLIGHTED_FIELDS_BASIC_CELL_TEST_ID,
  HIGHLIGHTED_FIELDS_CELL_TEST_ID,
  HIGHLIGHTED_FIELDS_LINKED_CELL_TEST_ID,
} from './test_ids';
import { isFlyoutLink } from '../../../../flyout/shared/utils/link_utils';
import { PreviewLink } from '../../../../flyout/shared/components/preview_link';
import type { OpenFlyoutLinkProps } from '../../../shared/components/open_flyout_link';

const EMPTY_ARRAY: string[] = [];

export type OpenFlyoutLinkRenderer = React.FC<OpenFlyoutLinkProps>;

export interface HighlightedFieldsCellProps {
  /**
   * The source document record for entity resolution in new v2 flyouts.
   */
  hit?: DataTableRecord;
  /**
   * Entity id for legacy PreviewLink (v1 expandable flyout).
   */
  entityId?: string;
  /**
   * Highlighted field's name used to know what component to display
   */
  field: string;
  /**
   * Highlighted field's original name, when the field is overridden
   */
  originalField?: string;
  /**
   * Highlighted field's value to display
   */
  values: string[] | null | undefined;
  /**
   * Maintain backwards compatibility // TODO remove when possible
   * Only needed if alerts page flyout (which has OpenFlyoutLink), NOT in EASE alert summary flyout.
   */
  scopeId?: string;
  /**
   * If true, we show a link for some specific fields.
   * This is false by default (for EASE alert summary page) and will be true for the alerts page.
   */
  showPreview?: boolean;
  /**
   * The indexName to be passed to the flyout preview panel
   * when clicking on "Source event" id
   */
  ancestorsIndexName?: string;
  /**
   * Caps the amount of values displayed in the cell.
   * If the limit is reached a "show more" button is being rendered
   */
  displayValuesLimit?: number;
  /**
   * Optional wrapper that renders a preview link for supported field types.
   * When provided, wraps each cell value. If the wrapper handles the field
   * (e.g. IP), it renders its own link; otherwise it passes through children.
   */
  renderFlyoutLink?: OpenFlyoutLinkRenderer;
}

/**
 * Renders a component in the highlighted fields table cell based on the field name
 */
export const HighlightedFieldsCell: FC<HighlightedFieldsCellProps> = ({
  values,
  field,
  originalField = '',
  scopeId = '',
  showPreview = false,
  ancestorsIndexName,
  displayValuesLimit = 2,
  hit,
  entityId,
  renderFlyoutLink: RenderFlyoutLink,
}) => {
  const agentType: ResponseActionAgentType = useMemo(() => {
    return getAgentTypeForAgentIdField(originalField);
  }, [originalField]);
  const { euiTheme } = useEuiTheme();
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const toggleContentExpansion = useCallback(
    () => setIsContentExpanded((currentIsOpen) => !currentIsOpen),
    []
  );

  const visibleValues = useMemo(() => {
    /**
     * Check if a limit was set and if the limit
     * is within the values size
     */
    if (
      displayValuesLimit &&
      displayValuesLimit > 0 &&
      displayValuesLimit < (values?.length ?? 0)
    ) {
      return values?.slice(0, displayValuesLimit);
    }

    return values;
  }, [values, displayValuesLimit]);

  const overflownValues = useMemo(() => {
    /**
     * Check if a limit was set and if the limit
     * is within the values size
     */
    if (
      displayValuesLimit &&
      displayValuesLimit > 0 &&
      displayValuesLimit < (values?.length ?? 0)
    ) {
      return values?.slice(displayValuesLimit);
    }

    return EMPTY_ARRAY;
  }, [values, displayValuesLimit]);

  const isContentTooLarge = useMemo(
    () => !!displayValuesLimit && displayValuesLimit < (values?.length ?? 0),
    [displayValuesLimit, values]
  );

  const renderValue = useCallback(
    (value: string, i: number) => {
      const content =
        showPreview && isFlyoutLink({ field, scopeId }) ? (
          <PreviewLink
            field={field}
            value={value}
            entityId={entityId}
            scopeId={scopeId}
            data-test-subj={HIGHLIGHTED_FIELDS_LINKED_CELL_TEST_ID}
            ancestorsIndexName={ancestorsIndexName}
          >
            {value}
          </PreviewLink>
        ) : field === AGENT_STATUS_FIELD_NAME ? (
          <AgentStatus
            agentId={String(value ?? '')}
            agentType={agentType}
            data-test-subj={HIGHLIGHTED_FIELDS_AGENT_STATUS_CELL_TEST_ID}
          />
        ) : (
          <span data-test-subj={HIGHLIGHTED_FIELDS_BASIC_CELL_TEST_ID}>{value}</span>
        );

      return (
        <div key={`${i}-${value}`} data-test-subj={`${value}-${HIGHLIGHTED_FIELDS_CELL_TEST_ID}`}>
          {RenderFlyoutLink ? (
            <RenderFlyoutLink field={field} value={value} hit={hit}>
              {content}
            </RenderFlyoutLink>
          ) : (
            content
          )}
        </div>
      );
    },
    [agentType, ancestorsIndexName, field, scopeId, showPreview, hit, entityId, RenderFlyoutLink]
  );

  if (values === null) return null;

  return (
    <div
      css={css`
        div {
          margin-bottom: ${euiTheme.size.xs};
        }

        div:last-child {
          margin-bottom: 0;
        }
      `}
    >
      {visibleValues != null && visibleValues.map((value, i) => renderValue(value, i))}
      {isContentExpanded && overflownValues?.map(renderValue)}
      {isContentTooLarge && (
        <EuiButtonEmpty
          size="xs"
          flush="both"
          onClick={toggleContentExpansion}
          data-test-subj="toggle-show-more-button"
        >
          {isContentExpanded ? (
            <FormattedMessage
              id="xpack.securitySolution.flyout.alertsHighlightedField.showMore"
              defaultMessage="Show less"
            />
          ) : (
            <FormattedMessage
              id="xpack.securitySolution.flyout.alertsHighlightedField.showLess"
              defaultMessage="Show more"
            />
          )}
        </EuiButtonEmpty>
      )}
    </div>
  );
};
