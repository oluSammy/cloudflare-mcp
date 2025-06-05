// This file is auto-generated. Do not edit manually.
import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';

const SOURCE_PATH = path.join(process.cwd(), 'submodule', 'src', 'i18n', 'gambling-reviews', 'pages');
const OUTPUT_PATH = path.join(process.cwd(), 'src', 'docs-manifests');

// Convert slug to valid manifest name
function getManifestName(slug: string): string {
  // Replace hyphens with underscores and convert to camelCase
  const parts = slug.split('-');
  const camelCase = parts.map((part, index) => 
    index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
  ).join('');
  return `${camelCase}Manifest`;
}

interface DocContent {
  slug: string;
  locale: string;
  title: string;
  description: string;
  frontmatter: any;
  content: string;
  html: string;
  lastModified: string;
}

interface ManifestIndex {
  slugs: string[];
  lastModified: string;
}

async function generateChunkedDocs() {
  console.log('Starting documentation TypeScript generation...');

  // Create output directory if it doesn't exist
  await fs.ensureDir(OUTPUT_PATH);

  // Create a manifest index to store all available slugs
  const manifestIndex: ManifestIndex = {
    slugs: [],
    lastModified: new Date().toISOString()
  };

  try {
    // Get all subdirectories (slugs)
    const entries = await fs.readdir(SOURCE_PATH, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const slug = entry.name;
      const slugPath = path.join(SOURCE_PATH, slug);
      
      // Create a chunk for this slug
      const chunk: Record<string, DocContent> = {};
      
      // Process all locale files for this slug
      const files = await fs.readdir(slugPath);
      
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        
        const locale = path.basename(file, '.md');
        const filePath = path.join(slugPath, file);
        
        try {
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const { data: frontmatter, content: markdown } = matter(fileContent);
          const stat = await fs.stat(filePath);
          
          const docKey = `${slug}:${locale}`;
          const docContent: DocContent = {
            slug,
            locale,
            title: frontmatter.title || slug,
            description: frontmatter.description || '',
            frontmatter,
            content: markdown,
            html: await marked(markdown),
            lastModified: stat.mtime.toISOString()
          };
          
          // Add to chunk
          chunk[docKey] = docContent;
        } catch (error) {
          console.error(`Error processing file ${filePath}:`, error);
        }
      }
      
      // Only add to index and write chunk if it has content
      if (Object.keys(chunk).length > 0) {
        manifestIndex.slugs.push(slug);
        
        // Generate chunk TypeScript content
        const chunkContent = `// This file is auto-generated. Do not edit manually.
import { DocContent } from '../types/docs';

export const ${getManifestName(slug)}: Record<string, DocContent> = ${JSON.stringify(chunk, null, 2)};
`;
        
        // Write chunk file
        const chunkPath = path.join(OUTPUT_PATH, `${slug}.ts`);
        await fs.writeFile(chunkPath, chunkContent, 'utf-8');
        console.log(`Generated chunk for slug: ${slug}`);
      }
    }

    // Generate index TypeScript content
    const indexContent = `// This file is auto-generated. Do not edit manually.
export interface ManifestIndex {
  slugs: string[];
  lastModified: string;
}

export const manifestIndex: ManifestIndex = ${JSON.stringify(manifestIndex, null, 2)};
`;

    // Write index file
    const indexPath = path.join(OUTPUT_PATH, 'index.ts');
    await fs.writeFile(indexPath, indexContent, 'utf-8');

    // Generate types file
    const typesContent = `// This file is auto-generated. Do not edit manually.
export interface DocContent {
  slug: string;
  locale: string;
  title: string;
  description: string;
  frontmatter: any;
  content: string;
  html: string;
  lastModified: string;
}
`;
    
    // Create types directory and write types file
    const typesDir = path.join(process.cwd(), 'src', 'types');
    await fs.ensureDir(typesDir);
    await fs.writeFile(path.join(typesDir, 'docs.ts'), typesContent, 'utf-8');

    console.log(`Successfully generated docs manifests at ${OUTPUT_PATH}`);
    console.log(`Total slugs processed: ${manifestIndex.slugs.length}`);

  } catch (error) {
    console.error('Error generating docs TypeScript:', error);
    process.exit(1);
  }
}

// Run the script
generateChunkedDocs().catch(console.error); 