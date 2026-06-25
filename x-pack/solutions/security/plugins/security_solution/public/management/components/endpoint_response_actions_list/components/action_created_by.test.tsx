/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { AppContextTestRender } from '../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../common/mock/endpoint';
import { ActionCreatedBy } from './action_created_by';
import { EndpointActionGenerator } from '../../../../../common/endpoint/data_generators/endpoint_action_generator';

describe('ActionCreatedBy', () => {
  let appTestContext: AppContextTestRender;
  let renderResult: ReturnType<AppContextTestRender['render']>;
  let generator: EndpointActionGenerator;

  beforeEach(() => {
    appTestContext = createAppRootMockRenderer();
    generator = new EndpointActionGenerator('test');
  });

  describe('when action was created by a user', () => {
    it('should render the user avatar', () => {
      const action = generator.generateActionDetails({ createdBy: 'john.doe' });
      renderResult = appTestContext.render(
        <ActionCreatedBy action={action} data-test-subj="test" />
      );
      expect(renderResult.getByTestId('test-userAvatar')).not.toBeNull();
    });

    it('should render the username', () => {
      const action = generator.generateActionDetails({ createdBy: 'john.doe' });
      renderResult = appTestContext.render(
        <ActionCreatedBy action={action} data-test-subj="test" />
      );
      expect(renderResult.getByTestId('test-userName').textContent).toEqual('john.doe');
    });

    it('should not render a rule link', () => {
      const action = generator.generateActionDetails({ createdBy: 'john.doe', ruleId: undefined });
      renderResult = appTestContext.render(
        <ActionCreatedBy action={action} data-test-subj="test" />
      );
      expect(renderResult.queryByTestId('ruleName')).toBeNull();
    });
  });

  describe('when action was triggered by a rule', () => {
    it('should render "Triggered by rule" text', () => {
      const action = generator.generateActionDetails({
        createdBy: 'unknown',
        ruleId: 'rule-123',
      });
      renderResult = appTestContext.render(
        <ActionCreatedBy action={action} data-test-subj="test" />
      );
      expect(renderResult.getByTestId('test-userName').textContent).toEqual('Triggered by rule');
    });

    it('should render a link to the rule', () => {
      const action = generator.generateActionDetails({
        createdBy: 'unknown',
        ruleId: 'rule-123',
      });
      renderResult = appTestContext.render(
        <ActionCreatedBy action={action} data-test-subj="test" />
      );
      expect(renderResult.getByTestId('test-ruleName')).not.toBeNull();
    });

    it('should not render the user avatar', () => {
      const action = generator.generateActionDetails({
        createdBy: 'unknown',
        ruleId: 'rule-123',
      });
      renderResult = appTestContext.render(
        <ActionCreatedBy action={action} data-test-subj="test" />
      );
      expect(renderResult.queryByTestId('test-userAvatar')).toBeNull();
    });
  });

  describe('when createdBy is "unknown" but no ruleId', () => {
    it('should render the username as "unknown"', () => {
      const action = generator.generateActionDetails({ createdBy: 'unknown', ruleId: undefined });
      renderResult = appTestContext.render(
        <ActionCreatedBy action={action} data-test-subj="test" />
      );
      expect(renderResult.getByTestId('test-userName').textContent).toEqual('unknown');
    });

    it('should render the user avatar', () => {
      const action = generator.generateActionDetails({ createdBy: 'unknown', ruleId: undefined });
      renderResult = appTestContext.render(
        <ActionCreatedBy action={action} data-test-subj="test" />
      );
      expect(renderResult.getByTestId('test-userAvatar')).not.toBeNull();
    });

    it('should not render a rule link', () => {
      const action = generator.generateActionDetails({ createdBy: 'unknown', ruleId: undefined });
      renderResult = appTestContext.render(
        <ActionCreatedBy action={action} data-test-subj="test" />
      );
      expect(renderResult.queryByTestId('ruleName')).toBeNull();
    });
  });
});
