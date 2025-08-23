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
    },
  });

  const result = await speculator.renderHTML(specHtml);
  console.log(`Rendered spec: ${JSON.stringify(result)}`, Object.keys(result));

  type RenderResponse = {
    sections: string;
    warnings: string[];
    toc?: unknown;
    boilerplate?: unknown;
    references?: unknown;
  };

  const response: RenderResponse = { sections: result.sections, warnings: result.warnings };

  if (result.toc) response.toc = result.toc;
  if (result.boilerplate) response.boilerplate = result.boilerplate;
  if (result.references) response.references = result.references;

  return response;
}
