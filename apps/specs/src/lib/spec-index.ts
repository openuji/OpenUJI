import fs from 'node:fs/promises';
import path from 'node:path';

const SPEC_DIR = (import.meta as any).env?.SPEC_DIR as string;

export type SpecEntry = {
  spec: string;      // e.g., "ujse"
  version: string;      // e.g., "1.0" or "1.1-draft"
  indexPath: string;    // e.g., "ujse/1.0/index.spec.html"
  route: string;        // e.g., "/ujse/1.0/"
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
      try {
        await fs.access(path.join(SPEC_DIR, indexRel));
        entries.push({ spec, version, indexPath: indexRel, route: `/${spec}/${version}/` });
      } catch {
        // skip if no index.spec.html
      }
    }
  }

  // stable ordering: newest-ish last segment first
  entries.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true, sensitivity: 'base' }));
  return entries;
}
