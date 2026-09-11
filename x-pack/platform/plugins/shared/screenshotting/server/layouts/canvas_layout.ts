/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { LayoutSelectorDictionary, Size } from '../../common/layout';
import { DEFAULT_SELECTORS } from '.';
import type { Layout } from '.';
import type { PdfImageSize } from './base_layout';
import { BaseLayout } from './base_layout';
import { getBrowserZoom } from './get_browser_zoom';

/*
 * This class provides a Layout definition. The PdfMaker class uses this to
 * define a document layout that includes no margins or branding or added logos.
 * The single image that was captured should be the only structural part of the
 * PDF document definition
 */
export class CanvasLayout extends BaseLayout implements Layout {
  public readonly selectors: LayoutSelectorDictionary = { ...DEFAULT_SELECTORS };
  public readonly height: number;
  public readonly width: number;
  private readonly zoom: number;
  private readonly scaledHeight: number;
  private readonly scaledWidth: number;
  private imageSize: PdfImageSize = { height: 0, width: 0 };

  public hasHeader: boolean = false;
  public hasFooter: boolean = false;
  public useReportingBranding: boolean = false;

  constructor(size: Size) {
    super('canvas');
    this.height = size.height;
    this.width = size.width;
    this.zoom = getBrowserZoom(size);
    this.scaledHeight = size.height * this.zoom;
    this.scaledWidth = size.width * this.zoom;
  }

  public getPdfPageOrientation() {
    return undefined;
  }

  public getCssOverridesPath() {
    return undefined;
  }

  public getBrowserViewport() {
    return {
      height: this.scaledHeight,
      width: this.scaledWidth,
    };
  }

  public getBrowserZoom() {
    return this.zoom;
  }

  public getViewport() {
    return {
      height: this.height,
      width: this.width,
      zoom: this.zoom,
    };
  }

  public setPdfImageSize({ height, width }: PdfImageSize): void {
    this.imageSize = { height, width };
  }

  public getPdfImageSize() {
    return this.imageSize;
  }

  public getPdfPageSize(): Size {
    return {
      height: this.height,
      width: this.width,
    };
  }
}
