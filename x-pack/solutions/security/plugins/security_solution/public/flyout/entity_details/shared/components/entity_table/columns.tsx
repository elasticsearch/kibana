/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import React from 'react';
import { euiThemeVars } from '@kbn/ui-theme';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  DefaultFieldRenderer,
  toFieldRendererItems,
} from '../../../../../timelines/components/field_renderers/default_renderer';
import { getEmptyTagValue } from '../../../../../common/components/empty_value';
import type { BasicEntityData, EntityTableColumns, EntityTableLinkRenderer } from './types';
import { isFlyoutLink } from '../../../../shared/utils/link_utils';
import { PreviewLink } from '../../../../shared/components/preview_link';

export const getEntityTableColumns = <T extends BasicEntityData>(
  contextID: string,
  scopeId: string,
  data: T,
  entityLink?: EntityTableLinkRenderer
): EntityTableColumns<T> => [
  {
    name: (
      <FormattedMessage
        id="xpack.securitySolution.flyout.entityDetails.fieldColumnTitle"
        defaultMessage="Field"
      />
    ),
    field: 'label',
    render: (label: string, { field }) => (
      <span
        data-test-subj="entity-table-label"
        css={css`
          font-weight: ${euiThemeVars.euiFontWeightMedium};
          color: ${euiThemeVars.euiTitleColor};
        `}
      >
        {label ?? field}
      </span>
    ),
  },
  {
    name: (
      <FormattedMessage
        id="xpack.securitySolution.flyout.entityDetails.valuesColumnTitle"
        defaultMessage="Values"
      />
    ),
    field: 'field',
    render: (field: string | undefined, { getValues, render, renderField }) => {
      const values = getValues && getValues(data);

      if (field) {
        let renderValue: ((value: string) => JSX.Element) | undefined;
        if (entityLink) {
          const EntityLink = entityLink;
          renderValue = (value: string) => (
            <EntityLink field={field} value={value}>
              {value}
            </EntityLink>
          );
        } else if (values && isFlyoutLink({ field, scopeId })) {
          renderValue = (value: string) => (
            <PreviewLink field={field} value={value} entityId={data.entityId} scopeId={scopeId} />
          );
        } else {
          renderValue = renderField;
        }
        return (
          <DefaultFieldRenderer
            rowItems={toFieldRendererItems(values)}
            attrName={field}
            idPrefix={contextID ? `entityTable-${contextID}` : 'entityTable'}
            scopeId={scopeId}
            render={renderValue}
            data-test-subj="entity-table-value"
          />
        );
      }

      if (render) {
        return render(data);
      }

      return getEmptyTagValue();
    },
  },
];
