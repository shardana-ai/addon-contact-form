import { defineConfig } from "tsup";

// Two artefacts:
//   1. Widget IIFE: a single self-mounting bundle for forms.shardana.ai/v1/widget.js.
//      Runs in the browser, no module system, picks up params from `data-*`
//      attributes on its own <script> tag.
//   2. Lambda CJS bundle: the AWS Lambda handler with a single exported `handler`,
//      built for Node 20 with cjs output (Lambda runtime expects CommonJS by default).
export default defineConfig([
  {
    entry: { widget: "src/widget/index.ts" },
    outDir: "dist/widget",
    format: ["iife"],
    globalName: "ShardanaContactForm",
    minify: true,
    sourcemap: true,
    target: "es2018",
    dts: false,
    clean: true,
  },
  {
    entry: { submit: "src/lambda/handler.ts" },
    outDir: "dist/lambda",
    format: ["cjs"],
    target: "node20",
    sourcemap: true,
    dts: false,
    clean: false,
    platform: "node",
    bundle: true,
    noExternal: [/.*/],
  },
]);
