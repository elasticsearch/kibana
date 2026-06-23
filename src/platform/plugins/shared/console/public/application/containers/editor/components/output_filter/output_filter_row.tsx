/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import { checkScript } from '@elastic/micro-jq';
import { i18n } from '@kbn/i18n';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSelect,
  EuiSplitPanel,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useRequestReadContext } from '../../../../contexts';
import { isFilterableStatusCode } from '../../../../lib/apply_response_filter';
import {
  useOutputFilterActionContext,
  useOutputFilterReadContext,
} from '../../../../contexts/output_filter_context';
import type { FilterMode } from '../../../../contexts/output_filter_context';
import { FilterHelpModal } from './filter_help_modal';

const modeOptions = [
  {
    value: 'jq' as FilterMode,
    text: i18n.translate('console.outputFilter.mode.jq', { defaultMessage: 'JQ expression' }),
  },
  {
    value: 'regex' as FilterMode,
    text: i18n.translate('console.outputFilter.mode.regex', {
      defaultMessage: 'Regular expression',
    }),
  },
];

const isValidRegex = (expression: string): boolean => {
  if (!expression) return true;
  try {
    new RegExp(expression);
    return true;
  } catch {
    return false;
  }
};

export const OutputFilterRow = () => {
  const {
    expression: appliedExpression,
    mode: appliedMode,
    invertMatch: appliedInvertMatch,
  } = useOutputFilterReadContext();
  const { setExpression, setMode, setInvertMatch } = useOutputFilterActionContext();

  const [draftExpression, setDraftExpression] = useState(appliedExpression);
  const [draftMode, setDraftMode] = useState<FilterMode>(appliedMode);
  const [draftInvertMatch, setDraftInvertMatch] = useState(appliedInvertMatch);
  const [showHelp, setShowHelp] = useState(false);

  const isInvalid =
    draftMode === 'regex'
      ? !isValidRegex(draftExpression)
      : draftExpression.length > 0 && !checkScript(draftExpression);

  const handleModeChange = (newMode: FilterMode) => {
    setDraftMode(newMode);
    setDraftExpression('');
    setDraftInvertMatch(false);
    setMode(newMode);
    setExpression('');
    setInvertMatch(false);
  };

  const handleExpressionChange = (value: string) => {
    setDraftExpression(value);
    if (value === '') {
      setExpression('');
    }
  };

  const handleApply = () => {
    setExpression(draftExpression);
    setInvertMatch(draftInvertMatch);
  };

  const handleInvertMatchChange = (checked: boolean) => {
    setDraftInvertMatch(checked);
  };

  const errorText = isInvalid
    ? draftMode === 'jq'
      ? i18n.translate('console.outputFilter.jq.error', {
          defaultMessage: 'Invalid JQ expression',
        })
      : i18n.translate('console.outputFilter.regex.error', {
          defaultMessage: 'Invalid regular expression',
        })
    : undefined;

  return (
    <>
      <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiSelect
            options={modeOptions}
            value={draftMode}
            onChange={(e) => handleModeChange(e.target.value as FilterMode)}
            compressed
          />
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiFormRow isInvalid={isInvalid} error={errorText} display="rowCompressed">
            <EuiFieldText
              data-test-subj={draftMode === 'regex' ? 'filterRegex' : 'filterJq'}
              value={draftExpression}
              onChange={(e) => handleExpressionChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isInvalid) handleApply();
              }}
              isInvalid={isInvalid}
              placeholder={
                draftMode === 'regex'
                  ? i18n.translate('console.outputFilter.regex.placeholder', {
                      defaultMessage: 'Regular expression',
                    })
                  : i18n.translate('console.outputFilter.jq.placeholder', {
                      defaultMessage: 'JQ expression',
                    })
              }
              prepend={
                draftMode === 'regex' ? (
                  <EuiButtonEmpty
                    size="xs"
                    color={draftInvertMatch ? 'danger' : 'primary'}
                    iconType={draftInvertMatch ? 'filterExclude' : 'filterInclude'}
                    data-test-subj="invertFilter"
                    onClick={() => handleInvertMatchChange(!draftInvertMatch)}
                  >
                    {draftInvertMatch
                      ? i18n.translate('console.outputFilter.regex.exclude', {
                          defaultMessage: 'Exclude',
                        })
                      : i18n.translate('console.outputFilter.regex.include', {
                          defaultMessage: 'Include',
                        })}
                  </EuiButtonEmpty>
                ) : undefined
              }
              compressed
              fullWidth
            />
          </EuiFormRow>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiButton
            size="s"
            color="primary"
            iconType="returnKey"
            iconSide="left"
            onClick={handleApply}
            isDisabled={isInvalid}
            data-test-subj="consoleOutputFilterApply"
          >
            {i18n.translate('console.outputFilter.applyButton', { defaultMessage: 'Apply' })}
          </EuiButton>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate('console.outputFilter.helpAriaLabel', {
              defaultMessage: 'Filter expression help',
            })}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              iconType="question"
              aria-label={i18n.translate('console.outputFilter.helpAriaLabel', {
                defaultMessage: 'Filter expression help',
              })}
              onClick={() => setShowHelp(true)}
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>

      {showHelp && <FilterHelpModal mode={draftMode} onClose={() => setShowHelp(false)} />}
    </>
  );
};

export const OutputFilterExpandedPanel = () => {
  const { isExpanded } = useOutputFilterReadContext();
  const {
    lastResult: { data },
  } = useRequestReadContext();
  const { euiTheme } = useEuiTheme();

  if (
    !isExpanded ||
    !data ||
    data.length !== 1 ||
    !isFilterableStatusCode(data[0].response.statusCode)
  )
    return null;

  return (
    <EuiSplitPanel.Inner
      grow={false}
      paddingSize="s"
      css={css`
        background-color: ${euiTheme.colors.backgroundBasePlain};
      `}
    >
      <OutputFilterRow />
    </EuiSplitPanel.Inner>
  );
};
