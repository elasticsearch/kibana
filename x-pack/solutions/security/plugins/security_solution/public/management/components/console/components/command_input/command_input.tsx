/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MouseEventHandler } from 'react';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommonProps } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiResizeObserver,
  EuiToolTip,
} from '@elastic/eui';
import styled from '@emotion/styled';
import classNames from 'classnames';
import type { EuiResizeObserverProps } from '@elastic/eui/src/components/observer/resize_observer/resize_observer';
import { useIsMounted } from '@kbn/securitysolution-hook-utils';
import { InputDisplay } from './components/input_display';
import type { ConsoleDataState, ExecuteCommandPayload } from '../console_state/types';
import { useWithInputShowPopover } from '../../hooks/state_selectors/use_with_input_show_popover';
import { EnteredInput } from './lib/entered_input';
import type { InputCaptureProps } from './components/input_capture';
import { InputCapture } from './components/input_capture';
import { useWithInputVisibleState } from '../../hooks/state_selectors/use_with_input_visible_state';
import { useInputHints } from './hooks/use_input_hints';
import { InputPlaceholder } from './components/input_placeholder';
import { useWithInputTextEntered } from '../../hooks/state_selectors/use_with_input_text_entered';
import { InputAreaPopover } from './components/input_area_popover';
import { useConsoleStateDispatch } from '../../hooks/state_selectors/use_console_state_dispatch';
import { useTestIdGenerator } from '../../../../hooks/use_test_id_generator';
import { useDataTestSubj } from '../../hooks/state_selectors/use_data_test_subj';
import { useWithCommandList } from '../../hooks/state_selectors/use_with_command_list';
import { detectAndPreProcessPastedCommand } from './lib/utils';

const CommandInputContainer = styled.div`
  background-color: ${({ theme }) => theme.euiTheme.components.forms.background};
  border-radius: ${({ theme }) => theme.euiTheme.border.radius.medium};
  padding: ${({ theme }) => theme.euiTheme.size.s};
  outline: ${({ theme }) => theme.euiTheme.border.thin};

  border-bottom: ${({ theme }) => theme.euiTheme.border.thick};
  border-bottom-color: transparent;

  &:focus-within {
    border-bottom-color: ${({ theme }) => theme.euiTheme.colors.primary};
  }

  &.error {
    border-bottom-color: ${({ theme }) => theme.euiTheme.colors.danger};
  }

  .textEntered {
    white-space: break-spaces;
  }

  .prompt {
    padding-right: 1ch;
  }

  &.withPopover {
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }

  &.hasFocus {
    // Cursor is defined in '<InputDisplay>' component
    .cursor {
      background-color: ${({ theme }) => theme.euiTheme.colors.textParagraph};
      animation: cursor-blink-animation 1s steps(5, start) infinite;
      -webkit-animation: cursor-blink-animation 1s steps(5, start) infinite;

      @keyframes cursor-blink-animation {
        to {
          visibility: hidden;
        }
      }
      @-webkit-keyframes cursor-blink-animation {
        to {
          visibility: hidden;
        }
      }
    }
  }
`;

export interface CommandInputProps extends CommonProps {
  prompt?: string;
  isWaiting?: boolean;
  focusRef?: InputCaptureProps['focusRef'];
}

export const CommandInput = memo<CommandInputProps>(({ prompt = '', focusRef, ...commonProps }) => {
  useInputHints();
  const isMounted = useIsMounted();
  const getTestId = useTestIdGenerator(useDataTestSubj());
  const dispatch = useConsoleStateDispatch();
  const commands = useWithCommandList();
  const { rightOfCursorText, leftOfCursorText, fullTextEntered, enteredCommand, parsedInput } =
    useWithInputTextEntered();
  const visibleState = useWithInputVisibleState();
  const isPopoverOpen = !!useWithInputShowPopover();

  const [isKeyInputBeingCaptured, setIsKeyInputBeingCaptured] = useState(false);
  const [commandToExecute, setCommandToExecute] = useState<ExecuteCommandPayload | undefined>(
    undefined
  );
  const [popoverWidth, setPopoverWidth] = useState('94vw');

  const _focusRef: InputCaptureProps['focusRef'] = useRef(null);
  const keyCaptureFocusRef = focusRef || _focusRef;

  const inputContainerClassname = useMemo(() => {
    return classNames({
      cmdInput: true,
      hasFocus: isKeyInputBeingCaptured,
      error: visibleState === 'error',
      withPopover: isPopoverOpen,
    });
  }, [isKeyInputBeingCaptured, isPopoverOpen, visibleState]);

  const disableArrowButton = useMemo(() => fullTextEntered.trim().length === 0, [fullTextEntered]);

  const userInput = useMemo(() => {
    return new EnteredInput(leftOfCursorText, rightOfCursorText, parsedInput, enteredCommand);
  }, [enteredCommand, leftOfCursorText, parsedInput, rightOfCursorText]);

  const handleOnResize = useCallback<EuiResizeObserverProps['onResize']>(({ width }) => {
    if (width > 0) {
      setPopoverWidth(`${width}px`);
    }
  }, []);

  const handleSubmitButton = useCallback<MouseEventHandler>(() => {
    setCommandToExecute({
      input: userInput.getFullText(true),
      enteredCommand,
      parsedInput,
    });
  }, [enteredCommand, parsedInput, userInput]);

  const handleOnChangeFocus = useCallback<NonNullable<InputCaptureProps['onChangeFocus']>>(
    (hasFocus) => {
      setIsKeyInputBeingCaptured(hasFocus);
    },
    []
  );

  const handleTypingAreaClick = useCallback<MouseEventHandler>(
    (ev) => {
      // We don't want to trigger input area focus if the click was done from a component that
      // resides OUTSIDE of the typing areas. This can be the case with commands that have an argument
      // value component (aka: argument selector), where events done from inside those components
      // all bubble up through the input area - and this includes events from components inside
      // Portals - like popups - where the HTML element is NOT inside this typing area.
      const { currentTarget, target } = ev;

      if (currentTarget !== target && target instanceof Node && !currentTarget.contains(target)) {
        if (isKeyInputBeingCaptured && keyCaptureFocusRef.current) {
          keyCaptureFocusRef.current.blur();
        }

        return;
      }

      if (keyCaptureFocusRef.current) {
        keyCaptureFocusRef.current.focus();
      }

      if (isPopoverOpen) {
        dispatch({ type: 'updateInputPopoverState', payload: { show: undefined } });
      }
    },
    [dispatch, isKeyInputBeingCaptured, isPopoverOpen, keyCaptureFocusRef]
  );

  const handleInputCapture = useCallback<InputCaptureProps['onCapture']>(
    ({ value, selection, eventDetails }) => {
      const key = eventDetails.code;

      // UP arrow key
      if (key === 'ArrowUp') {
        dispatch({ type: 'removeFocusFromKeyCapture' });
        dispatch({ type: 'updateInputPopoverState', payload: { show: 'input-history' } });

        return;
      }

      // Handle any input value by pre-processing selector arguments (paste, history, etc.)
      let processedValue = value;
      let extractedArgState: Record<string, Array<{ value: string; valueText: string }>> = {};

      if (value) {
        const preProcessResult = detectAndPreProcessPastedCommand(value, commands);
        if (preProcessResult.hasSelectorArguments) {
          processedValue = preProcessResult.cleanedCommand;
          extractedArgState = preProcessResult.extractedArgState;
        }
      }

      // Update the store with the updated text that was entered
      dispatch({
        type: 'updateInputTextEnteredState',
        payload: ({
          leftOfCursorText: prevLeftOfCursor,
          rightOfCursorText: prevRightOfCursor,
          enteredCommand: prevEnteredCommand,
          parsedInput: prevParsedInput,
        }) => {
          const inputText = new EnteredInput(
            prevLeftOfCursor,
            prevRightOfCursor,
            prevParsedInput,
            prevEnteredCommand,
            key
          );

          inputText.addValue(processedValue ?? '', selection);

          switch (key) {
            // BACKSPACE
            case 'Backspace':
              inputText.backspaceChar(selection);
              break;

            // DELETE
            case 'Delete':
              inputText.deleteChar(selection);
              break;

            // ENTER = Execute command and blank out the input area
            case 'Enter':
              // In order to avoid triggering another state update while this one is being processed,
              // we defer the setting of the command to execute until this state update is done
              // This essentially avoids the React warning:
              //    "Cannot update a component (`name here`) while rendering a different component (`name here`)"
              {
                const commandToExecutePayload: ExecuteCommandPayload = {
                  input: inputText.getFullText(true),
                  enteredCommand: prevEnteredCommand as ConsoleDataState['input']['enteredCommand'],
                  parsedInput: prevParsedInput as ConsoleDataState['input']['parsedInput'],
                };
                Promise.resolve().then(() => {
                  if (isMounted()) {
                    setCommandToExecute(commandToExecutePayload);
                  }
                });
                inputText.clear();
              }
              break;

            // ARROW LEFT
            case 'ArrowLeft':
              inputText.moveCursorTo('left');
              break;

            // ARROW RIGHT
            case 'ArrowRight':
              inputText.moveCursorTo('right');
              break;

            // HOME
            case 'Home':
              inputText.moveCursorTo('home');
              break;

            // END
            case 'End':
              inputText.moveCursorTo('end');
              break;
          }

          return {
            leftOfCursorText: inputText.getLeftOfCursorText(),
            rightOfCursorText: inputText.getRightOfCursorText(),
            argState: {
              ...inputText.getArgState(),
              ...extractedArgState,
            },
          };
        },
      });
    },
    [commands, dispatch, isMounted]
  );

  // Execute the command if one was ENTER'd.
  useEffect(() => {
    if (commandToExecute) {
      dispatch({ type: 'executeCommand', payload: commandToExecute });
      setCommandToExecute(undefined);

      // reset input
      dispatch({
        type: 'updateInputTextEnteredState',
        payload: {
          leftOfCursorText: '',
          rightOfCursorText: '',
        },
      });
    }
  }, [commandToExecute, dispatch]);

  return (
    <InputAreaPopover width={popoverWidth}>
      <EuiResizeObserver onResize={handleOnResize}>
        {(resizeRef) => {
          return (
            <CommandInputContainer
              {...commonProps}
              className={inputContainerClassname}
              onClick={handleTypingAreaClick}
              ref={resizeRef}
              data-test-subj={getTestId('cmdInput-container')}
            >
              <EuiFlexGroup responsive={false} alignItems="center" gutterSize="none">
                {prompt && (
                  <EuiFlexItem grow={false} data-test-subj={getTestId('cmdInput-prompt')}>
                    <span className="eui-displayInlineBlock prompt">{prompt}</span>
                  </EuiFlexItem>
                )}
                <EuiFlexItem className="textEntered">
                  <InputCapture
                    onCapture={handleInputCapture}
                    onChangeFocus={handleOnChangeFocus}
                    focusRef={focusRef}
                  >
                    <InputDisplay
                      leftOfCursor={userInput.getLeftOfCursorRenderingContent()}
                      rightOfCursor={userInput.getRightOfCursorRenderingContent()}
                    />
                  </InputCapture>
                  <InputPlaceholder />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content="submit-command" disableScreenReaderOutput>
                    <EuiButtonIcon
                      data-test-subj={getTestId('inputTextSubmitButton')}
                      aria-label="submit-command"
                      iconType="play"
                      color="primary"
                      isDisabled={disableArrowButton}
                      onClick={handleSubmitButton}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              </EuiFlexGroup>
            </CommandInputContainer>
          );
        }}
      </EuiResizeObserver>
    </InputAreaPopover>
  );
});
CommandInput.displayName = 'CommandInput';
