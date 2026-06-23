/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import styled from '@emotion/styled';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButtonIcon,
  EuiCallOut,
  EuiDescriptionList,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { sortBy } from 'lodash';
import type { CommandDefinition } from '../types';
import { useTestIdGenerator } from '../../../hooks/use_test_id_generator';
import { useDataTestSubj } from '../hooks/state_selectors/use_data_test_subj';
import { useConsoleStateDispatch } from '../hooks/state_selectors/use_console_state_dispatch';
import { COMMON_ARGS, HELP_GROUPS } from '../service/builtin_commands';
import { getCommandNameWithArgs } from '../service/utils';
import { ConsoleCodeBlock } from './console_code_block';
import { useKibana } from '../../../../common/lib/kibana';

const otherCommandsGroupLabel = i18n.translate(
  'xpack.securitySolution.console.commandList.otherCommandsGroup.label',
  {
    defaultMessage: 'Other commands',
  }
);

/**
 * Takes a string and removes all non-letters/number from it.
 * @param value
 */
export const convertToTestId = (value: string): string => {
  return value.replace(/[^A-Za-z0-9]/g, '');
};

// @ts-expect-error TS2769
const StyledEuiBasicTable = styled(EuiBasicTable)`
  margin-top: ${({ theme }) => theme.euiTheme.size.s};
  .euiTableHeaderCell {
    .euiTableCellContent__text {
      color: ${({ theme }) => theme.euiTheme.colors.textParagraph};
      font-size: ${({ theme }) => theme.euiTheme.font.scale[theme.euiTheme.font.body.scale]}rem;
      padding-bottom: ${({ theme }) => theme.euiTheme.size.s};
      padding-left: ${({ theme }) => theme.euiTheme.size.s};
    }
  }
`;

const StyledEuiCallOut = styled(EuiCallOut)`
  margin: ${({ theme }) => theme.euiTheme.size.base};
  padding: ${({ theme }) => theme.euiTheme.size.base};
  border-radius: ${({ theme }) => theme.euiTheme.size.xs};
`;

const StyledEuiFlexGroup = styled(EuiFlexGroup)`
  padding-left: ${({ theme }) => theme.euiTheme.size.s};
`;

const StyledEuiFlexGrid = styled(EuiFlexGrid)`
  @media only screen and (min-width: ${(props) => props.theme.euiTheme.breakpoint.l}px) {
    max-width: 75%;
  }
  @media only screen and (min-width: ${(props) => props.theme.euiTheme.breakpoint.xl}px) {
    max-width: 50%;
  }
`;

const StyledEuiBadge = styled(EuiBadge)`
  font-size: 10px !important;
  span {
    color: ${({ theme }) => theme.euiTheme.colors.shadow} !important;
  }
`;

export interface CommandListProps {
  commands: CommandDefinition[];
  display?: 'default' | 'table';
}

export const CommandList = memo<CommandListProps>(({ commands, display = 'default' }) => {
  const getTestId = useTestIdGenerator(useDataTestSubj('commandList'));
  const dispatch = useConsoleStateDispatch();
  const { docLinks } = useKibana().services;

  const footerMessage = useMemo(() => {
    return (
      <EuiDescriptionList
        compressed
        listItems={[
          {
            title: (
              <StyledEuiBadge>
                <ConsoleCodeBlock inline bold>
                  {COMMON_ARGS.find((current) => current.name === '--help')?.name}
                </ConsoleCodeBlock>
              </StyledEuiBadge>
            ),
            description: (
              <EuiText color="subdued" size="xs">
                <FormattedMessage
                  id="xpack.securitySolution.console.commandList.footerText"
                  defaultMessage="For more help with the individual commands use the --help argument. Ex: processes --help"
                />
              </EuiText>
            ),
          },
        ]}
      />
    );
  }, []);

  const updateInputText = useCallback(
    (text: string) => () => {
      dispatch({
        type: 'updateInputTextEnteredState',
        payload: () => {
          return {
            leftOfCursorText: text,
            rightOfCursorText: '',
          };
        },
      });

      dispatch({ type: 'addFocusToKeyCapture' });
    },
    [dispatch]
  );

  const commandsByGroups = useMemo(() => {
    const helpGroups = new Map<
      string,
      { label: string; position: number; list: CommandDefinition[] }
    >();

    // We only show commands that are no hidden
    const allowedCommands = commands.filter((command) => command.helpHidden !== true);

    for (const allowedCommand of allowedCommands) {
      const { helpGroupLabel = otherCommandsGroupLabel, helpGroupPosition = Infinity } =
        allowedCommand;

      const groupEntry = helpGroups.get(helpGroupLabel);

      if (groupEntry) {
        groupEntry.list.push(allowedCommand);

        // Its possible (but probably not intentionally) that the same Group Label might
        // have different positions defined (ex. one has a position, and another does not,
        // which defaults to `Infinity`. If we detect that here, then update the group
        // position. In the end, the group label will have the last explicitly defined
        // position found.
        if (
          groupEntry.position === Infinity &&
          helpGroupPosition !== undefined &&
          helpGroupPosition !== groupEntry.position
        ) {
          groupEntry.position = helpGroupPosition;
        }
      } else {
        helpGroups.set(allowedCommand.helpGroupLabel as string, {
          label: helpGroupLabel,
          position: helpGroupPosition,
          list: [allowedCommand],
        });
      }
    }

    // Sort by Group position and return an array of arrays with the list of commands per group
    return sortBy(Array.from(helpGroups.values()), 'position').map((group) => {
      // ensure all commands in this group have a `helpCommandPosition`. Those missing one, will
      // be set to `Infinity` so that they are moved to the end.
      const groupCommandList = group.list.map((command) => {
        if (command.helpCommandPosition === undefined) {
          return {
            ...command,
            helpCommandPosition: Infinity,
          };
        }

        return command;
      });

      return sortBy(groupCommandList, 'helpCommandPosition');
    });
  }, [commands]);

  const getTableItems = useCallback(
    (
      commandsByGroup: CommandDefinition[]
    ): Array<{
      [key: string]: { name: string; about: React.ReactNode | string };
    }> => {
      if (commandsByGroup[0].helpGroupLabel === HELP_GROUPS.supporting.label) {
        return [...COMMON_ARGS, ...commandsByGroup].map((command) => ({
          [commandsByGroup[0]?.helpGroupLabel ?? otherCommandsGroupLabel]: command,
        }));
      }
      return commandsByGroup.map((command) => ({
        [commandsByGroup[0]?.helpGroupLabel ?? otherCommandsGroupLabel]: command,
      }));
    },
    []
  );

  const getTableColumns = useCallback(
    (commandsByGroup: CommandDefinition[]) => {
      const groupLabel = commandsByGroup[0]?.helpGroupLabel ?? otherCommandsGroupLabel;
      const groupTestIdSuffix = convertToTestId(groupLabel);

      return [
        {
          field: groupLabel,
          name: <div data-test-subj={getTestId('group')}>{groupLabel}</div>,
          render: (command: CommandDefinition) => {
            const commandNameWithArgs = getCommandNameWithArgs(command);
            return (
              <StyledEuiFlexGroup
                alignItems="center"
                data-test-subj={getTestId(`${groupTestIdSuffix}-${command.name}`)}
              >
                <EuiFlexItem grow={1}>
                  <EuiDescriptionList
                    data-test-subj={getTestId('command')}
                    listItems={[
                      {
                        title: (
                          <EuiBadge data-test-subj={getTestId('commandName')}>
                            {commandNameWithArgs}
                          </EuiBadge>
                        ),
                        description: (
                          <>
                            <EuiSpacer size="xs" />
                            <EuiText color="subdued" size="xs">
                              {command.about}
                            </EuiText>
                          </>
                        ),
                      },
                    ]}
                  />
                </EuiFlexItem>
                {command.helpGroupLabel !== HELP_GROUPS.supporting.label &&
                  command.helpHidden !== true &&
                  command.RenderComponent && (
                    <EuiFlexItem grow={false}>
                      <EuiToolTip
                        content={
                          command.helpDisabled === true
                            ? i18n.translate(
                                'xpack.securitySolution.console.commandList.disabledButtonTooltip',
                                { defaultMessage: 'Unsupported command' }
                              )
                            : i18n.translate(
                                'xpack.securitySolution.console.commandList.addButtonTooltip',
                                { defaultMessage: 'Add to text bar' }
                              )
                        }
                      >
                        <EuiButtonIcon
                          iconType="plusCircle"
                          aria-label={`updateTextInputCommand-${command.name}`}
                          onClick={updateInputText(`${commandNameWithArgs} `)}
                          isDisabled={command.helpDisabled === true}
                          data-test-subj={getTestId(
                            `${groupTestIdSuffix}-${command.name}-addToInput`
                          )}
                        />
                      </EuiToolTip>
                    </EuiFlexItem>
                  )}
              </StyledEuiFlexGroup>
            );
          },
        },
      ];
    },
    [getTestId, updateInputText]
  );

  const getFilteredCommands = useCallback(
    (commandsByGroup: CommandDefinition[]): CommandDefinition[] =>
      commandsByGroup.filter(
        (current: CommandDefinition) => current.name !== 'help' && current.name !== 'clear'
      ),
    []
  );

  if (display === 'table') {
    const calloutItems = [
      <FormattedMessage
        id="xpack.securitySolution.console.commandList.callout.escapeDoubleDashes"
        defaultMessage="Escape values with double dashes (--) as \-\-, unless they are command arguments; otherwise the console interprets them as arguments."
      />,
      <FormattedMessage
        id="xpack.securitySolution.console.commandList.callout.multipleResponses"
        defaultMessage="You can enter consecutive response actions — no need to wait for previous actions to complete."
      />,
      <FormattedMessage
        id="xpack.securitySolution.console.commandList.callout.leavingResponder"
        defaultMessage="Leaving the response console does not terminate any actions that have been submitted."
      />,
      <FormattedMessage
        id="xpack.securitySolution.console.commandList.callout.visitSupportSections"
        defaultMessage="{learnMore} about response actions and using the console."
        values={{
          learnMore: (
            <EuiLink
              href={docLinks.links.securitySolution.responseActions}
              target="_blank"
              data-test-subj={getTestId('helpfulHintDocLink')}
            >
              <FormattedMessage
                id="xpack.securitySolution.console.commandList.callout.readMoreLink"
                defaultMessage="Learn more"
              />
            </EuiLink>
          ),
        }}
      />,
    ];

    const callout = (
      <StyledEuiCallOut
        title={
          <FormattedMessage
            id="xpack.securitySolution.console.commandList.callout.title"
            defaultMessage="Helpful tips:"
          />
        }
        data-test-subj={getTestId('helpfulTips')}
      >
        <ul>
          {calloutItems.map((item, index) => (
            <li key={index}>
              <EuiText size="s">{item}</EuiText>
            </li>
          ))}
        </ul>
      </StyledEuiCallOut>
    );

    return (
      <div data-test-subj={getTestId()}>
        {commandsByGroups.map((commandsByGroup, i) => (
          <StyledEuiBasicTable
            data-test-subj={getTestId(
              convertToTestId(commandsByGroup[0].helpGroupLabel ?? otherCommandsGroupLabel)
            )}
            key={`styledEuiBasicTable-${i}`}
            items={getTableItems(commandsByGroup)}
            columns={getTableColumns(commandsByGroup)}
          />
        ))}
        {callout}
      </div>
    );
  }

  return (
    <div data-test-subj={getTestId()}>
      <EuiSpacer size="s" />
      {commandsByGroups.map((commandsByGroup) => {
        const groupLabel = commandsByGroup[0].helpGroupLabel;
        const filteredCommands = getFilteredCommands(commandsByGroup);

        if (filteredCommands.length === 0) {
          return null;
        }

        return (
          <StyledEuiFlexGrid
            columns={3}
            responsive={false}
            gutterSize="l"
            key={groupLabel}
            direction="column"
          >
            {filteredCommands.map((command) => {
              const commandNameWithArgs = getCommandNameWithArgs(command);
              return (
                <EuiFlexItem key={command.name}>
                  <EuiDescriptionList
                    compressed
                    listItems={[
                      {
                        title: (
                          <EuiToolTip content={commandNameWithArgs}>
                            <StyledEuiBadge>
                              <ConsoleCodeBlock inline bold>
                                {commandNameWithArgs}
                              </ConsoleCodeBlock>
                            </StyledEuiBadge>
                          </EuiToolTip>
                        ),
                        description: (
                          <EuiText color="subdued" size="xs">
                            {command.about}
                          </EuiText>
                        ),
                      },
                    ]}
                    data-test-subj={getTestId('command')}
                  />
                </EuiFlexItem>
              );
            })}
          </StyledEuiFlexGrid>
        );
      })}
      <EuiSpacer size="xl" />
      {footerMessage}
    </div>
  );
});
CommandList.displayName = 'CommandList';
