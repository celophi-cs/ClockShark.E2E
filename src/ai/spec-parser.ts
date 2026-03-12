import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import matter from 'gray-matter';
import type { SpecFile, SpecFrontmatter } from './types.js';

/**
 * Extract a named ## section from markdown body.
 * Returns the content between the heading and the next ## heading (or EOF).
 */
function extractSection(body: string, heading: string): string {
  const pattern = new RegExp(
    `^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|\\z)`,
    'm',
  );
  const match = body.match(pattern);
  return match ? match[1].trim() : '';
}

/**
 * Compute a SHA-256 hash of the Steps + Assertions sections.
 * Only these sections affect staleness — editing Context or Data does not.
 */
export function computeSpecHash(steps: string, assertions: string): string {
  const content = `${steps}\n---\n${assertions}`;
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Parse a .spec.md file into a structured SpecFile.
 */
export async function parseSpecFile(filePath: string): Promise<SpecFile> {
  const raw = await readFile(filePath, 'utf-8');
  const { data, content: body } = matter(raw);

  const frontmatter = data as SpecFrontmatter;

  // Validate required frontmatter fields
  if (!frontmatter.id) {
    throw new Error(`Spec ${filePath} is missing required frontmatter field: id`);
  }
  if (!frontmatter.generated_test) {
    throw new Error(`Spec ${filePath} is missing required frontmatter field: generated_test`);
  }

  const context = extractSection(body, 'Context');
  const steps = extractSection(body, 'Steps');
  const assertions = extractSection(body, 'Assertions');
  const specData = extractSection(body, 'Data');

  if (!steps) {
    throw new Error(`Spec ${filePath} is missing required ## Steps section`);
  }

  const currentHash = computeSpecHash(steps, assertions);

  return {
    filePath,
    frontmatter,
    body,
    context,
    steps,
    assertions,
    data: specData,
    currentHash,
  };
}

/**
 * Check whether the generated test is fresh (hash matches).
 */
export function isSpecFresh(spec: SpecFile): boolean {
  return spec.frontmatter.spec_hash !== null &&
    spec.frontmatter.spec_hash === spec.currentHash;
}

/**
 * Update the spec_hash in the frontmatter of the .spec.md file on disk.
 */
export async function updateSpecHash(filePath: string, newHash: string): Promise<void> {
  const raw = await readFile(filePath, 'utf-8');
  const { data, content } = matter(raw);
  data.spec_hash = newHash;
  const updated = matter.stringify(content, data);
  await writeFile(filePath, updated, 'utf-8');
}
