export const CODE_INDEX_VERSION = 1;

export interface SourceRange {
  path: string;
  startLine: number;
  endLine: number;
}

export interface CodeFile {
  path: string;
  language: "typescript" | "tsx" | "javascript" | "jsx";
  contentHash: string;
}

export interface CodeSymbol {
  id: string;
  language: string;
  kind: "function" | "class" | "method" | "variable";
  name: string;
  file: string;
  range: SourceRange;
  signature?: string;
  exported: boolean;
  contentHash: string;
}

export interface CodeRelation {
  id: string;
  type: "imports" | "calls";
  sourceSymbolId?: string;
  sourceFile: string;
  targetName: string;
  localName?: string;
  importedName?: string;
  targetFile?: string;
  targetSymbolId?: string;
  callShape?: "identifier" | "member" | "other";
  evidence: SourceRange;
  resolution: "syntactic" | "unresolved";
}

export interface StateAccess {
  id: string;
  kind: "read" | "write";
  symbolId?: string;
  file: string;
  target: string;
  evidence: SourceRange;
}

export interface Entrypoint {
  id: string;
  kind: "export" | "route" | "test";
  symbolId?: string;
  file: string;
  name: string;
  evidence: SourceRange;
}

export interface TestCase {
  id: string;
  file: string;
  title: string;
  suite: string[];
  evidence: SourceRange;
}

export interface CodeIndex {
  schemaVersion: number;
  generator: "tree-sitter";
  root: string;
  files: CodeFile[];
  symbols: CodeSymbol[];
  relations: CodeRelation[];
  stateAccess: StateAccess[];
  entrypoints: Entrypoint[];
  tests: TestCase[];
}

export interface FileFacts {
  file: CodeFile;
  symbols: CodeSymbol[];
  relations: CodeRelation[];
  stateAccess: StateAccess[];
  entrypoints: Entrypoint[];
  tests: TestCase[];
  skeletons: { symbolId: string; text: string }[];
}
