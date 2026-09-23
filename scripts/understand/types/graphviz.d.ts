declare module "@hpcc-js/wasm/graphviz" {
  export class Graphviz {
    static load(): Promise<Graphviz>;
    layout(dot: string, format: string, engine: string): string;
  }
}
