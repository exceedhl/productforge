import { TYPE_LABELS } from "../calculate/measure.ts";
import type { Guide } from "../model/walkthrough.ts";
import { escapeHtml } from "./participantBox.ts";

export interface DiagramFigure {
  id: string;
  title?: string;
  svg: string;
  lanes?: { title: string; slug: string }[];
}

export function renderGuidePage(input: {
  title?: string;
  guide?: Guide;
  architectures: DiagramFigure[];
  sequences: DiagramFigure[];
  slides?: { kind: string; title: string }[];
  unresolved?: string[];
}) {
  const pageTitle = input.title ?? "代码导览";
  const guide = input.guide;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>${pageCss()}</style>
</head>
<body>
  <header class="page-header">
    <h1>${escapeHtml(pageTitle)}</h1>
    <p class="meta">${escapeHtml(formatGuideMeta(guide))}</p>
  </header>
  <article class="guide">
    ${renderSlides(input.slides, input.unresolved)}
    ${renderScopeSection(guide)}
    ${renderProseSection("简要结论", guide?.conclusion)}
    ${renderArchitectureSection(input.architectures, guide)}
    ${renderNamedBlocks("用户路径", guide?.userPaths)}
    ${renderSequenceSection(input.sequences, guide)}
    ${renderAlgorithms(guide?.algorithms)}
    ${renderProseSection("关键状态与数据来源", guide?.state)}
    ${renderRules(guide?.rules)}
    ${renderReading(guide?.reading)}
  </article>
  <script>${canvasScript()}</script>
</body>
</html>
`;
}

function renderSlides(slides, unresolved: string[] | undefined) {
  if (!slides?.length && !unresolved?.length) return "";
  const items = (slides ?? [])
    .map((slide) => `<li>${escapeHtml(slideLabel(slide.kind))}：${escapeHtml(slide.title)}</li>`)
    .join("");
  const pending = (unresolved ?? [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  return `<section id="slides">
    <h2>导览页</h2>
    ${items ? `<ol>${items}</ol>` : ""}
    ${pending ? `<h3>未确认</h3><ul>${pending}</ul>` : ""}
  </section>`;
}

function slideLabel(kind: string) {
  const labels = {
    summary: "摘要",
    architecture: "架构",
    sequence: "时序",
    state: "状态",
    algorithm: "算法",
    reading: "阅读入口",
    unknowns: "未确认",
  };
  return labels[kind] ?? kind;
}

function renderScopeSection(guide) {
  const viewLabel = guide?.view === "change" ? "变化视图" : "当前视图";
  const scope = guide?.scope?.label ?? "指定区域";
  const baseline = guide?.baseline ? `<p>基线：${escapeHtml(guide.baseline)}</p>` : "";
  return `<section id="scope">
    <h2>范围与视图</h2>
    <p>范围是${escapeHtml(scope)}。展示${escapeHtml(viewLabel)}，只讲当前实现。</p>
    ${baseline}
  </section>`;
}

function renderProseSection(title, body) {
  if (!body) return "";
  return `<section>
    <h2>${escapeHtml(title)}</h2>
    ${renderParagraphs(body)}
  </section>`;
}

function renderArchitectureSection(views: DiagramFigure[], guide?: Guide) {
  if (views.length === 0) return "";
  const notes = new Map((guide?.architectureNotes ?? []).map((note) => [note.view, note.caption]));
  const figures = views
    .map((view) => {
      const kind = view.id.includes("overview") ? "overview" : "detail";
      const caption = notes.get(kind) ?? (kind === "overview" ? "整图：焦点收起，与周边同一颗粒度，不分层。" : "放大图：展开焦点，周边保持单框。");
      return `<figure class="figure">
        <figcaption>${escapeHtml(caption)}</figcaption>
        ${view.svg}
      </figure>`;
    })
    .join("");
  const hasLanes = views.some((view) => (view.lanes ?? []).length > 0);
  const intro = hasLanes
    ? "主方向从上到下。整图不分层。放大图只画有名字、且 Unit 能对上的职责层；嵌套底框只表示包含关系，不与分层颜色混用。箭头只表示跨边界耦合。"
    : "主方向从左到右。没有可对齐的职责层时按参与方关系排列，不画分层色带。嵌套底框表示包含关系。箭头只表示跨边界耦合。";
  return `<section id="architecture">
    <h2>架构结构</h2>
    <p>${intro}</p>
    <div class="legend">
      ${layerLegendChips(views)}
      ${Object.entries(TYPE_LABELS)
        .map(([type, label]) => `<span class="chip type-${type}">${escapeHtml(label)}</span>`)
        .join("")}
    </div>
    ${figures}
  </section>`;
}

function renderNamedBlocks(title, items) {
  if (!items?.length) return "";
  const blocks = items
    .map(
      (item) => `<div class="block">
        <h3>${escapeHtml(item.title)}</h3>
        ${renderParagraphs(item.body)}
      </div>`,
    )
    .join("");
  return `<section>
    <h2>${escapeHtml(title)}</h2>
    ${blocks}
  </section>`;
}

function renderSequenceSection(sequences, guide) {
  if (!sequences.length) return "";
  const notes = guide?.sequenceNotes ?? [];
  const figures = sequences
    .map((sequence, index) => {
      const caption = notes[index] ?? sequence.title;
      return `<figure class="figure">
        <figcaption>${escapeHtml(caption)}</figcaption>
        ${sequence.svg}
      </figure>`;
    })
    .join("");
  return `<section id="sequence">
    <h2>运行顺序</h2>
    <p>时序图只讲这一条路径上谁在何时调用谁。判定和变换见下面的伪代码。</p>
    ${figures}
  </section>`;
}

function renderAlgorithms(items) {
  if (!items?.length) return "";
  const blocks = items
    .map(
      (item) => `<div class="block">
        <h3>${escapeHtml(item.title)}</h3>
        <pre class="pseudocode"><code>${escapeHtml(item.code)}</code></pre>
      </div>`,
    )
    .join("");
  return `<section id="algorithms">
    <h2>算法</h2>
    ${blocks}
  </section>`;
}

function renderRules(items) {
  if (!items?.length) return "";
  const rows = items
    .map((item) => {
      const location = item.location ? `<p class="location">${escapeHtml(item.location)}</p>` : "";
      return `<li>${renderParagraphs(item.text)}${location}</li>`;
    })
    .join("");
  return `<section id="rules">
    <h2>关键实现规则</h2>
    <ol class="rules">${rows}</ol>
  </section>`;
}

function renderReading(items) {
  if (!items?.length) return "";
  const rows = items
    .map((item) => {
      const note = item.note ? ` — ${escapeHtml(item.note)}` : "";
      return `<li><code>${escapeHtml(item.path ?? item.label)}</code>${note}</li>`;
    })
    .join("");
  return `<section id="reading">
    <h2>阅读入口</h2>
    <ol>${rows}</ol>
  </section>`;
}

function renderParagraphs(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

function formatGuideMeta(guide) {
  const viewLabel = guide?.view === "change" ? "变化视图" : "当前视图";
  const scope = guide?.scope?.label;
  return [scope, viewLabel].filter(Boolean).join(" · ");
}

function layerLegendChips(views: DiagramFigure[]) {
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const view of views) {
    for (const lane of view.lanes ?? []) {
      if (seen.has(lane.title)) continue;
      seen.add(lane.title);
      chips.push(`<span class="chip arch-layer layer-${lane.slug}">${escapeHtml(lane.title)}</span>`);
    }
  }
  return chips.join("");
}

function canvasScript() {
  return `
    let hoveredCanvas = null;
    document.addEventListener("keydown", (event) => {
      if (!event.metaKey || event.ctrlKey || event.altKey) return;
      const zoomIn = event.key === "+" || event.key === "=";
      const zoomOut = event.key === "-" || event.key === "_";
      if (!zoomIn && !zoomOut) return;
      const canvas = document.querySelector("[data-canvas].is-filled") || hoveredCanvas || document.querySelector("[data-canvas]");
      if (!canvas || typeof canvas.zoomBy !== "function") return;
      event.preventDefault();
      canvas.zoomBy(zoomIn ? 1.2 : 1 / 1.2);
    }, true);
    for (const canvas of document.querySelectorAll("[data-canvas]")) {
      const svg = canvas.querySelector("svg");
      const tools = canvas.querySelector(".canvas-tools");
      if (!svg) continue;
      const state = { x: 0, y: 0, scale: 1 };
      const apply = () => {
        svg.style.transform = "translate(" + state.x + "px, " + state.y + "px) scale(" + state.scale + ")";
      };
      const zoomAt = (next, px, py) => {
        const scale = Math.min(4, Math.max(0.08, next));
        const ratio = scale / state.scale;
        state.x = px - (px - state.x) * ratio;
        state.y = py - (py - state.y) * ratio;
        state.scale = scale;
        apply();
      };
      const fit = () => {
        const rect = canvas.getBoundingClientRect();
        const width = svg.viewBox.baseVal.width || svg.width.baseVal.value || rect.width;
        const height = svg.viewBox.baseVal.height || svg.height.baseVal.value || rect.height;
        const contain = Math.min(rect.width / width, rect.height / height);
        const scale = canvas.classList.contains("is-filled") ? contain : Math.min(contain, 1);
        state.scale = scale > 0 ? scale : 1;
        state.x = Math.max(12, (rect.width - width * state.scale) / 2);
        state.y = Math.max(12, (rect.height - height * state.scale) / 2);
        apply();
      };
      const setFilled = (filled) => {
        if (filled) {
          for (const other of document.querySelectorAll("[data-canvas].is-filled")) {
            if (other !== canvas) other.classList.remove("is-filled");
          }
        }
        canvas.classList.toggle("is-filled", filled);
        document.body.classList.toggle("canvas-filled", Boolean(document.querySelector("[data-canvas].is-filled")));
        const fillButton = tools?.querySelector("[data-canvas-zoom='fill']");
        if (fillButton) fillButton.textContent = filled ? "还原" : "充满";
        requestAnimationFrame(fit);
      };
      canvas.zoomBy = (factor) => {
        const rect = canvas.getBoundingClientRect();
        zoomAt(state.scale * factor, rect.width / 2, rect.height / 2);
      };
      canvas.addEventListener("pointerenter", () => {
        hoveredCanvas = canvas;
      });
      canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
        state.x -= event.deltaX * unit;
        state.y -= event.deltaY * unit;
        apply();
      }, { passive: false });
      let drag = null;
      canvas.addEventListener("selectstart", (event) => event.preventDefault());
      canvas.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button")) return;
        event.preventDefault();
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: state.x, oy: state.y, moved: false };
        canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener("pointermove", (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) {
          drag.moved = true;
          canvas.classList.add("is-panning");
        }
        if (!drag.moved) return;
        state.x = drag.ox + event.clientX - drag.x;
        state.y = drag.oy + event.clientY - drag.y;
        apply();
      });
      const endDrag = (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        const moved = drag.moved;
        drag = null;
        canvas.classList.remove("is-panning");
        if (!moved) setFilled(!canvas.classList.contains("is-filled"));
      };
      canvas.addEventListener("pointerup", endDrag);
      canvas.addEventListener("pointercancel", endDrag);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && canvas.classList.contains("is-filled")) setFilled(false);
      });
      tools?.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        const action = button?.dataset.canvasZoom;
        if (!action) return;
        const rect = canvas.getBoundingClientRect();
        if (action === "fill") setFilled(!canvas.classList.contains("is-filled"));
        else if (action === "fit") fit();
        else zoomAt(state.scale * (action === "in" ? 1.2 : 1 / 1.2), rect.width / 2, rect.height / 2);
      });
      fit();
    }
  `;
}

function pageCss() {
  return `
    :root {
      --bg: oklch(100% 0 0);
      --panel: oklch(100% 0 0);
      --canvas: oklch(96% 0.005 240);
      --ink: oklch(22% 0.02 220);
      --muted: oklch(42% 0.03 220);
      --line: oklch(88% 0.015 220);
      --primary: oklch(60% 0.14 210);
      --actor: oklch(96% 0.02 230);
      --system: oklch(96% 0.008 240);
      --container: oklch(97% 0.006 240);
      --component: oklch(96% 0.018 160);
      --module: oklch(97% 0.012 80);
      --unit: oklch(100% 0 0);
      --contract: oklch(96% 0.03 300);
      --store: oklch(96% 0.018 230);
      --added: oklch(45% 0.12 150);
      --removed: oklch(48% 0.14 25);
      --modified: oklch(50% 0.12 75);
      --moved: oklch(45% 0.12 250);
    }
    * { box-sizing: border-box; }
    html { background: var(--bg); }
    body {
      margin: 0;
      font-family: Inter, "PingFang SC", "Noto Sans SC", ui-sans-serif, sans-serif;
      color: var(--ink);
      background: var(--bg);
    }
    ::selection { background: oklch(88% 0.06 210); color: var(--ink); }
    .page-header, .guide { padding: 28px 32px 8px; }
    .guide { padding-top: 8px; padding-bottom: 64px; }
    h1 { margin: 0; font-size: 1.75rem; font-weight: 600; letter-spacing: -0.03em; }
    h2 { margin: 2.5rem 0 0.7rem; font-size: 1.25rem; font-weight: 600; letter-spacing: -0.02em; }
    h3 { margin: 1.25rem 0 0.4rem; font-size: 1rem; font-weight: 600; }
    .guide > section > p, .guide .block p, .guide li { max-width: 70ch; line-height: 1.7; }
    .meta, .type-mark, .file-badge, .status-badge, .lane-title, .location, .figure figcaption { color: var(--muted); }
    .meta { margin: 8px 0 0; font-size: 0.8125rem; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 4px; }
    .chip {
      border: 1px solid var(--line);
      background: var(--canvas);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .chip.arch-layer { letter-spacing: 0.04em; text-transform: none; }
    .figure { margin: 16px 0 32px; }
    .figure figcaption { margin: 0 0 8px; font-size: 0.8125rem; }
    .canvas {
      position: relative;
      height: min(72vh, 760px);
      overflow: hidden;
      background: var(--canvas);
      border: 1px solid var(--line);
      border-radius: 8px;
      cursor: grab;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .canvas text { user-select: none; -webkit-user-select: none; }
    .canvas.is-panning { cursor: grabbing; }
    body.canvas-filled { overflow: hidden; }
    .canvas.is-filled {
      position: fixed;
      inset: 0;
      z-index: 40;
      height: auto;
      border: 0;
      border-radius: 0;
    }
    .canvas-tools {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1;
      display: flex;
      gap: 6px;
    }
    .canvas-tools button {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      border-radius: 4px;
      padding: 4px 8px;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .canvas svg {
      position: absolute;
      left: 0;
      top: 0;
      transform-origin: 0 0;
    }
    .pseudocode {
      overflow: auto;
      background: var(--canvas);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px 16px;
      font-family: Menlo, Monaco, Consolas, ui-monospace, monospace;
      font-size: 0.8125rem;
      line-height: 1.55;
    }
    .rules { padding-left: 20px; }
    .location { margin-top: 4px; font-family: Menlo, Monaco, Consolas, ui-monospace, monospace; font-size: 12px; }
    svg { display: block; }
    .box text, .participant text, .message text, .edge-caption text, .arch-lane-title, .lane-title {
      paint-order: stroke;
      stroke: var(--canvas);
      stroke-width: 3px;
      stroke-linejoin: round;
    }
    .box rect, .participant rect, .note rect {
      fill: var(--unit);
      stroke: oklch(32% 0.02 220);
      stroke-width: 1;
    }
    .compound rect { fill: none; stroke: oklch(55% 0.02 220); stroke-dasharray: 3 3; }
    .type-actor rect { fill: var(--actor); }
    .type-system.leaf rect { fill: var(--system); }
    .type-container.leaf rect { fill: var(--container); }
    .type-component.leaf rect { fill: var(--component); }
    .type-module rect { fill: var(--module); }
    .type-contract rect { fill: var(--contract); }
    .type-store rect { fill: var(--store); }
    .status-added rect, .edge.status-added path { stroke: var(--added); stroke-width: 1.8; }
    .status-removed rect, .edge.status-removed path, .message.status-removed line { stroke: var(--removed); stroke-dasharray: 6 4; }
    .status-modified rect, .edge.status-modified path { stroke: var(--modified); stroke-width: 1.8; }
    .status-moved rect, .edge.status-moved path { stroke: var(--moved); stroke-width: 1.8; }
    .title { font-size: 13px; font-weight: 600; fill: var(--ink); }
    .identity, .file-badge, .contract-port text, .message-method { font-family: Menlo, Monaco, Consolas, ui-monospace, monospace; font-size: 11px; }
    .responsibility, .note text { font-size: 12px; fill: var(--muted); }
    .message-label { font-size: 12px; font-weight: 600; fill: var(--ink); }
    .message-method { fill: var(--ink); }
    .message-detail { font-size: 12px; fill: var(--muted); }
    .type-mark, .status-badge, .lane-title { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
    .lifeline {
      fill: none;
      stroke: oklch(72% 0.02 220);
      stroke-width: 1.25;
      stroke-dasharray: 4 6;
      stroke-linecap: round;
    }
    .edge path, .message line { fill: none; stroke: oklch(45% 0.03 220); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .message.kind-return line, .message.kind-async line { stroke-dasharray: 5 4; }
    .arrow-head, marker path { fill: oklch(45% 0.03 220); }
    .edge-pill { fill: var(--panel); stroke: var(--line); stroke-width: 1; }
    .edge-label { font-size: 11px; font-weight: 600; fill: var(--ink); }
    .edge-protocol { font-size: 11px; fill: var(--muted); }
    .lane { fill: oklch(98% 0.006 240); stroke: none; }
    .lane-rail { fill: oklch(94% 0.012 240); stroke: none; }
    .lane-title, .arch-lane-title { font-size: 11px; font-weight: 600; fill: var(--ink); }
    .arch-lane, .arch-lane-rail { stroke: none; }
    .arch-lane.layer-actor { fill: oklch(96% 0.02 230); }
    .arch-lane.layer-presentation { fill: oklch(96% 0.018 80); }
    .arch-lane.layer-interface { fill: oklch(95% 0.03 210); }
    .arch-lane.layer-domain { fill: oklch(96% 0.022 150); }
    .arch-lane.layer-persistence { fill: oklch(96% 0.02 300); }
    .arch-lane.layer-store { fill: oklch(95% 0.02 240); }
    .arch-lane.layer-other { fill: oklch(96% 0.008 240); }
    .arch-lane-rail { fill: color-mix(in oklch, var(--ink) 8%, transparent); }
    .arch-lane-rail.layer-actor { fill: oklch(90% 0.03 230); }
    .arch-lane-rail.layer-presentation { fill: oklch(90% 0.03 80); }
    .arch-lane-rail.layer-interface { fill: oklch(88% 0.045 210); }
    .arch-lane-rail.layer-domain { fill: oklch(90% 0.035 150); }
    .arch-lane-rail.layer-persistence { fill: oklch(90% 0.03 300); }
    .arch-lane-rail.layer-store { fill: oklch(89% 0.03 240); }
    .arch-lane-divider { stroke: oklch(78% 0.02 220); stroke-width: 1; }
    .chip.arch-layer.layer-actor { background: oklch(92% 0.03 230); }
    .chip.arch-layer.layer-presentation { background: oklch(92% 0.03 80); }
    .chip.arch-layer.layer-interface { background: oklch(90% 0.045 210); }
    .chip.arch-layer.layer-domain { background: oklch(92% 0.035 150); }
    .chip.arch-layer.layer-persistence { background: oklch(92% 0.03 300); }
    .chip.arch-layer.layer-store { background: oklch(91% 0.03 240); }
    .contract-port rect { fill: oklch(88% 0.05 300); stroke: oklch(58% 0.1 300); stroke-width: 1; }
    .contract-port text { fill: oklch(38% 0.08 300); }
    .branch rect { fill: none; stroke: oklch(70% 0.02 220); stroke-dasharray: 5 4; }
    .chip.status-added { color: var(--added); }
    .chip.status-removed { color: var(--removed); }
    .chip.status-modified { color: var(--modified); }
    .chip.status-moved { color: var(--moved); }
  `;
}
