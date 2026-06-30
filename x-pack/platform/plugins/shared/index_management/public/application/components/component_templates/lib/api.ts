/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UiCounterMetricType } from '@kbn/analytics';
import { METRIC_TYPE } from '@kbn/analytics';
import type { SnapshotRepositoriesInfo } from '../../../../../common';
import type {
  ComponentTemplateListItem,
  ComponentTemplateDeserialized,
  ComponentTemplateSerialized,
  ComponentTemplateDatastreams,
  ComponentTemplateMeta,
} from '../shared_imports';
import {
  UIM_COMPONENT_TEMPLATE_DELETE_MANY,
  UIM_COMPONENT_TEMPLATE_DELETE,
  UIM_COMPONENT_TEMPLATE_CREATE,
  UIM_COMPONENT_TEMPLATE_UPDATE,
} from '../constants';
import type { UseRequestHook, SendRequestHook } from './request';

export const getApi = (
  useRequest: UseRequestHook,
  sendRequest: SendRequestHook,
  apiBasePath: string,
  trackMetric: (type: UiCounterMetricType, eventName: string) => void
) => {
  function useLoadComponentTemplates() {
    return useRequest<ComponentTemplateListItem[]>({
      path: `${apiBasePath}/component_templates`,
      method: 'get',
    });
  }

  function useLoadComponentTemplatesDatastream(name: string) {
    return useRequest<ComponentTemplateDatastreams>({
      path: `${apiBasePath}/component_templates/${encodeURIComponent(name)}/datastreams`,
      method: 'get',
    });
  }

  function deleteComponentTemplates(names: string[]) {
    const result = sendRequest({
      path: `${apiBasePath}/component_templates/${names
        .map((name) => encodeURIComponent(name))
        .join(',')}`,
      method: 'delete',
    });

    trackMetric(
      METRIC_TYPE.COUNT,
      names.length > 1 ? UIM_COMPONENT_TEMPLATE_DELETE_MANY : UIM_COMPONENT_TEMPLATE_DELETE
    );

    return result;
  }

  function useLoadComponentTemplate(name: string) {
    return useRequest<ComponentTemplateDeserialized>({
      path: `${apiBasePath}/component_templates/${encodeURIComponent(name)}`,
      method: 'get',
    });
  }

  async function createComponentTemplate(componentTemplate: ComponentTemplateSerialized) {
    const result = await sendRequest({
      path: `${apiBasePath}/component_templates`,
      method: 'post',
      body: JSON.stringify(componentTemplate),
    });

    trackMetric(METRIC_TYPE.COUNT, UIM_COMPONENT_TEMPLATE_CREATE);

    return result;
  }

  async function updateComponentTemplate(componentTemplate: ComponentTemplateDeserialized) {
    const { name } = componentTemplate;
    const result = await sendRequest({
      path: `${apiBasePath}/component_templates/${encodeURIComponent(name)}`,
      method: 'put',
      body: JSON.stringify(componentTemplate),
    });

    trackMetric(METRIC_TYPE.COUNT, UIM_COMPONENT_TEMPLATE_UPDATE);

    return result;
  }

  async function getComponentTemplateDatastreams(name: string) {
    return sendRequest<ComponentTemplateDatastreams>({
      path: `${apiBasePath}/component_templates/${encodeURIComponent(name)}/datastreams`,
      method: 'get',
    });
  }

  async function postDataStreamRollover(name: string) {
    return sendRequest<ComponentTemplateDatastreams>({
      path: `${apiBasePath}/data_streams/${encodeURIComponent(name)}/rollover`,
      method: 'post',
    });
  }

  async function postDataStreamMappingsFromTemplate(name: string) {
    return sendRequest<ComponentTemplateDatastreams>({
      path: `${apiBasePath}/data_streams/${encodeURIComponent(name)}/mappings_from_template`,
      method: 'post',
    });
  }

  function useLoadSnapshotRepositories() {
    return useRequest<SnapshotRepositoriesInfo>({
      path: `${apiBasePath}/snapshot_repositories`,
      method: 'get',
    });
  }

  function useLoadReferencedIndexTemplateMeta(name: string) {
    return useRequest<ComponentTemplateMeta>({
      path: `${apiBasePath}/component_templates/${encodeURIComponent(
        name
      )}/referenced_index_template_meta`,
      method: 'get',
    });
  }

  async function getReferencedIndexTemplateMeta(name: string) {
    return sendRequest<ComponentTemplateMeta>({
      path: `${apiBasePath}/component_templates/${encodeURIComponent(
        name
      )}/referenced_index_template_meta`,
      method: 'get',
    });
  }

  return {
    useLoadComponentTemplates,
    deleteComponentTemplates,
    useLoadComponentTemplate,
    createComponentTemplate,
    updateComponentTemplate,
    useLoadSnapshotRepositories,
    useLoadReferencedIndexTemplateMeta,
    useLoadComponentTemplatesDatastream,
    getReferencedIndexTemplateMeta,
    getComponentTemplateDatastreams,
    postDataStreamRollover,
    postDataStreamMappingsFromTemplate,
  };
};
