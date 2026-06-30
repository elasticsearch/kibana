/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { AppContextTestRender } from '../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../common/mock/endpoint';
import { useDataTestSubj } from '../hooks/state_selectors/use_data_test_subj';
import type { CommandExecutionResultProps } from './command_execution_result';
import { CommandExecutionResult } from './command_execution_result';

jest.mock('../hooks/state_selectors/use_data_test_subj');

describe('When using CommandExecutionResult component', () => {
  let render: (
    props?: Partial<CommandExecutionResultProps>
  ) => ReturnType<AppContextTestRender['render']>;
  let renderResult: ReturnType<AppContextTestRender['render']>;
  let useDataTestSubjMock: jest.MockedFunction<typeof useDataTestSubj>;

  beforeEach(() => {
    const mockedContext = createAppRootMockRenderer();

    useDataTestSubjMock = useDataTestSubj as jest.MockedFunction<typeof useDataTestSubj>;
    useDataTestSubjMock.mockReturnValue('consoleTestSubj');

    render = (props = {}) => {
      const { children, ...rest } = props;
      renderResult = mockedContext.render(
        <CommandExecutionResult data-test-subj="test" {...rest}>
          {'children' in props ? children : 'result body content'}
        </CommandExecutionResult>
      );

      return renderResult;
    };
  });

  it('should use the `data-test-subj` prop as the panel test id when provided', () => {
    render();

    expect(renderResult.getByTestId('test')).not.toBeNull();
  });

  it('should fall back to the console `data-test-subj` when no prop is provided', () => {
    render({ 'data-test-subj': undefined });

    expect(renderResult.getByTestId('consoleTestSubj-commandExecutionResult')).not.toBeNull();
  });

  it('should render the children content', () => {
    render({ children: 'hello world' });

    expect(renderResult.getByTestId('test').textContent).toContain('hello world');
  });

  it('should display the success title by default', () => {
    render();

    expect(renderResult.getByTestId('test').textContent).toContain('Action completed.');
  });

  it('should display the submitted success title when `agentType` is `crowdstrike`', () => {
    render({ agentType: 'crowdstrike' });

    expect(renderResult.getByTestId('test').textContent).toContain(
      'Action successfully submitted.'
    );
  });

  it('should display the standard success title for non-crowdstrike agent types', () => {
    render({ agentType: 'endpoint' });

    expect(renderResult.getByTestId('test').textContent).toContain('Action completed.');
  });

  it('should display the canceled title when `showAs` is `canceled`', () => {
    render({ showAs: 'canceled' });

    expect(renderResult.getByTestId('test').textContent).toContain('Action canceled.');
  });

  it('should display the failure title when `showAs` is `failure`', () => {
    render({ showAs: 'failure' });

    expect(renderResult.getByTestId('test').textContent).toContain('Action failed.');
  });

  it('should display a custom title when `title` prop is provided', () => {
    render({ title: 'my custom title' });

    const content = renderResult.getByTestId('test').textContent;

    expect(content).toContain('my custom title');
    expect(content).not.toContain('Action completed.');
  });

  it('should not display the title when `showTitle` is `false`', () => {
    render({ showTitle: false, children: 'only the body' });

    const content = renderResult.getByTestId('test').textContent;

    expect(content).not.toContain('Action completed.');
    expect(content).toContain('only the body');
  });

  describe('and `showAs` is `pending`', () => {
    it('should display only the children and not the title', () => {
      render({ showAs: 'pending', children: 'pending body' });

      const content = renderResult.getByTestId('test').textContent;

      expect(content).toContain('pending body');
      expect(content).not.toContain('Action completed.');
    });

    it('should display the default pending message when no children are provided', () => {
      render({ showAs: 'pending', children: undefined });

      expect(renderResult.getByTestId('test').textContent).toContain('Action pending.');
    });

    it('should render the panel as inline-block', () => {
      render({ showAs: 'pending' });

      expect(renderResult.getByTestId('test').classList).toContain('eui-displayInlineBlock');
    });
  });

  it('should always apply the `font-family-code` class to the panel', () => {
    render();

    expect(renderResult.getByTestId('test').classList).toContain('font-family-code');
  });

  it('should apply a custom `className` to the panel', () => {
    render({ className: 'my-custom-class' });

    expect(renderResult.getByTestId('test').classList).toContain('my-custom-class');
  });
});
