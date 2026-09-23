import { createRequire } from "node:module";
import { Language, Parser, type Node } from "web-tree-sitter";

const require = createRequire(import.meta.url);
let ready: Promise<void> | undefined;
const languages = new Map<string, Language>();

export type SourceLanguage = "typescript" | "tsx" | "javascript" | "jsx";

const WASM = {
  typescript: "tree-sitter-typescript/tree-sitter-typescript.wasm",
  tsx: "tree-sitter-typescript/tree-sitter-tsx.wasm",
  javascript: "tree-sitter-javascript/tree-sitter-javascript.wasm",
  jsx: "tree-sitter-typescript/tree-sitter-tsx.wasm",
} as const;

export async function withParsedTree<T>(
  source: string,
  language: SourceLanguage,
  visit: (root: Node) => T,
): Promise<T> {
  await ensureParser();
  const grammar = await loadLanguage(language);
  const parser = new Parser();
  parser.setLanguage(grammar);
  const tree = parser.parse(source);
  try {
    if (!tree) throw new Error(`Tree-sitter 没有生成 ${language} 语法树`);
    return visit(tree.rootNode);
  } finally {
    tree?.delete();
    parser.delete();
  }
}

async function ensureParser() {
  if (!ready) {
    const wasm = require.resolve("web-tree-sitter/web-tree-sitter.wasm");
    ready = Parser.init({ locateFile: () => wasm });
  }
  await ready;
}

async function loadLanguage(language: SourceLanguage) {
  const key = WASM[language];
  const cached = languages.get(key);
  if (cached) return cached;
  const grammar = await Language.load(require.resolve(key));
  languages.set(key, grammar);
  return grammar;
}
