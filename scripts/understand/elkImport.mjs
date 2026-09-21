import { createRequire } from "node:module";

const required = createRequire(import.meta.url)("./vendor/elk.bundled.js");
const ELK = typeof required === "function"
  ? required
  : required?.default ?? globalThis.ELK;
if (typeof ELK !== "function") {
  throw new Error("无法加载 vendored ELK.js");
}
export default ELK;
