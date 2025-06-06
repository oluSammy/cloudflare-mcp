import { DocContent, DocGroup } from '../types/docs.js';
import { manifestIndex as generatedManifestIndex, ManifestIndex } from '../docs-manifests';

// Convert slug to valid manifest name (must match the one in generateDocsJson.ts)
function getManifestName(slug: string): string {
  const parts = slug.split('-');
  const camelCase = parts.map((part, index) => 
    index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
  ).join('');

  // If the result starts with a number, prefix it with "site" to make it a valid identifier
  const manifestName = /^\d/.test(camelCase) ? `site${camelCase.charAt(0).toUpperCase() + camelCase.slice(1)}` : camelCase;

  return `${manifestName}Manifest`;
}

// Use the generated manifest index instead of an empty one
const manifestIndex: ManifestIndex = generatedManifestIndex;

export class DocumentationService {
  private docsCache: Map<string, DocContent>;
  private loadedSlugs: Set<string>;
  private lastLoadTime: number;
  private cacheTTL: number;

  constructor() {
    this.docsCache = new Map();
    this.loadedSlugs = new Set();
    this.lastLoadTime = 0;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  async initialize(): Promise<void> {
    console.log('Initializing Documentation Service...');
    // No need to load anything on init - we'll load chunks on demand
    console.log('Documentation Service initialized');
  }

  private async loadChunk(slug: string): Promise<void> {
    if (this.loadedSlugs.has(slug)) {
      return; // Chunk already loaded
    }

    try {
      // Dynamic import of the chunk
      const chunkModule = await import(`../docs-manifests/${slug}.ts`);
      const manifest = chunkModule[getManifestName(slug)];

      // Add all docs from the chunk to the cache
      for (const [key, content] of Object.entries(manifest)) {
        this.docsCache.set(key, content as DocContent);
      }

      this.loadedSlugs.add(slug);
      console.log(`Loaded chunk for slug: ${slug}`);
    } catch (error) {
      console.error(`Error loading chunk for slug ${slug}:`, error);
      throw error;
    }
  }

  private async ensureChunkLoaded(slug: string) {
    const now = Date.now();
    if (now - this.lastLoadTime >= this.cacheTTL) {
      // Cache expired, clear everything
      this.docsCache.clear();
      this.loadedSlugs.clear();
    }

    if (!this.loadedSlugs.has(slug)) {
      await this.loadChunk(slug);
      this.lastLoadTime = now;
    }
  }

  async getDoc(slug: string, locale: string) {
    await this.ensureChunkLoaded(slug);
    
    const docKey = `${slug}:${locale}`;
    const doc = this.docsCache.get(docKey);
    
    if (!doc) {
      // Try to find the document with any locale if specific locale not found
      const fallbackDoc = Array.from(this.docsCache.values())
        .find(d => d.slug === slug);
      
      if (fallbackDoc) {
        return {
          ...fallbackDoc,
          warning: `Document not available in '${locale}', showing '${fallbackDoc.locale}' version`
        };
      }
      return null;
    }
    
    return doc;
  }

  async listDocs(locale: string | null = null) {
    // Load all chunks if we need to list all docs
    await Promise.all(manifestIndex.slugs.map((slug: string) => this.ensureChunkLoaded(slug)));
    
    const docs = Array.from(this.docsCache.values());
    
    if (locale) {
      return docs.filter(doc => doc.locale === locale);
    }

    const grouped: Record<string, DocGroup> = {};
    docs.forEach(doc => {
      if (!grouped[doc.slug]) {
        grouped[doc.slug] = {
          slug: doc.slug,
          title: doc.title,
          description: doc.description,
          locales: []
        };
      }
      grouped[doc.slug].locales.push({
        locale: doc.locale,
        title: doc.title,
        description: doc.description,
        lastModified: new Date(doc.lastModified)
      });
    });

    return Object.values(grouped);
  }

  async getLocales(slug: string) {
    await this.ensureChunkLoaded(slug);
    
    const docs = Array.from(this.docsCache.values())
      .filter(doc => doc.slug === slug);
    
    return docs.map(doc => ({
      locale: doc.locale,
      title: doc.title,
      description: doc.description,
      lastModified: new Date(doc.lastModified)
    }));
  }

  async searchDocs(query: string, locale: string | null = null, slug: string | null = null) {
    if (!query.trim()) {
      return {
        query,
        total: 0,
        results: []
      };
    }

    // If searching within a specific slug, only load that chunk
    if (slug) {
      await this.ensureChunkLoaded(slug);
    } else {
      // Otherwise load all chunks
      await Promise.all(manifestIndex.slugs.map((s: string) => this.ensureChunkLoaded(s)));
    }
    
    const searchQuery = query.toLowerCase();
    const results = [];
    
    for (const doc of this.docsCache.values()) {
      // Filter by locale if specified
      if (locale && doc.locale !== locale) continue;
      
      // Filter by slug if specified
      if (slug && doc.slug !== slug) continue;
      
      const searchableText = [
        doc.title,
        doc.description,
        doc.content
      ].join(' ').toLowerCase();
      
      if (searchableText.includes(searchQuery)) {
        // Find matching excerpts
        const excerpts = this.findExcerpts(doc.content, searchQuery);
        
        results.push({
          slug: doc.slug,
          locale: doc.locale,
          title: doc.title,
          description: doc.description,
          excerpts,
          score: this.calculateRelevanceScore(doc, searchQuery),
          lastModified: new Date(doc.lastModified)
        });
      }
    }
    
    // Sort by relevance score
    results.sort((a, b) => b.score - a.score);
    
    return {
      query,
      total: results.length,
      results: results.slice(0, 20) // Limit to top 20 results
    };
  }

  findExcerpts(content: string, query: string, contextLength = 100) {
    const excerpts = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes(query)) {
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        const excerpt = lines.slice(start, end).join('\n');
        
        excerpts.push({
          text: excerpt,
          lineNumber: i + 1
        });
      }
    }
    
    return excerpts.slice(0, 3); // Limit to 3 excerpts per document
  }

  calculateRelevanceScore(doc: { title: string; description: string; content: string; }, query: string) {
    let score = 0;
    const queryLower = query.toLowerCase();

    // Title match (highest weight)
    if (doc.title.toLowerCase().includes(queryLower)) {
      score += 10;
    }

    // Description match
    if (doc.description.toLowerCase().includes(queryLower)) {
      score += 5;
    }

    // Content match frequency
    const contentLower = doc.content.toLowerCase();
    const matches = (contentLower.match(new RegExp(queryLower, 'g')) || []).length;
    score += matches;
    
    return score;
  }

  // Method to refresh cache manually
  async refreshCache() {
    this.docsCache.clear();
    this.loadedSlugs.clear();
    this.lastLoadTime = 0;
  }
}