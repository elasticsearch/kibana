/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { BaseWidgetProps } from './types';
import { WidgetType } from './types';
import { getMeta as defaultGetMeta, setMeta as defaultSetMeta } from '../schema_connector_metadata';
import type { GetMetaFn, SetMetaFn } from '../meta_types';
import { TextWidget } from './components/text_widget';
import { SelectWidget } from './components/select_widget';
import { PasswordWidget } from './components/password_widget';
import { DiscriminatedUnionWidget } from './components/discriminated_union_widget';
import { HiddenWidget } from './components/hidden_widget';
import { ObjectWidget } from './components/object_widget';
import { FileUploadWidget } from './components/file_upload_widget';

const WIDGET_REGISTRY = {
  [WidgetType.Text]: TextWidget,
  [WidgetType.Password]: PasswordWidget,
  [WidgetType.Select]: SelectWidget,
  [WidgetType.FormFieldset]: DiscriminatedUnionWidget,
  [WidgetType.Hidden]: HiddenWidget,
  [WidgetType.Object]: ObjectWidget,
  [WidgetType.FileUpload]: FileUploadWidget,
};

interface MetaFunctionsParam {
  getMeta: GetMetaFn;
  setMeta: SetMetaFn;
}

const getDefaultWidgetForSchema = (schema: z.ZodType, { getMeta, setMeta }: MetaFunctionsParam) => {
  const meta = getMeta(schema);
  if (meta.hidden) {
    return WidgetType.Hidden;
  } else if (schema instanceof z.ZodString) {
    const metaInfo = getMeta(schema);
    if (metaInfo?.sensitive) {
      return WidgetType.Password;
    }
    return WidgetType.Text;
  } else if (schema instanceof z.ZodEnum) {
    return WidgetType.Select;
  } else if (schema instanceof z.ZodDiscriminatedUnion) {
    return WidgetType.FormFieldset;
  } else if (schema instanceof z.ZodObject) {
    return WidgetType.Object;
  } else if (schema instanceof z.ZodLiteral) {
    setMeta(schema, { ...getMeta(schema), disabled: true });
    return WidgetType.Text;
  } else if (schema instanceof z.ZodURL) {
    return WidgetType.Text;
  }

  return undefined;
};

function getWidgetType(schema: z.ZodType, meta: MetaFunctionsParam): WidgetType | undefined {
  const schemaMeta = meta.getMeta(schema);
  if (schemaMeta.hidden) {
    return WidgetType.Hidden;
  }
  return (schemaMeta.widget as WidgetType) || getDefaultWidgetForSchema(schema, meta);
}

export function getWidgetComponent(
  schema: z.ZodType,
  meta: MetaFunctionsParam = { getMeta: defaultGetMeta, setMeta: defaultSetMeta }
): React.FC<BaseWidgetProps<z.ZodType, unknown, unknown>> {
  const widgetType = getWidgetType(schema, meta);

  if (!widgetType) {
    throw new Error(
      `No widget found for schema type: ${schema.constructor.name}. Please specify a widget in the schema metadata.`
    );
  }

  const component = WIDGET_REGISTRY[widgetType];
  if (!component) {
    throw new Error(
      `Widget "${widgetType}" specified in ${schema.constructor.name} metadata is not registered in the widget registry.`
    );
  }

  return component as React.FC<BaseWidgetProps<z.ZodType, unknown, unknown>>;
}
