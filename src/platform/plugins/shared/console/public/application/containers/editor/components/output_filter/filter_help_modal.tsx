/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiModal,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiModalBody,
  EuiModalFooter,
  EuiButton,
  EuiText,
  EuiCode,
  EuiDescriptionList,
  EuiSpacer,
} from '@elastic/eui';
import type { FilterMode } from '../../../../contexts/output_filter_context';

interface FilterHelpModalProps {
  mode: FilterMode;
  onClose: () => void;
}

const regexExamples = [
  {
    expression: 'status',
    description: i18n.translate('console.outputFilter.help.regex.example1', {
      defaultMessage: 'Show lines containing "status"',
    }),
  },
  {
    expression: 'green|yellow',
    description: i18n.translate('console.outputFilter.help.regex.example2', {
      defaultMessage: 'Show lines with "green" or "yellow"',
    }),
  },
  {
    expression: '^\\s*"count"',
    description: i18n.translate('console.outputFilter.help.regex.example3', {
      defaultMessage: 'Show lines starting with "count" key',
    }),
  },
];

const jqExamples = [
  {
    expression: '._shards',
    description: i18n.translate('console.outputFilter.help.jq.example1', {
      defaultMessage: 'Extract a top-level field',
    }),
  },
  {
    expression: '.hits.hits[0]',
    description: i18n.translate('console.outputFilter.help.jq.example2', {
      defaultMessage: 'Get the first hit',
    }),
  },
  {
    expression: '.hits.hits[] | ._source',
    description: i18n.translate('console.outputFilter.help.jq.example3', {
      defaultMessage: 'Iterate hits and extract _source',
    }),
  },
  {
    expression: '.hits.hits[] | select(._source.status == "active")',
    description: i18n.translate('console.outputFilter.help.jq.example4', {
      defaultMessage: 'Filter hits by a field value',
    }),
  },
  {
    expression: 'to_entries | select(.value.type == "keyword") | .key',
    description: i18n.translate('console.outputFilter.help.jq.example5', {
      defaultMessage: 'List fields with a given mapping type',
    }),
  },
  {
    expression: 'keys',
    description: i18n.translate('console.outputFilter.help.jq.example6', {
      defaultMessage: 'List all top-level keys',
    }),
  },
];

export const FilterHelpModal = ({ mode, onClose }: FilterHelpModalProps) => {
  const examples = mode === 'jq' ? jqExamples : regexExamples;
  const title =
    mode === 'jq'
      ? i18n.translate('console.outputFilter.help.jq.title', {
          defaultMessage: 'JQ expression examples',
        })
      : i18n.translate('console.outputFilter.help.regex.title', {
          defaultMessage: 'Regular expression examples',
        });

  const note =
    mode === 'jq'
      ? i18n.translate('console.outputFilter.help.jq.note', {
          defaultMessage:
            'Supports field access, .[], pipes, select, comparisons, to_entries, keys, from_entries, not, and recursive descent (..).',
        })
      : i18n.translate('console.outputFilter.help.regex.note', {
          defaultMessage:
            'Filter is applied line-by-line. Use "Invert match" to exclude matching lines.',
        });

  return (
    <EuiModal onClose={onClose} style={{ maxWidth: 480 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>{title}</EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiText size="s" color="subdued">
          {note}
        </EuiText>
        <EuiSpacer size="m" />
        <EuiDescriptionList
          compressed
          listItems={examples.map(({ expression, description }) => ({
            title: description,
            description: <EuiCode>{expression}</EuiCode>,
          }))}
        />
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButton onClick={onClose} fill>
          {i18n.translate('console.outputFilter.help.closeButton', { defaultMessage: 'Close' })}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};
