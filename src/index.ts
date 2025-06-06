import "./polyfill"; // This must be the first import!

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DocumentationService } from './services/documentationService';
import { DocContent, DocGroup } from './types/docs';

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "Authless Calculator",
    version: "1.0.0",
  });

  async init() {
    // Simple addition tool
    this.server.tool(
      "add",
      { a: z.number(), b: z.number() },
      async ({ a, b }) => ({
        content: [{ type: "text", text: String(a + b) }],
      })
    );

    // Calculator tool with multiple operations
    this.server.tool(
      "calculate",
      {
        operation: z.enum(["add", "subtract", "multiply", "divide"]),
        a: z.number(),
        b: z.number(),
      },
      async ({ operation, a, b }) => {
        let result: number;
        switch (operation) {
          case "add":
            result = a + b;
            break;
          case "subtract":
            result = a - b;
            break;
          case "multiply":
            result = a * b;
            break;
          case "divide":
            if (b === 0)
              return {
                content: [
                  {
                    type: "text",
                    text: "Error: Cannot divide by zero",
                  },
                ],
              };
            result = a / b;
            break;
        }
        return { content: [{ type: "text", text: String(result) }] };
      }
    );

    this.server.tool("listDocs", {
      title: "List Documentation",
      parameters: {
        type: "object",
        properties: {
          locale: {
            type: "string",
            description: "Optional locale to filter docs by (e.g., 'en', 'es'). If not provided, returns docs grouped by slug with all available locales."
          }
        }
      }
    }, async (params, extra) => {
      const docService = new DocumentationService();
      await docService.initialize();

      const docs = await docService.listDocs(params?.locale || null);

      if (params?.locale) {
        // Single locale mode - we know these are DocContent objects
        const typedDocs = docs as DocContent[];
        return {
          content: [
            { type: "text" as const, text: `📚 Found ${typedDocs.length} documents in locale '${params.locale}'\n\n` },
            ...typedDocs.map(doc => ({
              type: "text" as const,
              text: `### ${doc.title}\n` +
                `🔗 Slug: \`${doc.slug}\`\n` +
                (doc.description ? `📝 ${doc.description}\n` : '') +
                `⏰ Last modified: ${new Date(doc.lastModified).toLocaleString()}\n\n`
            }))
          ]
        };
      }

      // Grouped mode with all locales - we know these are DocGroup objects
      const typedGroups = docs as DocGroup[];
      return {
        content: [
          { type: "text" as const, text: `📚 Found ${typedGroups.length} document groups\n\n` },
          ...typedGroups.map(group => ({
            type: "text" as const,
            text: `### ${group.title}\n` +
              `🔗 Slug: \`${group.slug}\`\n` +
              (group.description ? `📝 ${group.description}\n` : '') +
              `🌐 Available in ${group.locales.length} languages:\n` +
              group.locales.map((loc: { locale: string; title: string; lastModified: Date }) =>
                `  • ${loc.locale}: ${loc.title}` +
                ` (Updated: ${loc.lastModified.toLocaleString()})`
              ).join('\n') +
              '\n\n'
          }))
        ]
      };
    });

    this.server.tool("getDoc", {
      slug: z.string(),
      locale: z.string(),
    }, async ({ slug, locale }) => {
      const docService = new DocumentationService();
      await docService.initialize();

      const doc = await docService.getDoc(slug, locale);

      if (!doc) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ Document not found with slug '${slug}' in any locale.`
          }]
        };
      }

      const typedDoc = doc as DocContent & { warning?: string };
      // Check if we're showing a fallback version
      const header = typedDoc.warning
        ? `⚠️ ${typedDoc.warning}\n\n`
        : `📄 Showing document in ${typedDoc.locale}\n\n`;

      return {
        content: [
          {
            type: "text" as const,
            text: header +
              `# ${typedDoc.title}\n\n` +
              (typedDoc.description ? `> ${typedDoc.description}\n\n` : '') +
              `## Content\n\n` +
              typedDoc.html +
              `\n\n---\n` +
              `🔗 Slug: \`${typedDoc.slug}\`\n` +
              `🌐 Locale: ${typedDoc.locale}\n` +
              `⏰ Last modified: ${new Date(typedDoc.lastModified).toLocaleString()}\n` +
              (typedDoc.frontmatter && Object.keys(typedDoc.frontmatter).length > 0
                ? `\n## Metadata\n\`\`\`json\n${JSON.stringify(typedDoc.frontmatter, null, 2)}\n\`\`\`\n`
                : '')
          }
        ]
      };
    });

    this.server.tool("getLocales", {
      slug: z.string(),
    }, async ({ slug }) => {
      const docService = new DocumentationService();
      await docService.initialize();

      const locales = await docService.getLocales(slug);

      if (!locales.length) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ No locales found for document with slug '${slug}'`
          }]
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `🌐 Available locales for '${slug}':\n\n` +
              locales.map(loc =>
                `### ${loc.locale}\n` +
                `📝 ${loc.title}\n` +
                (loc.description ? `> ${loc.description}\n` : '') +
                `⏰ Last modified: ${loc.lastModified.toLocaleString()}\n`
              ).join('\n')
          }
        ]
      };
    });

    this.server.tool("searchDocs", {
      query: z.string(),
      locale: z.string().optional(),
      slug: z.string().optional()
    }, async ({ query, locale, slug }) => {
      const docService = new DocumentationService();
      await docService.initialize();

      const searchResults = await docService.searchDocs(query, locale, slug);

      return {
        content: [
          {
            type: "text" as const,
            text: `🔍 Search results for "${query}"\n` +
              `Found ${searchResults.total} matches\n\n` +
              searchResults.results.map(result =>
                `### ${result.title} (${result.locale})\n` +
                `🔗 Slug: \`${result.slug}\`\n` +
                (result.description ? `> ${result.description}\n` : '') +
                `\n📑 Matching excerpts:\n` +
                result.excerpts.map(excerpt =>
                  `\`\`\`\n${excerpt.text}\n\`\`\`\n(Line ${excerpt.lineNumber})\n`
                ).join('\n') +
                `\n⏰ Last modified: ${result.lastModified.toLocaleString()}\n` +
                `📊 Relevance score: ${result.score}\n\n`
              ).join('---\n\n')
          }
        ]
      };
    });
  }
}

export default {
  async fetch(request: any, env: any, ctx: any) {
    const url = new URL(request.url);

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    // API Routes
    if (url.pathname.startsWith("/api")) {
      const docService = new DocumentationService();
      await docService.initialize();

      // GET /api/docs - List all docs
      if (url.pathname === "/api/docs") {
        const locale = url.searchParams.get("locale");
        const docs = await docService.listDocs(locale);
        return new Response(JSON.stringify(docs), {
          headers: { "Content-Type": "application/json" }
        });
      }

      // GET /api/docs/:slug - Get specific doc
      const docsMatch = url.pathname.match(/^\/api\/docs\/([^\/]+)$/);
      if (docsMatch) {
        const slug = docsMatch[1];
        const locale = url.searchParams.get("locale") || "en";
        const doc = await docService.getDoc(slug, locale);

        if (!doc) {
          return new Response(JSON.stringify({ error: "Document not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify(doc), {
          headers: { "Content-Type": "application/json" }
        });
      }

      // GET /api/docs/:slug/locales - Get available locales for a doc
      const localesMatch = url.pathname.match(/^\/api\/docs\/([^\/]+)\/locales$/);
      if (localesMatch) {
        const slug = localesMatch[1];
        const locales = await docService.getLocales(slug);

        return new Response(JSON.stringify(locales), {
          headers: { "Content-Type": "application/json" }
        });
      }

      // GET /api/search - Search docs
      if (url.pathname === "/api/search") {
        const query = url.searchParams.get("query");
        if (!query) {
          return new Response(JSON.stringify({ error: "Query parameter 'query' is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const locale = url.searchParams.get("locale");
        const slug = url.searchParams.get("slug");
        const results = await docService.searchDocs(query, locale, slug);

        return new Response(JSON.stringify(results), {
          headers: { "Content-Type": "application/json" }
        });
      }

      // API endpoint not found
      return new Response(JSON.stringify({ error: "API endpoint not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
