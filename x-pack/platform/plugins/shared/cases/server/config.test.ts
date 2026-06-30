/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ConfigSchema } from './config';

describe('config validation', () => {
  describe('defaults', () => {
    it('sets the defaults correctly', () => {
      expect(ConfigSchema.validate({})).toMatchInlineSnapshot(`
        Object {
          "analytics": Object {
            "index": Object {
              "enabled": false,
            },
          },
          "analyticsV2": Object {
            "enableAdminRoutes": false,
            "enabled": false,
            "reconciliationIntervalMinutes": 30,
            "resetPageDelayMs": 0,
            "resetTaskTimeoutMinutes": 60,
          },
          "attachments": Object {
            "enabled": false,
          },
          "casesRedesign": Object {
            "details": false,
            "list": false,
            "settings": false,
          },
          "enabled": true,
          "files": Object {
            "allowedMimeTypes": Array [
              "image/aces",
              "image/apng",
              "image/avci",
              "image/avcs",
              "image/avif",
              "image/bmp",
              "image/cgm",
              "image/dicom-rle",
              "image/dpx",
              "image/emf",
              "image/example",
              "image/fits",
              "image/g3fax",
              "image/heic",
              "image/heic-sequence",
              "image/heif",
              "image/heif-sequence",
              "image/hej2k",
              "image/hsj2",
              "image/jls",
              "image/jp2",
              "image/jpeg",
              "image/jph",
              "image/jphc",
              "image/jpm",
              "image/jpx",
              "image/jxr",
              "image/jxrA",
              "image/jxrS",
              "image/jxs",
              "image/jxsc",
              "image/jxsi",
              "image/jxss",
              "image/ktx",
              "image/ktx2",
              "image/naplps",
              "image/png",
              "image/prs.btif",
              "image/prs.pti",
              "image/pwg-raster",
              "image/svg+xml",
              "image/t38",
              "image/tiff",
              "image/tiff-fx",
              "image/vnd.adobe.photoshop",
              "image/vnd.airzip.accelerator.azv",
              "image/vnd.cns.inf2",
              "image/vnd.dece.graphic",
              "image/vnd.djvu",
              "image/vnd.dwg",
              "image/vnd.dxf",
              "image/vnd.dvb.subtitle",
              "image/vnd.fastbidsheet",
              "image/vnd.fpx",
              "image/vnd.fst",
              "image/vnd.fujixerox.edmics-mmr",
              "image/vnd.fujixerox.edmics-rlc",
              "image/vnd.globalgraphics.pgb",
              "image/vnd.microsoft.icon",
              "image/vnd.mix",
              "image/vnd.ms-modi",
              "image/vnd.mozilla.apng",
              "image/vnd.net-fpx",
              "image/vnd.pco.b16",
              "image/vnd.radiance",
              "image/vnd.sealed.png",
              "image/vnd.sealedmedia.softseal.gif",
              "image/vnd.sealedmedia.softseal.jpg",
              "image/vnd.svf",
              "image/vnd.tencent.tap",
              "image/vnd.valve.source.texture",
              "image/vnd.wap.wbmp",
              "image/vnd.xiff",
              "image/vnd.zbrush.pcx",
              "image/webp",
              "image/wmf",
              "text/plain",
              "text/csv",
              "text/json",
              "application/json",
              "application/zip",
              "application/x-zip-compressed",
              "application/gzip",
              "application/x-bzip",
              "application/x-bzip2",
              "application/x-7z-compressed",
              "application/x-tar",
              "application/pdf",
            ],
          },
          "incrementalId": Object {
            "enabled": true,
            "taskIntervalMinutes": 10,
            "taskStartDelayMinutes": 10,
          },
          "markdownPlugins": Object {
            "lens": true,
          },
          "stack": Object {
            "enabled": true,
          },
          "templates": Object {
            "enabled": false,
          },
        }
      `);
    });

    it('sets attachments.enabled default to false', () => {
      const config = ConfigSchema.validate({});
      expect(config.attachments.enabled).toBe(false);
    });

    it('allows attachments.enabled to be set to true', () => {
      const config = ConfigSchema.validate({ attachments: { enabled: true } });
      expect(config.attachments.enabled).toBe(true);
    });

    it('allows attachments.enabled to be set to false explicitly', () => {
      const config = ConfigSchema.validate({ attachments: { enabled: false } });
      expect(config.attachments.enabled).toBe(false);
    });
  });
});
