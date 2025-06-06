// src/polyfill.ts
if (typeof (globalThis as any).TransformStream === "undefined") {
    try {
      // @ts-ignore
      (globalThis as any).TransformStream = require("stream/web").TransformStream;
    } catch (e) {
      // fallback for older Node.js
      (globalThis as any).TransformStream = require("web-streams-polyfill/ponyfill.es5").TransformStream;
    }
  }