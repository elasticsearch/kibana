/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ComponentProps } from 'react';
import React, { memo, useMemo } from 'react';
import { EuiCodeBlock, EuiDescriptionList, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import type { Theme } from '@emotion/react';
import styled from '@emotion/styled';
import { reduce } from 'lodash';
import { ActionResponseOutputs } from './action_response_outputs';
import { getAgentTypeName } from '../../../../common/translations';
import { RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP } from '../../../../../common/endpoint/service/response_actions/constants';
import { OUTPUT_MESSAGES } from '../translations';
import { useTestIdGenerator } from '../../../hooks/use_test_id_generator';
import { getEmptyValue } from '../../../../common/components/empty_value';
import { type ActionDetails, type MaybeImmutable } from '../../../../../common/endpoint/types';

const emptyValue = getEmptyValue();

const customDescriptionListCss = ({ theme }: { theme: Theme }) => `
  &.euiDescriptionList {
    > .euiDescriptionList__title {
      color: ${theme.euiTheme.colors.textSubdued};
      font-size: ${theme.euiTheme.font.scale.xs}rem;
    }

    > .euiDescriptionList__title,
    > .euiDescriptionList__description {
      font-weight: ${theme.euiTheme.font.weight.regular};
    }
  }
`;
const topSpacingCss = ({ theme }: { theme: Theme }) => `${theme.euiTheme.size.base} 0`;
const dashedBorderCss = ({ theme }: { theme: Theme }) =>
  `1px dashed ${theme.euiTheme.colors.borderBaseDisabled}`;

const StyledDescriptionListOutputBase = styled(EuiDescriptionList)`
  ${customDescriptionListCss}
  dd {
    margin: ${topSpacingCss};
    padding: ${topSpacingCss};
    border-top: ${dashedBorderCss};
    border-bottom: ${dashedBorderCss};
  }
`;
const StyledDescriptionListOutput = (props: ComponentProps<typeof EuiDescriptionList>) => (
  <StyledDescriptionListOutputBase compressed {...props} />
);

const StyledDescriptionListBase = styled(EuiDescriptionList)`
  ${customDescriptionListCss}
`;
const StyledDescriptionList = (props: ComponentProps<typeof EuiDescriptionList>) => (
  <StyledDescriptionListBase {...props} compressed type="column" />
);

const StyledEuiCodeBlockBase = styled(EuiCodeBlock)`
  code {
    color: ${({ theme }) => theme.euiTheme.colors.textSubdued} !important;
  }
`;
const StyledEuiCodeBlock = (props: ComponentProps<typeof EuiCodeBlock>) => (
  <StyledEuiCodeBlockBase transparentBackground paddingSize="none" {...props} />
);

const StyledEuiFlexGroupBase = styled(EuiFlexGroup)`
  max-height: 40vh;
  min-height: 270px;
  overflow-y: auto;
`;
const StyledEuiFlexGroup = (props: ComponentProps<typeof EuiFlexGroup>) => (
  <StyledEuiFlexGroupBase
    direction="column"
    className="eui-yScrollWithShadows"
    gutterSize="s"
    tabIndex={0}
    {...props}
  />
);

export const ActionsLogExpandedTray = memo<{
  action: MaybeImmutable<ActionDetails>;
  'data-test-subj'?: string;
}>(({ action, 'data-test-subj': dataTestSubj }) => {
  const getTestId = useTestIdGenerator(dataTestSubj);
  const {
    hosts,
    startedAt,
    completedAt,
    command: _command,
    comment,
    parameters,
    agentType,
  } = action;

  const parametersList = useMemo(
    () =>
      parameters
        ? Object.entries(parameters).map(([key, value]) => {
            return `${key}: ${value}`;
          })
        : undefined,
    [parameters]
  );

  const command = RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP[_command];

  const dataList = useMemo(() => {
    const list = [
      {
        title: OUTPUT_MESSAGES.expandSection.placedAt,
        description: `${startedAt}`,
      },
      {
        title: OUTPUT_MESSAGES.expandSection.startedAt,
        description: `${startedAt}`,
      },
      {
        title: OUTPUT_MESSAGES.expandSection.completedAt,
        description: `${completedAt ?? emptyValue}`,
      },
      {
        title: OUTPUT_MESSAGES.expandSection.input,
        description: `${command}`,
      },
      {
        title: OUTPUT_MESSAGES.expandSection.parameters,
        description: parametersList ? parametersList.join(', ') : emptyValue,
      },
      {
        title: OUTPUT_MESSAGES.expandSection.comment,
        description: comment ? comment : emptyValue,
      },
      {
        title: OUTPUT_MESSAGES.expandSection.hostname,
        description:
          reduce(
            hosts,
            (acc, host, agentId) => {
              if (host.name.trim().length) {
                acc.push(host.name);
              } else {
                acc.push(agentId);
              }
              return acc;
            },
            [] as string[]
          ).join(', ') || emptyValue,
      },
      {
        title: OUTPUT_MESSAGES.expandSection.agentType,
        description: getAgentTypeName(agentType) || emptyValue,
      },
    ];

    return list.map(({ title, description }) => {
      return {
        title: <StyledEuiCodeBlock>{title}</StyledEuiCodeBlock>,
        description: (
          <StyledEuiCodeBlock data-test-subj={getTestId(`action-details-info-${title}`)}>
            {description}
          </StyledEuiCodeBlock>
        ),
      };
    });
  }, [agentType, command, comment, completedAt, getTestId, hosts, parametersList, startedAt]);

  const outputList = useMemo(
    () => [
      {
        title: (
          <StyledEuiCodeBlock>{`${OUTPUT_MESSAGES.expandSection.output}:`}</StyledEuiCodeBlock>
        ),
        description: (
          // codeblock for output
          <StyledEuiCodeBlock data-test-subj={getTestId('details-tray-output')}>
            <ActionResponseOutputs action={action} data-test-subj={getTestId('output')} />
          </StyledEuiCodeBlock>
        ),
      },
    ],
    [action, getTestId]
  );

  return (
    <>
      <StyledEuiFlexGroup data-test-subj={getTestId('details-tray')}>
        <EuiFlexItem grow={false}>
          <StyledDescriptionList listItems={dataList} />
        </EuiFlexItem>
        <EuiFlexItem>
          <StyledDescriptionListOutput listItems={outputList} />
        </EuiFlexItem>
      </StyledEuiFlexGroup>
    </>
  );
});

ActionsLogExpandedTray.displayName = 'ActionsLogExpandedTray';
