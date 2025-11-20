import fs from 'node:fs/promises';
import path from 'node:path';

const SPEC_DIR = (import.meta as any).env?.SPEC_DIR as string;

export type SpecEntry = {
  spec: string;      // e.g., "ujse"
  version: string;      // e.g., "1.0" or "1.1-draft"
  indexPath: string;    // e.g., "ujse/1.0/index.spec.html"
  respecPath?: string;   // e.g., "ujse/1.0/respec.json"
  route: string;        // e.g., "/ujse/1.0/"
  metaData: { [key: string]: any };
};

export async function listSpecs(): Promise<SpecEntry[]> {
  const specs = await fs.readdir(SPEC_DIR);
 
  const entries: SpecEntry[] = [];

  for (const spec of specs) {
    const productDir = path.join(SPEC_DIR, spec);
    const stat = await fs.stat(productDir);
    if (!stat.isDirectory()) continue;
    const versions = await fs.readdir(productDir);

  for (const version of versions) {
      const indexRel = path.join(spec, version, 'index.spec.html');
      const respecRel = path.join(spec, version, 'respec.json');
      try {
        await fs.access(path.join(SPEC_DIR, indexRel));
        let respecPath: string | undefined;
        let metaData: { [key: string]: any } = {};
        try {
          await fs.access(path.join(SPEC_DIR, respecRel));
          metaData = await loadJson(respecRel);
          respecPath = respecRel;
        } catch {
          // no respec.json, that's fine
        }
        entries.push({ spec, version, indexPath: indexRel, respecPath, metaData, route: `/${spec}/${version}/` });
      } catch {
        // skip if no index.spec.html
      }
    }
  }

  // stable ordering: newest-ish last segment first
  entries.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true, sensitivity: 'base' }));
  return entries;
}


export async function loadJson(jsonPath: string): Promise<any> {
  const SPEC_DIR = (import.meta as any).env?.SPEC_DIR as string | undefined;
  if (!SPEC_DIR) throw new Error('SPEC_DIR is not configured');

  const fullPath = path.join(SPEC_DIR, jsonPath);
  const jsonData = await fs.readFile(fullPath, 'utf8');
  return JSON.parse(jsonData);
}