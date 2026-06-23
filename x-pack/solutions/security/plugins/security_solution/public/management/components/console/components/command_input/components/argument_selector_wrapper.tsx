/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import styled from '@emotion/styled';
import { useInputCommand } from '../../../hooks/state_selectors/use_input_command';
import { useConsoleStateDispatch } from '../../../hooks/state_selectors/use_console_state_dispatch';
import { useWithCommandArgumentState } from '../../../hooks/state_selectors/use_with_command_argument_state';
import type { CommandArgDefinition, CommandArgumentValueSelectorProps } from '../../../types';

const ArgumentSelectorWrapperContainer = styled.span`
  border: ${({ theme }) => theme.euiTheme.border.thin};
  border-radius: ${({ theme }) => theme.euiTheme.border.radius.small};
  overflow: hidden;
  user-select: none;

  .flexGroup {
    align-items: stretch;
  }

  .selectorContainer {
    padding: 0 ${({ theme }) => theme.euiTheme.size.xs};
    max-width: 25vw;
    display: flex;
    align-items: center;
    height: 100%;
  }

  .argNameContainer {
    background-color: ${({ theme }) => theme.euiTheme.colors.backgroundBaseSubdued};
  }

  .argName {
    padding-left: ${({ theme }) => theme.euiTheme.size.xs};
    height: 100%;
    display: flex;
    align-items: center;
    white-space: nowrap;
  }
`;

// Type to ensure that `SelectorComponent` is defined
type ArgDefinitionWithRequiredSelector = Omit<CommandArgDefinition, 'SelectorComponent'> &
  Pick<Required<CommandArgDefinition>, 'SelectorComponent'>;

export interface ArgumentSelectorWrapperProps {
  argName: string;
  argIndex: number;
  argDefinition: ArgDefinitionWithRequiredSelector;
}

/**
 * handles displaying a custom argument value selector and manages its state
 */
export const ArgumentSelectorWrapper = memo<ArgumentSelectorWrapperProps>(
  ({ argName, argIndex, argDefinition: { SelectorComponent } }) => {
    const dispatch = useConsoleStateDispatch();
    const command = useInputCommand();
    const { valueText, value, store } = useWithCommandArgumentState(argName, argIndex);

    if (!command) {
      // FIXME: PT we should not throw here as that would likely crash the UI.
      throw new Error('ArgumentSelectorWrapper should only be used when a command is entered');
    }

    // Create requestFocus callback that uses proper console dispatch instead of direct state manipulation
    const requestFocus = useCallback(() => {
      dispatch({ type: 'addFocusToKeyCapture' });
    }, [dispatch]);

    const handleSelectorComponentOnChange = useCallback<
      CommandArgumentValueSelectorProps['onChange']
    >(
      (updates) => {
        dispatch({
          type: 'updateInputCommandArgState',
          payload: {
            name: argName,
            instance: argIndex,
            state: updates,
          },
        });
      },
      [argIndex, argName, dispatch]
    );

    return (
      <ArgumentSelectorWrapperContainer className="eui-displayInlineBlock">
        <EuiFlexGroup
          className="flexGroup"
          responsive={false}
          alignItems="center"
          gutterSize="none"
        >
          <EuiFlexItem grow={false} className="argNameContainer">
            <div className="argName">
              <span>{`--${argName}=`}</span>
            </div>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            {/* `div` below ensures that the `SelectorComponent` does NOT inherit the styles of a `flex` container */}
            <div className="selectorContainer noThemeOverrides eui-textTruncate">
              <SelectorComponent
                value={value}
                valueText={valueText ?? ''}
                argName={argName}
                argIndex={argIndex}
                store={store}
                command={command}
                requestFocus={requestFocus}
                onChange={handleSelectorComponentOnChange}
              />
            </div>
          </EuiFlexItem>
        </EuiFlexGroup>
      </ArgumentSelectorWrapperContainer>
    );
  }
);
ArgumentSelectorWrapper.displayName = 'ArgumentSelectorWrapper';
