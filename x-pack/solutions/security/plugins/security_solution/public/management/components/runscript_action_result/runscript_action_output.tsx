/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import {
  EuiAccordion,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
  useGeneratedHtmlId,
  type EuiTextProps,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import styled from '@emotion/styled';
import { useTestIdGenerator } from '../../hooks/use_test_id_generator';
import type {
  ActionDetails,
  MaybeImmutable,
  ResponseActionRunScriptOutputContent,
} from '../../../../common/endpoint/types';
import { getEmptyValue } from '../../../common/components/empty_value';
import { RunscriptActionNoOutput } from './runscript_action_no_output';

const emptyValue = getEmptyValue();

const ACCORDION_BUTTON_TEXT = Object.freeze({
  output: {
    regular: i18n.translate(
      'xpack.securitySolution.responseActionRunscriptAccordion.outputButtonTextRegular',
      {
        defaultMessage: 'Runscript output',
      }
    ),
  },
  error: {
    regular: i18n.translate(
      'xpack.securitySolution.responseActionRunscriptAccordion.errorButtonTextRegular',
      {
        defaultMessage: 'Runscript error',
      }
    ),
  },
});

const StyledEuiText = styled(EuiText)`
  white-space: pre-wrap;
  line-break: anywhere;
`;

interface RunscriptActionOutputProps {
  content?: string | React.ReactNode;
  initialIsOpen?: boolean;
  textSize?: Exclude<EuiTextProps['size'], 'm' | 'relative'>;
  type: 'error' | 'output';
  'data-test-subj'?: string;
}

const RunscriptOutputAccordion = memo<RunscriptActionOutputProps>(
  ({
    content = emptyValue,
    initialIsOpen = false,
    textSize = 'xs',
    type,
    'data-test-subj': dataTestSubj,
  }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);
    const id = useGeneratedHtmlId({
      prefix: 'executeActionOutputAccordions',
      suffix: type,
    });

    const accordionButtonContent = useMemo(
      () => (
        <EuiText size={textSize} data-test-subj={getTestId('title')}>
          {ACCORDION_BUTTON_TEXT[type].regular}
        </EuiText>
      ),
      [getTestId, textSize, type]
    );

    return (
      <EuiAccordion
        id={id}
        initialIsOpen={initialIsOpen}
        buttonContent={accordionButtonContent}
        paddingSize="s"
        data-test-subj={dataTestSubj}
      >
        <StyledEuiText size={textSize}>
          {typeof content === 'string' ? <p>{content}</p> : content}
        </StyledEuiText>
      </EuiAccordion>
    );
  }
);
RunscriptOutputAccordion.displayName = 'RunscriptOutputAccordion';

export interface RunscriptOutputProps {
  action: MaybeImmutable<ActionDetails<ResponseActionRunScriptOutputContent>>;
  agentId: string;
  'data-test-subj'?: string;
  textSize?: Exclude<EuiTextProps['size'], 'm' | 'relative'>;
}

export const RunscriptOutput = memo<RunscriptOutputProps>(
  ({ action, agentId, 'data-test-subj': dataTestSubj, textSize = 'xs' }) => {
    const outputContent = useMemo(
      () => action.outputs && action.outputs[agentId] && action.outputs[agentId].content,
      [action.outputs, agentId]
    );

    if (!outputContent) {
      return (
        <EuiFlexItem>
          <RunscriptActionNoOutput
            textSize={textSize}
            data-test-subj={`${dataTestSubj}-no-output`}
          />
        </EuiFlexItem>
      );
    }

    const { code, stderr, stdout } = outputContent;
    const isFileTooLargeError = Number(code) === 413;

    if (isFileTooLargeError) {
      return (
        <EuiFlexItem>
          <EuiText size={textSize} data-test-subj={`${dataTestSubj}-file-too-large`}>
            {i18n.translate(
              'xpack.securitySolution.endpointResponseActions.runScriptAction.outputFileTooLargeMessage',
              {
                defaultMessage:
                  'The output is too large to be displayed. Please download the output file to view the results.',
              }
            )}
          </EuiText>
        </EuiFlexItem>
      );
    }

    const hasErrorOutput = stderr && stderr.length > 0;
    const hasStdOutput = stdout && stdout.length > 0;

    return (
      <>
        <EuiFlexItem>
          {hasErrorOutput && (
            <RunscriptOutputAccordion
              content={hasErrorOutput ? stderr : undefined}
              data-test-subj={`${dataTestSubj}-stderr`}
              initialIsOpen
              textSize={textSize}
              type="error"
            />
          )}
          {hasStdOutput && (
            <>
              {hasErrorOutput && <EuiSpacer size="m" />}
              <RunscriptOutputAccordion
                content={hasStdOutput ? stdout : undefined}
                data-test-subj={`${dataTestSubj}-stdout`}
                initialIsOpen
                textSize={textSize}
                type="output"
              />
            </>
          )}
        </EuiFlexItem>
      </>
    );
  }
);
RunscriptOutput.displayName = 'RunscriptOutput';
