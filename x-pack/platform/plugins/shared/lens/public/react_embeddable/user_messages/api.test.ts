/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildUserMessagesHelpers } from './api'; // Adjust the import path as necessary
import {
  getLensApiMock,
  getLensAttributesMock,
  getLensInternalApiMock,
  makeEmbeddableServices,
} from '../mocks';
import { faker } from '@faker-js/faker';
import type {
  Datasource,
  SharingSavedObjectProps,
  UserMessage,
  Visualization,
  UserMessagesDisplayLocationId,
} from '@kbn/lens-common';
import { BehaviorSubject } from 'rxjs';
import { EDITOR_MISSING_VIS_TYPE, EDITOR_UNKNOWN_DATASOURCE_TYPE } from '../../user_messages_ids';

const ALL_LOCATIONS: UserMessagesDisplayLocationId[] = [
  'toolbar',
  'embeddableBadge',
  'visualization', // blocks render
  'visualizationOnEmbeddable', // blocks render in embeddable only
  'visualizationInEditor', // blocks render in editor only
  'textBasedLanguagesQueryInput',
  'banner',
  'dimensionButton',
];

function createUserMessage(
  locations: Array<Exclude<UserMessagesDisplayLocationId, 'dimensionButton'>> = ['embeddableBadge'],
  severity: UserMessage['severity'] = 'error',
  id?: string
): UserMessage {
  return {
    uniqueId: id ?? faker.string.uuid(),
    severity: severity || 'error',
    shortMessage: faker.lorem.word(),
    longMessage: () => faker.lorem.sentence(),
    fixableInEditor: false,
    displayLocations: locations.map((location) => ({ id: location })),
  };
}

function buildUserMessagesApi(
  metaInfo?: SharingSavedObjectProps,
  {
    visOverrides,
    dataOverrides,
    getConsumerMessages,
  }: {
    visOverrides?: { id: string } & Partial<Visualization>;
    dataOverrides?: { id: string } & Partial<Datasource>;
    getConsumerMessages?: () => UserMessage[];
  } = {
    visOverrides: { id: 'lnsXY' },
    dataOverrides: { id: 'formBased' },
  }
) {
  const api = getLensApiMock();
  const internalApi = getLensInternalApiMock();
  const services = makeEmbeddableServices(new BehaviorSubject<string>(''), undefined, {
    visOverrides,
    dataOverrides,
  });
  // fill the context with some data
  internalApi.updateVisualizationContext({
    activeAttributes: getLensAttributesMock({
      state: {
        datasourceStates: { formBased: { something: {} } },
        visualization: { activeId: 'lnsXY', state: {} },
        query: { query: '', language: 'kuery' },
        filters: [],
      },
    }),
    activeVisualizationState: {},
    activeDatasourceState: {},
  });
  const onBeforeBadgesRender = jest.fn((messages) => messages);
  const userMessagesApi = buildUserMessagesHelpers(
    api,
    internalApi,
    services,
    onBeforeBadgesRender,
    metaInfo,
    getConsumerMessages
  );
  return { api, internalApi, userMessagesApi, onBeforeBadgesRender };
}

describe('User Messages API', () => {
  describe('discardRuntimeMessages', () => {
    it('should reset the runtime errors', () => {
      const { userMessagesApi } = buildUserMessagesApi();
      // add runtime messages
      const userMessageError = createUserMessage();
      const userMessageWarning = createUserMessage(['embeddableBadge'], 'warning');
      const userMessageInfo = createUserMessage(['embeddableBadge'], 'info');
      userMessagesApi.addUserMessages([userMessageError, userMessageWarning, userMessageInfo]);
      expect(userMessagesApi.getUserMessages('embeddableBadge').length).toEqual(3);
      userMessagesApi.discardRuntimeMessages();
      expect(userMessagesApi.getUserMessages('embeddableBadge').length).toEqual(0);
    });
  });

  describe('updateValidationErrors', () => {
    it('should basically work', () => {
      const { userMessagesApi, internalApi } = buildUserMessagesApi();
      internalApi.updateValidationMessages = jest.fn();
      const messages = Array(3).fill(createUserMessage());
      userMessagesApi.updateValidationErrors(messages);
      expect(internalApi.updateValidationMessages).toHaveBeenCalledWith(messages);
    });
  });

  describe('updateMessages', () => {
    it('should avoid to update duplicate messages', () => {
      const { userMessagesApi, internalApi } = buildUserMessagesApi();
      // start with these 3 messages
      const messages = Array(3)
        .fill(1)
        .map(() => createUserMessage());
      // update the messages
      userMessagesApi.updateMessages(messages);
      expect(internalApi.updateMessages).toHaveBeenCalledTimes(1);
      // now try again with the same messages
      userMessagesApi.updateMessages(messages);
      expect(internalApi.updateMessages).toHaveBeenCalledTimes(1);
      // now try with one extra message
      const messagesWithNewEntry = [...messages, createUserMessage()];
      userMessagesApi.updateMessages(messagesWithNewEntry);
      expect(internalApi.updateMessages).toHaveBeenCalledTimes(2);
    });

    it('should update the messages if there are new messages', () => {
      const { userMessagesApi, internalApi } = buildUserMessagesApi();
      // start with these 3 messages
      const messages = Array(3).fill(createUserMessage());
      // update the messages
      userMessagesApi.updateMessages(messages);
      expect(internalApi.updateMessages).toHaveBeenCalledWith(messages);
      // now try with one extra message
      const messagesWithNewEntry = [...messages, createUserMessage()];
      userMessagesApi.updateMessages(messagesWithNewEntry);
      expect(internalApi.updateMessages).toHaveBeenCalledWith(messagesWithNewEntry);
    });

    it('should update the messages when changing', () => {
      const { userMessagesApi, internalApi } = buildUserMessagesApi();
      // start with these 3 messages
      const messages = Array(3).fill(createUserMessage());
      // update the messages
      userMessagesApi.updateMessages(messages);
      expect(internalApi.updateMessages).toHaveBeenCalledWith(messages);
      // update with new messages
      const newMessages = Array(3).fill(createUserMessage());
      userMessagesApi.updateMessages(newMessages);
      expect(internalApi.updateMessages).toHaveBeenCalledWith(newMessages);
    });
  });

  describe('updateBlockingErrors', () => {
    it('should basically work with a regular Error', () => {
      const { userMessagesApi, internalApi } = buildUserMessagesApi();
      internalApi.updateBlockingError = jest.fn();
      const error = new Error('Something went wrong');
      userMessagesApi.updateBlockingErrors(error);
      expect(internalApi.updateBlockingError).toHaveBeenCalledWith(error);
    });

    it('should work with user messages too', () => {
      const { userMessagesApi, internalApi } = buildUserMessagesApi();
      internalApi.updateBlockingError = jest.fn();
      const userMessage = createUserMessage();
      userMessagesApi.updateBlockingErrors([userMessage]);
      expect(internalApi.updateBlockingError).toHaveBeenCalledWith(
        new Error(userMessage.shortMessage)
      );
    });

    it('should pick only the first error from a list of user messages', () => {
      const { userMessagesApi, internalApi } = buildUserMessagesApi();
      internalApi.updateBlockingError = jest.fn();
      const userMessage = createUserMessage();
      userMessagesApi.updateBlockingErrors([userMessage, createUserMessage(), createUserMessage()]);
      expect(internalApi.updateBlockingError).toHaveBeenCalledWith(
        new Error(userMessage.shortMessage)
      );
    });

    it('should clear out the error when an empty error is passed', () => {
      const { userMessagesApi, internalApi } = buildUserMessagesApi();
      internalApi.updateBlockingError = jest.fn();
      userMessagesApi.updateBlockingErrors(new Error(''));
      expect(internalApi.updateBlockingError).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getUserMessages', () => {
    it('should return empty list for no messages', () => {
      const { userMessagesApi } = buildUserMessagesApi();
      for (const locationId of ALL_LOCATIONS) {
        expect(userMessagesApi.getUserMessages(locationId)).toEqual([]);
      }
    });

    it('should return basic validation for missing parts of the config', () => {
      const { userMessagesApi, internalApi } = buildUserMessagesApi();
      // no doc scenario
      internalApi.updateVisualizationContext({
        ...internalApi.getVisualizationContext(),
        activeAttributes: undefined,
      });
      for (const locationId of ALL_LOCATIONS) {
        expect(userMessagesApi.getUserMessages(locationId).map(({ uniqueId }) => uniqueId)).toEqual(
          [EDITOR_MISSING_VIS_TYPE, EDITOR_UNKNOWN_DATASOURCE_TYPE]
        );
      }
    });

    it('should detect a URL conflict', () => {
      const { userMessagesApi } = buildUserMessagesApi({ outcome: 'conflict' });

      for (const locationId of ALL_LOCATIONS.filter((id) => id !== 'visualization')) {
        expect(userMessagesApi.getUserMessages(locationId)).toEqual([]);
      }
      expect(userMessagesApi.getUserMessages('visualization')).toEqual(
        expect.arrayContaining([expect.objectContaining({ uniqueId: 'url-conflict' })])
      );
    });

    it('should filter messages based on severity criteria', () => {
      const { userMessagesApi } = buildUserMessagesApi();
      const userMessageError = createUserMessage();
      const userMessageWarning = createUserMessage(['embeddableBadge'], 'warning');
      const userMessageInfo = createUserMessage(['embeddableBadge'], 'info');
      userMessagesApi.addUserMessages([userMessageError, userMessageWarning, userMessageInfo]);
      expect(userMessagesApi.getUserMessages('embeddableBadge', { severity: 'error' })).toEqual(
        expect.arrayContaining([userMessageError])
      );
      expect(userMessagesApi.getUserMessages('embeddableBadge', { severity: 'warning' })).toEqual(
        expect.arrayContaining([userMessageWarning])
      );
      expect(userMessagesApi.getUserMessages('embeddableBadge', { severity: 'info' })).toEqual(
        expect.arrayContaining([userMessageInfo])
      );
    });

    it('should filter messages based on locationId', () => {
      const { userMessagesApi } = buildUserMessagesApi();
      const userMessageEmbeddable = createUserMessage(['embeddableBadge']);
      const userMessageVisualization = createUserMessage(['visualization']);
      const userMessageEmbeddableVisualization = createUserMessage([
        'visualization',
        'embeddableBadge',
      ]);
      userMessagesApi.addUserMessages([
        userMessageEmbeddable,
        userMessageVisualization,
        userMessageEmbeddableVisualization,
      ]);
      expect(userMessagesApi.getUserMessages('embeddableBadge').length).toEqual(2);
      expect(userMessagesApi.getUserMessages('visualization').length).toEqual(2);
      expect(userMessagesApi.getUserMessages('visualizationOnEmbeddable').length).toEqual(0);
    });

    it('should return deeper validation messages from both datasource and visualization', () => {
      const visGetUserMessages = jest.fn();
      const datasourceGetUserMessages = jest.fn();
      const { userMessagesApi } = buildUserMessagesApi(undefined, {
        visOverrides: { id: 'lnsXY', getUserMessages: visGetUserMessages },
        dataOverrides: { id: 'formBased', getUserMessages: datasourceGetUserMessages },
      });
      // now add a message, then check that it has been called in both the visualization and datasource
      const userMessageVisualization = createUserMessage(['visualization']);
      userMessagesApi.addUserMessages([userMessageVisualization]);
      userMessagesApi.getUserMessages('visualization');
      expect(visGetUserMessages).toHaveBeenCalled();
      expect(datasourceGetUserMessages).toHaveBeenCalled();
    });

    it('should enable consumers to filter the final list of messages', () => {
      const { userMessagesApi, onBeforeBadgesRender } = buildUserMessagesApi();
      // it should not be called when no messages are avaialble
      userMessagesApi.getUserMessages('embeddableBadge');
      expect(onBeforeBadgesRender).not.toHaveBeenCalled();
      // now add a message, then check that it has been called
      const userMessageEmbeddable = createUserMessage(['embeddableBadge']);
      userMessagesApi.addUserMessages([userMessageEmbeddable]);
      userMessagesApi.getUserMessages('embeddableBadge');
      expect(onBeforeBadgesRender).toHaveBeenCalled();
    });

    it('should not add consumer messages when getConsumerMessages returns empty array', () => {
      const getConsumerMessages = jest.fn(() => []);
      const { userMessagesApi } = buildUserMessagesApi(undefined, {
        visOverrides: { id: 'lnsXY' },
        dataOverrides: { id: 'formBased' },
        getConsumerMessages,
      });

      const result = userMessagesApi.getUserMessages('embeddableBadge');

      expect(result).toHaveLength(0);
      expect(getConsumerMessages).toHaveBeenCalled();
    });

    it('should filter consumer and internal messages based on severity', () => {
      const consumerMessage = createUserMessage(['embeddableBadge'], 'info');
      const getConsumerMessages = jest.fn(() => [consumerMessage]);
      const { userMessagesApi } = buildUserMessagesApi(undefined, {
        visOverrides: { id: 'lnsXY' },
        dataOverrides: { id: 'formBased' },
        getConsumerMessages,
      });
      const internalMessage = createUserMessage(['embeddableBadge'], 'error');
      userMessagesApi.addUserMessages([internalMessage]);

      const result = userMessagesApi.getUserMessages('embeddableBadge');

      expect(result).toHaveLength(2);
      expect(getConsumerMessages).toHaveBeenCalled();

      expect(result[0]).toEqual(expect.objectContaining({ uniqueId: internalMessage.uniqueId }));
      expect(result[1]).toEqual(expect.objectContaining({ uniqueId: consumerMessage.uniqueId }));
    });

    it('should return only consumer messages when no internal messages', () => {
      const consumerMessage = createUserMessage(['embeddableBadge'], 'error');
      const getConsumerMessages = jest.fn(() => [consumerMessage]);
      const { userMessagesApi } = buildUserMessagesApi(undefined, {
        visOverrides: { id: 'lnsXY' },
        dataOverrides: { id: 'formBased' },
        getConsumerMessages,
      });

      const result = userMessagesApi.getUserMessages('embeddableBadge');

      expect(result[0]).toEqual(expect.objectContaining({ uniqueId: consumerMessage.uniqueId }));
    });

    it('when consumer and internal share the same uniqueId, both appear in the result (no dedupe)', () => {
      const sharedId = 'shared-message-id';
      const consumerMessage = createUserMessage(['embeddableBadge'], 'error', sharedId);
      const getConsumerMessages = jest.fn(() => [consumerMessage]);
      const { userMessagesApi } = buildUserMessagesApi(undefined, {
        visOverrides: { id: 'lnsXY' },
        dataOverrides: { id: 'formBased' },
        getConsumerMessages,
      });
      const internalMessage = createUserMessage(['embeddableBadge'], 'warning', sharedId);
      userMessagesApi.addUserMessages([internalMessage]);

      const result = userMessagesApi.getUserMessages('embeddableBadge');
      expect(result).toHaveLength(2);
    });

    it('should return multiple consumer messages', () => {
      const msg1 = createUserMessage(['embeddableBadge'], 'info');
      const msg2 = createUserMessage(['embeddableBadge'], 'warning');
      const getConsumerMessages = jest.fn(() => [msg1, msg2]);
      const { userMessagesApi } = buildUserMessagesApi(undefined, {
        visOverrides: { id: 'lnsXY' },
        dataOverrides: { id: 'formBased' },
        getConsumerMessages,
      });

      const result = userMessagesApi.getUserMessages('embeddableBadge');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({ uniqueId: msg2.uniqueId }));
      expect(result[1]).toEqual(expect.objectContaining({ uniqueId: msg1.uniqueId }));
    });
  });

  describe('addUserMessages', () => {
    it('should basically work', () => {
      const { userMessagesApi } = buildUserMessagesApi();
      expect(userMessagesApi.getUserMessages('embeddableBadge').length).toEqual(0);
      // now add a message, then check that it has been called
      const userMessageEmbeddable = createUserMessage();
      userMessagesApi.addUserMessages([userMessageEmbeddable]);
      expect(userMessagesApi.getUserMessages('embeddableBadge').length).toEqual(1);
    });
  });
});
