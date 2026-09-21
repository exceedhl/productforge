import { layoutArchitecture } from "./architectureLayout.mjs";
import { layoutSequence } from "./sequenceLayout.mjs";
import { renderWalkthroughHtml } from "./svgRenderer.mjs";
import { validateWalkthrough } from "./walkthroughIr.mjs";

export async function renderWalkthroughToHtml(walkthrough, options = {}) {
  const issues = validateWalkthrough(walkthrough);
  if (issues.length > 0) {
    throw new Error(`Walkthrough IR 校验失败：\n- ${issues.join("\n- ")}`);
  }

  const architectures = walkthrough.entities.length > 0
    ? [
        { id: "architecture-overview", title: "架构概览", layout: await layoutArchitecture(walkthrough, { view: "overview" }) },
        { id: "architecture-detail", title: "架构展开", layout: await layoutArchitecture(walkthrough, { view: "detail" }) },
      ]
    : [];
  const sequences = walkthrough.scenarios.map((scenario) => layoutSequence(walkthrough, scenario));
  return renderWalkthroughHtml({
    architectures,
    sequences,
    sourcePath: options.sourcePath,
    title: options.title ?? walkthrough.title ?? "代码导览",
    repository: walkthrough.repository,
    guide: walkthrough.guide,
  });
}
