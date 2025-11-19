import { Speculator, RespecXrefResolver } from '@openuji/speculator';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

type RenderOptions = { xrefSpecs?: string[] };

const defaultXrefSpecs = ['html', 'dom'];
const xrefResolver = new RespecXrefResolver(); // reuse across renders

export async function renderSpecFromFile(relativeSpecPath: string, opts: RenderOptions = {}) {
  const SPEC_DIR = (import.meta as any).env?.SPEC_DIR as string | undefined;
  if (!SPEC_DIR) throw new Error('SPEC_DIR is not configured');

  const specFilePath = path.join(SPEC_DIR, relativeSpecPath);
  const specFileUrl = pathToFileURL(specFilePath);
  const specHtml = await fs.readFile(specFilePath, 'utf8');

  const speculator = new Speculator({
    baseUrl: new URL('./', specFileUrl).toString(),
    postprocess: {
      xref: [{ resolver: xrefResolver, specs: opts.xrefSpecs ?? defaultXrefSpecs }],
      toc: { render: false}
    },
  });

  const result = await speculator.renderSections(specHtml);
  

  return result;
}

export async function loadJson(jsonPath: string): Promise<any> {
  const SPEC_DIR = (import.meta as any).env?.SPEC_DIR as string | undefined;
  if (!SPEC_DIR) throw new Error('SPEC_DIR is not configured');

  const fullPath = path.join(SPEC_DIR, jsonPath);
  const jsonData = await fs.readFile(fullPath, 'utf8');
  return JSON.parse(jsonData);
}