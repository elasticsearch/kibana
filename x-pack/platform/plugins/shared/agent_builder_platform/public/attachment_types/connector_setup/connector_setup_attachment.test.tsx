/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import type { CoreStart } from '@kbn/core/public';
import type { TriggersAndActionsUIPublicPluginStart } from '@kbn/triggers-actions-ui-plugin/public';
import type { ActionButton, CanvasRenderCallbacks } from '@kbn/agent-builder-browser/attachments';
import {
  CONNECTOR_SETUP_ATTACHMENT_TYPE,
  type ConnectorSetupAttachment,
} from '../../../common/attachments';
import { createConnectorSetupAttachmentDefinition } from './connector_setup_attachment';

const buildAttachment = (origin?: string): ConnectorSetupAttachment =>
  ({
    id: 'attachment-1',
    type: CONNECTOR_SETUP_ATTACHMENT_TYPE,
    data: {
      connector_type: '.github',
      connector_type_name: 'GitHub',
      suggested_name: 'Acme GitHub',
      reason: 'Investigate issues across services',
    },
    version: 1,
    versionCount: 1,
    origin,
  } as unknown as ConnectorSetupAttachment);

const setup = () => {
  let formProps: Record<string, any> | null = null;
  const getAddConnectorForm = jest.fn((props: Record<string, any>) => {
    formProps = props;
    return <div data-test-subj="connector-form" />;
  });
  const triggersActionsUi = {
    getAddConnectorForm,
  } as unknown as TriggersAndActionsUIPublicPluginStart;

  const getUrlForApp = jest.fn().mockReturnValue('/app/agent_builder/manage/connectors');
  const application = { getUrlForApp } as unknown as CoreStart['application'];

  const definition = createConnectorSetupAttachmentDefinition({
    triggersActionsUi,
    application,
  });

  return { definition, getAddConnectorForm, getFormProps: () => formProps, getUrlForApp };
};

describe('createConnectorSetupAttachmentDefinition', () => {
  it('labels and badges the card based on connected state', () => {
    const { definition } = setup();
    expect(definition.getLabel(buildAttachment())).toBe('GitHub');

    const setupHeader = definition.getHeader!({ attachment: buildAttachment() });
    expect(setupHeader.icon).toBe('plugs');
    expect(setupHeader.subtitle).toBe('.github');
    expect(setupHeader.badges?.[0].label).toBe('Setup');

    const connectedHeader = definition.getHeader!({ attachment: buildAttachment('c1') });
    expect(connectedHeader.badges?.[0].label).toBe('Connected');
  });

  it('inline "Configure connector" button opens the canvas', () => {
    const { definition } = setup();
    const openCanvas = jest.fn();
    const buttons = definition.getActionButtons!({
      attachment: buildAttachment(),
      isCanvas: false,
      isSidebar: false,
      openCanvas,
      updateOrigin: jest.fn(),
    });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].label).toBe('Configure connector');
    buttons[0].handler();
    expect(openCanvas).toHaveBeenCalled();
  });

  it('exposes no inline buttons in canvas mode (Save is registered dynamically)', () => {
    const { definition } = setup();
    expect(
      definition.getActionButtons!({
        attachment: buildAttachment(),
        isCanvas: true,
        isSidebar: false,
        updateOrigin: jest.fn(),
      })
    ).toEqual([]);
  });

  it('shows a manage link to the Agent Builder Connectors page once connected', () => {
    const { definition, getUrlForApp } = setup();
    const buttons = definition.getActionButtons!({
      attachment: buildAttachment('c1'),
      isCanvas: false,
      isSidebar: false,
      openCanvas: jest.fn(),
      updateOrigin: jest.fn(),
    });
    expect(buttons[0].label).toBe('Manage connector');
    expect(getUrlForApp).toHaveBeenCalledWith('agent_builder', { path: '/manage/connectors' });
    expect(buttons[0].href).toBe('/app/agent_builder/manage/connectors');
  });

  it('renders the embedded form and wires Save -> create -> updateOrigin -> closeCanvas', async () => {
    const { definition, getAddConnectorForm, getFormProps } = setup();
    const registered: ActionButton[][] = [];
    const registerActionButtons = jest.fn((btns: ActionButton[]) => registered.push(btns));
    const updateOrigin = jest.fn().mockResolvedValue(undefined);
    const closeCanvas = jest.fn();
    const callbacks = {
      registerActionButtons,
      updateOrigin,
      closeCanvas,
    } as unknown as CanvasRenderCallbacks;

    render(
      <>
        {definition.renderCanvasContent!(
          { attachment: buildAttachment(), isSidebar: false },
          callbacks
        )}
      </>
    );

    expect(getAddConnectorForm).toHaveBeenCalledWith(
      expect.objectContaining({
        actionTypeId: '.github',
        initialName: 'Acme GitHub',
      })
    );
    expect(screen.getByTestId('connector-form')).toBeInTheDocument();

    const handle = { submit: jest.fn().mockResolvedValue({ id: 'c1', name: 'Acme GitHub' }) };
    act(() => {
      getFormProps()!.onReady(handle);
    });
    // Form reports itself valid -> Save becomes enabled.
    act(() => {
      getFormProps()!.onStateChange({ isSubmitDisabled: false, isSaving: false });
    });

    const saveButton = registered[registered.length - 1][0];
    expect(saveButton.disabled).toBe(false);

    await act(async () => {
      await saveButton.handler();
    });

    expect(handle.submit).toHaveBeenCalled();
    expect(updateOrigin).toHaveBeenCalledWith('c1');
    expect(closeCanvas).toHaveBeenCalled();
  });
});
