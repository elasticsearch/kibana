/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Ensure, SerializableRecord } from '@kbn/utility-types';

import type { MessagePort } from 'worker_threads';
import { isMainThread, workerData } from 'worker_threads';
import path from 'path';

import { getTemplate } from './get_template';
import type { TemplateLayout } from './types';
import { assetPath } from './constants';
import { _, Printer } from './worker_dependencies';

export interface WorkerData {
  port: MessagePort;
}

export type GenerateReportRequestData = Ensure<
  {
    layout: TemplateLayout;
    title: string;
    content: SerializableRecord[];

    logo?: string;
  },
  SerializableRecord
>;

export interface GeneratePdfRequest {
  data: GenerateReportRequestData;
}

export interface GeneratePdfData {
  buffer: Uint8Array;
  metrics: {
    pages: number;
  };
}

export enum GeneratePdfResponseType {
  Log,
  Data,
  Error,
}

interface GeneratePdfLogResponse {
  type: GeneratePdfResponseType.Log;
  data?: GeneratePdfData;
  error?: string;
  message?: string;
}

interface GeneratePdfDataResponse {
  type: GeneratePdfResponseType.Data;
  data?: GeneratePdfData;
  error?: string;
  message?: string;
}

interface GeneratePdfErrorResponse {
  type: GeneratePdfResponseType.Error;
  data?: GeneratePdfData;
  error?: string;
  message?: string;
}
export type GeneratePdfResponse =
  | GeneratePdfLogResponse
  | GeneratePdfDataResponse
  | GeneratePdfErrorResponse;

if (!isMainThread) {
  const { port } = workerData as WorkerData;
  port.on('message', execute);
}

const getPageCount = (pdfDoc: PDFKit.PDFDocument): number => {
  const pageRange = pdfDoc.bufferedPageRange();
  if (!pageRange) {
    return 0;
  }
  const { count, start } = pageRange;

  return start + count;
};

async function execute({ data: { layout, logo, title, content } }: GeneratePdfRequest) {
  const { port } = workerData as WorkerData;
  port.postMessage({
    type: GeneratePdfResponseType.Log,
    message: 'Starting execution',
  });

  try {
    const tableBorderWidth = 1;

    const fontPath = (filename: string) => path.resolve(assetPath, 'fonts', filename);

    const fonts = {
      Roboto: {
        normal: fontPath('roboto/Roboto-Regular.ttf'),
        bold: fontPath('roboto/Roboto-Medium.ttf'),
        italics: fontPath('roboto/Roboto-Italic.ttf'),
        bolditalics: fontPath('roboto/Roboto-Italic.ttf'),
      },
      'noto-cjk': {
        // Roboto does not support CJK characters, so we'll fall back on this font if we detect them.
        normal: fontPath('noto/NotoSansCJKtc-Regular.ttf'),
        bold: fontPath('noto/NotoSansCJKtc-Medium.ttf'),
        italics: fontPath('noto/NotoSansCJKtc-Regular.ttf'),
        bolditalics: fontPath('noto/NotoSansCJKtc-Medium.ttf'),
      },
    };

    port.postMessage({
      type: GeneratePdfResponseType.Log,
      message: 'Initializing PDF printer',
    });

    const printer = new Printer(fonts);

    const docDefinition = _.assign(getTemplate(layout, logo, title, tableBorderWidth, assetPath), {
      content: _.cloneDeepWith(content, (value) =>
        // The `pdfkit` library is using `Buffer.from(new Uint8Array(src))` construction to cast the image source.
        // According to the Node.js docs, it will create a copy of the source `ArrayBuffer` which should be avoided.
        // @see https://nodejs.org/api/buffer.html#static-method-bufferfrombuffer
        // @see https://github.com/foliojs-fork/pdfkit/blob/master/lib/image.js#L16
        value instanceof Uint8Array
          ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
          : undefined
      ),
    });

    port.postMessage({
      type: GeneratePdfResponseType.Log,
      message: 'Generating document stream',
    });

    const pdfDoc = printer.createPdfKitDocument(docDefinition, {
      tableLayouts: {
        noBorder: {
          // format is function (i, node) { ... };
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
      },
    });

    if (!pdfDoc) {
      throw new Error('Document stream has not been generated');
    }

    port.postMessage({
      type: GeneratePdfResponseType.Log,
      message: 'Document stream has been generated',
    });

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const buffers: Buffer[] = [];
      pdfDoc.on('error', reject);
      pdfDoc.on('data', (data: Buffer) => {
        buffers.push(data);
      });
      pdfDoc.on('end', () => {
        const output = Buffer.allocUnsafeSlow(
          buffers.reduce((length, chunk) => length + chunk.length, 0)
        );
        let offset = 0;
        for (const chunk of buffers) {
          offset += chunk.copy(output, offset);
        }
        resolve(output);
      });
      pdfDoc.end();
    });

    port.postMessage({
      type: GeneratePdfResponseType.Log,
      message: 'PDF buffer has been generated',
    });

    const successResponse: GeneratePdfResponse = {
      type: GeneratePdfResponseType.Data,
      data: {
        buffer,
        metrics: {
          pages: getPageCount(pdfDoc),
        },
      },
    };
    port.postMessage(successResponse, [buffer.buffer as ArrayBuffer]);
  } catch (error) {
    const errorResponse: GeneratePdfResponse = {
      type: GeneratePdfResponseType.Error,
      error: error.message,
    };
    port.postMessage(errorResponse);
  } finally {
    process.nextTick(() => {
      process.exit(0);
    });
  }
}
