/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import getAnnotationsRequestMock from './__mocks__/get_annotations_request.json';
import getAnnotationsResponseMock from './__mocks__/get_annotations_response.json';

import { ANNOTATION_TYPE } from '../../../common/constants/annotations';
import type { Annotation } from '@kbn/ml-common-types/annotations';
import { isAnnotations } from '@kbn/ml-common-types/annotations';

import type { DeleteParams, GetResponse, IndexAnnotationArgs } from './annotation';
import { annotationServiceProvider } from '.';

const acknowledgedResponseMock = { acknowledged: true };

const serverlessMock = {
  isServerless: false,
  cpsEnabled: false,
};

const jobIdMock = 'jobIdMock';

describe('annotation_service', () => {
  let mlClusterClientSpy = {} as any;

  beforeEach(() => {
    const callAs = {
      delete: jest.fn(() => Promise.resolve(acknowledgedResponseMock)),
      index: jest.fn(() => Promise.resolve(acknowledgedResponseMock)),
      search: jest.fn(() => Promise.resolve(getAnnotationsResponseMock)),
    };

    mlClusterClientSpy = {
      asCurrentUser: callAs,
      asInternalUser: callAs,
    };
  });

  describe('deleteAnnotation()', () => {
    it('should delete annotation', async () => {
      const { deleteAnnotation } = annotationServiceProvider(mlClusterClientSpy, serverlessMock);
      const mockFunct = mlClusterClientSpy;

      const annotationMockId = 'mockId';
      const deleteParamsMock: DeleteParams = {
        index: '.ml-annotations-000001',
        id: annotationMockId,
        refresh: 'wait_for',
      };

      const response = await deleteAnnotation(annotationMockId);

      expect(mockFunct.asInternalUser.delete.mock.calls[0][0]).toStrictEqual(deleteParamsMock);
      expect(response).toBe(acknowledgedResponseMock);
    });
  });

  describe('getAnnotation()', () => {
    it('should get annotations for specific job', async () => {
      const { getAnnotations } = annotationServiceProvider(mlClusterClientSpy, serverlessMock);
      const mockFunct = mlClusterClientSpy;

      const indexAnnotationArgsMock: IndexAnnotationArgs = {
        jobIds: [jobIdMock],
        earliestMs: 1454804100000,
        latestMs: 1455233399999,
        maxAnnotations: 500,
      };

      const response: GetResponse = await getAnnotations(indexAnnotationArgsMock);

      expect(mockFunct.asInternalUser.search.mock.calls[0][0]).toStrictEqual(
        getAnnotationsRequestMock
      );
      expect(Object.keys(response.annotations)).toHaveLength(1);
      expect(response.annotations[jobIdMock]).toHaveLength(2);
      expect(isAnnotations(response.annotations[jobIdMock])).toBeTruthy();
    });

    it('should throw and catch an error', async () => {
      const mockEsError = {
        statusCode: 404,
        error: 'Not Found',
        message: 'mock error message',
      };

      const mlClusterClientSpyError: any = {
        asInternalUser: {
          search: jest.fn(() => Promise.resolve(mockEsError)),
        },
      };

      const { getAnnotations } = annotationServiceProvider(mlClusterClientSpyError, serverlessMock);

      const indexAnnotationArgsMock: IndexAnnotationArgs = {
        jobIds: [jobIdMock],
        earliestMs: 1454804100000,
        latestMs: 1455233399999,
        maxAnnotations: 500,
      };

      await expect(getAnnotations(indexAnnotationArgsMock)).rejects.toEqual(
        Error(`Annotations couldn't be retrieved from Elasticsearch.`)
      );
    });
  });

  describe('indexAnnotation()', () => {
    it('should index annotation', async () => {
      const { indexAnnotation } = annotationServiceProvider(mlClusterClientSpy, serverlessMock);
      const mockFunct = mlClusterClientSpy;

      const annotationMock: Annotation = {
        annotation: 'Annotation text',
        job_id: jobIdMock,
        timestamp: 1454804100000,
        type: ANNOTATION_TYPE.ANNOTATION,
      };
      const usernameMock = 'usernameMock';

      const response = await indexAnnotation(annotationMock, usernameMock);

      // test if the annotation has been correctly augmented
      const indexParamsCheck = mockFunct.asInternalUser.index.mock.calls[0][0];
      const annotation = indexParamsCheck.body;
      expect(annotation.create_username).toBe(usernameMock);
      expect(annotation.modified_username).toBe(usernameMock);
      expect(typeof annotation.create_time).toBe('number');
      expect(typeof annotation.modified_time).toBe('number');

      expect(response).toBe(acknowledgedResponseMock);
    });

    it('should remove ._id and .key before updating annotation', async () => {
      const { indexAnnotation } = annotationServiceProvider(mlClusterClientSpy, serverlessMock);
      const mockFunct = mlClusterClientSpy;

      const annotationMock: Annotation = {
        _id: 'mockId',
        annotation: 'Updated annotation text',
        job_id: jobIdMock,
        key: 'A',
        timestamp: 1454804100000,
        type: ANNOTATION_TYPE.ANNOTATION,
      };
      const usernameMock = 'usernameMock';

      const response = await indexAnnotation(annotationMock, usernameMock);

      // test if the annotation has been correctly augmented
      const indexParamsCheck = mockFunct.asInternalUser.index.mock.calls[0][0];
      const annotation = indexParamsCheck.body;
      expect(annotation.create_username).toBe(usernameMock);
      expect(annotation.modified_username).toBe(usernameMock);
      expect(typeof annotation.create_time).toBe('number');
      expect(typeof annotation.modified_time).toBe('number');
      expect(typeof annotation._id).toBe('undefined');
      expect(typeof annotation.key).toBe('undefined');

      expect(response).toBe(acknowledgedResponseMock);
    });

    it('should update annotation text and the username for modified_username', async () => {
      const { getAnnotations, indexAnnotation } = annotationServiceProvider(
        mlClusterClientSpy,
        serverlessMock
      );
      const mockFunct = mlClusterClientSpy;

      const indexAnnotationArgsMock: IndexAnnotationArgs = {
        jobIds: [jobIdMock],
        earliestMs: 1454804100000,
        latestMs: 1455233399999,
        maxAnnotations: 500,
      };

      const response: GetResponse = await getAnnotations(indexAnnotationArgsMock);

      const annotation: Annotation = response.annotations[jobIdMock][0];

      const originalUsernameMock = 'usernameMock';
      expect(annotation.create_username).toBe(originalUsernameMock);
      expect(annotation.modified_username).toBe(originalUsernameMock);

      const modifiedAnnotationText = 'Modified Annotation 1';
      annotation.annotation = modifiedAnnotationText;

      const modifiedUsernameMock = 'modifiedUsernameMock';

      await indexAnnotation(annotation, modifiedUsernameMock);

      // test if the annotation has been correctly updated
      const indexParamsCheck = mockFunct.asInternalUser.index.mock.calls[0][0];
      const modifiedAnnotation = indexParamsCheck.body;
      expect(modifiedAnnotation.annotation).toBe(modifiedAnnotationText);
      expect(modifiedAnnotation.create_username).toBe(originalUsernameMock);
      expect(modifiedAnnotation.modified_username).toBe(modifiedUsernameMock);
      expect(typeof modifiedAnnotation.create_time).toBe('number');
      expect(typeof modifiedAnnotation.modified_time).toBe('number');
    });
  });
});
