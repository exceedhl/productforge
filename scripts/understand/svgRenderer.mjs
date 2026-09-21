import {
  BOX,
  TYPE_LABELS,
  boxSlots,
  formatEvidence,
  formatMethodSignature,
  layoutBoxSlots,
  measureBoxHeader,
  measureEdgeLabel,
} from "./boxContent.mjs";

const STATUS_LABELS = {
  context: "Context",
  added: "+ Added",
  removed: "− Removed",
  modified: "~ Modified",
  moved: "↔ Moved / Renamed",
};

const RELATION_LABELS = {
  calls: "调用",
  reads: "读取",
  writes: "写入",
  implements: "实现",
  dependsOn: "依赖",
  publishes: "发布",
  subscribes: "订阅",
};

export function renderWalkthroughHtml({ architecture, architectures, sequences, sourcePath, title, repository, guide }) {
  const architectureViews = architectures?.length
    ? architectures
    : architecture
      ? [{ id: "architecture", title: "架构结构", layout: architecture }]
      : [];
  const pageTitle = title ?? "代码导览";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
  <style>${pageCss()}</style>
</head>
<body>
  <header class="page-header">
    <h1>${escapeHtml(pageTitle)}</h1>
      <p class="meta">${escapeHtml(formatGuideMeta(guide))}</p>
  </header>
  <article class="guide">
    ${renderScopeSection(guide)}
    ${renderProseSection("简要结论", guide?.conclusion)}
    ${renderArchitectureSection(architectureViews, guide)}
    ${renderNamedBlocks("用户路径", guide?.userPaths)}
    ${renderSequenceSection(sequences, guide)}
    ${renderAlgorithms(guide?.algorithms)}
    ${renderProseSection("关键状态与数据来源", guide?.state)}
    ${renderRules(guide?.rules)}
    ${renderReading(guide?.reading)}
  </article>
</body>
</html>
`;
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

function renderArchitectureSection(views, guide) {
  if (views.length === 0) return "";
  const notes = new Map((guide?.architectureNotes ?? []).map((note) => [note.view, note.caption]));
  const figures = views
    .map((view) => {
      const kind = view.id.includes("overview") ? "overview" : "detail";
      const caption = notes.get(kind) ?? (kind === "overview" ? "整图：同一颗粒度，不分层。" : "放大图：展开焦点到 Unit。");
      return `<figure class="figure">
        <figcaption>${escapeHtml(caption)}</figcaption>
        ${renderArchitectureSvg(view.layout)}
      </figure>`;
    })
    .join("");
  const hasLanes = views.some((view) => (view.layout?.lanes ?? []).length > 0);
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
        ${renderSequenceSvg(sequence)}
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

export function renderArchitectureSvg(architecture) {
  const nodes = [...architecture.nodes].sort((a, b) => {
    if (a.isCompound !== b.isCompound) return a.isCompound ? -1 : 1;
    return b.width * b.height - a.width * a.height;
  });
  const laneMarkup = renderArchitectureLanes(architecture);
  const nodeMarkup = nodes.map((node) => renderArchitectureNode(node)).join("");
  const edgeMarkup = architecture.edges.map((edge) => renderArchitectureEdge(edge)).join("");
  return wrapSvg(architecture.width, architecture.height, `${laneMarkup}${nodeMarkup}${edgeMarkup}`);
}

export function renderSequenceSvg(sequence) {
  const gutter = sequence.laneGutter ?? 108;
  const laneMarkup = sequence.laneRanges
    .map((lane) => {
      const titleLines = wrapLaneTitle(lane.title, gutter - 28);
      const titleTop = lane.y + lane.height / 2 - ((titleLines.length - 1) * 16) / 2 + 4;
      const titleBlock = titleLines
        .map(
          (line, index) =>
            `<text class="lane-title" x="${16 + (gutter - 28) / 2}" y="${titleTop + index * 16}" text-anchor="middle">${escapeHtml(line)}</text>`,
        )
        .join("");
      return `
      <rect class="lane" x="${gutter - 8}" y="${lane.y}" width="${sequence.width - gutter - 20}" height="${lane.height}" rx="14" />
      <rect class="lane-rail" x="16" y="${lane.y}" width="${gutter - 28}" height="${lane.height}" rx="10" />
      ${titleBlock}`;
    })
    .join("");
  const lifelines = sequence.participants
    .map(
      (participant) =>
        `<line class="lifeline" x1="${participant.centerX}" y1="${participant.y + participant.height}" x2="${participant.centerX}" y2="${sequence.height - 36}" />`,
    )
    .join("");
  const headers = sequence.participants.map((participant) => renderParticipant(participant)).join("");
  const branchMarkup = renderBranchBoxes(sequence, gutter);
  const steps = sequence.steps.map((step) => renderSequenceStep(step)).join("");
  return wrapSvg(sequence.width, sequence.height, `${laneMarkup}${lifelines}${headers}${branchMarkup}${steps}`);
}

function renderArchitectureLanes(architecture) {
  const lanes = architecture.lanes ?? [];
  if (lanes.length === 0) return "";
  const gutter = architecture.gutter ?? lanes[0]?.gutter ?? 156;
  const width = architecture.width;
  return lanes
    .map((lane, index) => {
      const titleLines = wrapLaneTitle(lane.title, gutter - 40);
      const titleTop = lane.y + lane.height / 2 - ((titleLines.length - 1) * 15) / 2 + 4;
      const titleBlock = titleLines
        .map(
          (line, lineIndex) =>
            `<text class="arch-lane-title" x="${gutter / 2}" y="${titleTop + lineIndex * 16}" text-anchor="middle">${escapeHtml(line)}</text>`,
        )
        .join("");
      const divider =
        index === 0
          ? ""
          : `<line class="arch-lane-divider" x1="0" y1="${lane.y}" x2="${width}" y2="${lane.y}" />`;
      return `
      <rect class="arch-lane layer-${lane.slug}" x="0" y="${lane.y}" width="${width}" height="${lane.height}" />
      <rect class="arch-lane-rail layer-${lane.slug}" x="0" y="${lane.y}" width="${gutter}" height="${lane.height}" />
      ${titleBlock}
      ${divider}`;
    })
    .join("");
}

function layerLegendChips(views) {
  const seen = new Set();
  const chips = [];
  for (const view of views) {
    for (const lane of view.layout?.lanes ?? []) {
      if (seen.has(lane.title)) continue;
      seen.add(lane.title);
      chips.push(`<span class="chip arch-layer layer-${lane.slug}">${escapeHtml(lane.title)}</span>`);
    }
  }
  return chips.join("");
}

function renderArchitectureNode(node) {
  return renderEntityBox(node, "box");
}

function renderArchitectureEdge(edge) {
  const points = shortenLast(edge.points ?? [], 10);
  if (points.length < 2) return "";
  const status = edge.status ?? "context";
  const title = edge.label || RELATION_LABELS[edge.type] || "";
  const protocol = edge.protocol ?? "";
  const labelPoint = edge.labelPoint ?? midpoint(points[0], points[1]);
  const { width: pillWidth, height: pillHeight } = measureEdgeLabel(edge);
  const labelMarkup = title
    ? `<g class="edge-caption" transform="translate(${labelPoint.x} ${labelPoint.y})">
        <rect class="edge-pill" x="${-pillWidth / 2}" y="${-pillHeight - 2}" width="${pillWidth}" height="${pillHeight}" rx="4" />
        <text class="edge-label" text-anchor="middle" y="${protocol ? -18 : -8}">${escapeHtml(title)}</text>
        ${protocol ? `<text class="edge-protocol" text-anchor="middle" y="-4">${escapeHtml(protocol)}</text>` : ""}
      </g>`
    : "";
  return `
    <g class="edge status-${status} kind-${edge.type ?? "dependsOn"}">
      <path d="${roundedOrthogonalPath(points, 12)}" marker-end="url(#arrow-${status})" />
      ${labelMarkup}
    </g>`;
}

function renderParticipant(participant) {
  return renderEntityBox(participant, "participant");
}

function renderEntityBox(node, roleClass) {
  const slots = boxSlots(node, node.contracts ?? []);
  const layout = layoutBoxSlots(slots, node.width);
  const status = node.status ?? "context";
  const classes = [roleClass, `type-${node.type}`, `status-${status}`, node.isCompound ? "compound" : "leaf"]
    .filter(Boolean)
    .join(" ");
  const left = node.x + BOX.padX;
  const right = node.x + node.width - 12;
  let cursorY = node.y + BOX.padTop;
  const typeRow = `
      <text class="type-mark" x="${left}" y="${cursorY}">${escapeHtml(slots.type)}</text>
      ${slots.status ? `<text class="status-badge" x="${right}" y="${cursorY}" text-anchor="end">${escapeHtml(STATUS_LABELS[status])}</text>` : ""}`;
  cursorY += BOX.line;
  const title = renderTextLines("title", layout.titleLines, left, cursorY);
  cursorY += layout.titleLines.length * BOX.line;
  const identity = renderTextLines("identity", layout.identityLines, left, cursorY);
  cursorY += layout.identityLines.length * BOX.line;
  const responsibility = renderTextLines("responsibility", layout.responsibilityLines, left, cursorY);
  cursorY += layout.responsibilityLines.length * BOX.line;
  const ports = layout.contractLines
    .map((name) => {
      const markX = left;
      const markY = cursorY - 9;
      const markup = `
      <g class="contract-port">
        <rect x="${markX}" y="${markY}" width="8" height="8" rx="2" />
        <text x="${markX + 12}" y="${cursorY}">${escapeHtml(name)}</text>
      </g>`;
      cursorY += BOX.line;
      return markup;
    })
    .join("");
  const fileY = node.isCompound ? node.y + measureBoxHeader(node) - 8 : node.y + node.height - 10;
  const file = slots.file
    ? `<text class="file-badge" x="${right}" y="${fileY}" text-anchor="end">${escapeHtml(slots.file)}</text>`
    : "";
  return `
    <g class="${classes}">
      <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.isCompound ? 10 : 8}" />
      ${typeRow}
      ${title}
      ${identity}
      ${responsibility}
      ${ports}
      ${file}
    </g>`;
}

function renderTextLines(className, lines, x, startY) {
  return lines
    .map((line, index) => `<text class="${className}" x="${x}" y="${startY + index * BOX.line}">${escapeHtml(line)}</text>`)
    .join("");
}

function renderSequenceStep(step) {
  if (step.kind === "note") {
    return `
      <g class="note status-${step.status ?? "context"}">
        <rect x="${(step.fromX ?? 0) - 70}" y="${step.y - 22}" width="140" height="36" rx="8" />
        <text x="${step.fromX}" y="${step.y}" text-anchor="middle">${escapeHtml(step.label)}</text>
      </g>`;
  }
  const fromX = step.fromX ?? 0;
  const toX = step.toX ?? fromX;
  const midX = (fromX + toX) / 2;
  const labelLines = step.labelLines ?? [step.label].filter(Boolean);
  const methodLines = step.methodLines ?? [formatMethodSignature(step)].filter(Boolean);
  const detailLines = step.detailLines ?? (step.detail && step.params ? [step.detail] : []);
  const evidenceText = formatEvidence(step.evidence);
  const above = [...labelLines.map((line) => ["message-label", line]), ...methodLines.map((line) => ["message-method", line])];
  const below = detailLines.map((line) => ["message-detail", line]);
  const aboveMarkup = above
    .map(([className, line], index) => {
      const y = step.y - 8 - (above.length - 1 - index) * 16;
      return `<text class="${className}" x="${midX}" y="${y}" text-anchor="middle">${escapeHtml(line)}</text>`;
    })
    .join("");
  const belowMarkup = below
    .map(([className, line], index) => `<text class="${className}" x="${midX}" y="${step.y + 16 + index * 16}" text-anchor="middle">${escapeHtml(line)}</text>`)
    .join("");
  return `
    <g class="message kind-${step.kind} status-${step.status ?? "context"}">
      <line x1="${fromX}" y1="${step.y}" x2="${toX}" y2="${step.y}" />
      <polygon class="arrow-head" points="${arrowHead({ x: toX, y: step.y }, fromX <= toX ? 0 : Math.PI)}" />
      ${aboveMarkup}
      ${belowMarkup}
      ${evidenceText ? `<text class="file-badge" x="${midX}" y="${step.y + 16 + below.length * 16}" text-anchor="middle">${escapeHtml(evidenceText)}</text>` : ""}
    </g>`;
}

function renderBranchBoxes(sequence, gutter = 108) {
  const boxes = [];
  let open = null;
  for (const step of sequence.steps) {
    if (step.branch?.position === "start") {
      open = { label: step.branch.label ?? "alt", startY: step.y - 46 };
    }
    if (step.branch?.position === "end" && open) {
      boxes.push(`
        <g class="branch">
          <rect x="${gutter + 8}" y="${open.startY}" width="${sequence.width - gutter - 36}" height="${step.y - open.startY + 28}" rx="10" />
          <text x="${gutter + 24}" y="${open.startY + 18}">${escapeHtml(open.label)}</text>
        </g>`);
      open = null;
    }
  }
  return boxes.join("");
}

function wrapLaneTitle(title, maxWidth) {
  const characters = [...title];
  const lines = [""];
  for (const character of characters) {
    const candidate = `${lines.at(-1)}${character}`;
    if (estimateLabelWidth(candidate) <= maxWidth || lines.at(-1) === "") {
      lines[lines.length - 1] = candidate;
    } else {
      lines.push(character);
    }
  }
  return lines.slice(0, 3);
}

function estimateLabelWidth(text) {
  let units = 0;
  for (const character of text) {
    units += /[\u2E80-\u9FFF\uF900-\uFAFF]/u.test(character) ? 12 : 7;
  }
  return units;
}

function wrapSvg(width, height, content) {
  const paddedWidth = Math.ceil(width + 48);
  const paddedHeight = Math.ceil(height + 48);
  return `<div class="canvas"><svg viewBox="0 0 ${paddedWidth} ${paddedHeight}" width="${paddedWidth}" height="${paddedHeight}" role="img">
    <defs>
      <marker id="arrow-context" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto">
        <path d="M 1 1 L 11 6 L 1 11 z" />
      </marker>
      <marker id="arrow-added" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto">
        <path d="M 1 1 L 11 6 L 1 11 z" />
      </marker>
      <marker id="arrow-removed" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto">
        <path d="M 1 1 L 11 6 L 1 11 z" />
      </marker>
      <marker id="arrow-modified" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto">
        <path d="M 1 1 L 11 6 L 1 11 z" />
      </marker>
      <marker id="arrow-moved" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto">
        <path d="M 1 1 L 11 6 L 1 11 z" />
      </marker>
    </defs>
    <g transform="translate(24 24)">${content}</g>
  </svg></div>`;
}

function roundedOrthogonalPath(points, radius) {
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const corner = Math.min(radius, distance(previous, current) / 2, distance(current, next) / 2);
    const inbound = moveToward(current, previous, corner);
    const outbound = moveToward(current, next, corner);
    path += ` L ${inbound.x} ${inbound.y} Q ${current.x} ${current.y} ${outbound.x} ${outbound.y}`;
  }
  const last = points.at(-1);
  path += ` L ${last.x} ${last.y}`;
  return path;
}

function shortenLast(points, amount) {
  if (points.length < 2) return points;
  const last = points.at(-1);
  const previous = points.at(-2);
  const length = distance(previous, last);
  if (length <= amount) return points;
  const ratio = (length - amount) / length;
  return [
    ...points.slice(0, -1),
    {
      x: previous.x + (last.x - previous.x) * ratio,
      y: previous.y + (last.y - previous.y) * ratio,
    },
  ];
}

function moveToward(from, to, distanceValue) {
  const length = distance(from, to) || 1;
  return {
    x: from.x + ((to.x - from.x) / length) * distanceValue,
    y: from.y + ((to.y - from.y) / length) * distanceValue,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function arrowHead(point, angle) {
  const size = 8;
  const left = {
    x: point.x - size * Math.cos(angle) + size * 0.55 * Math.sin(angle),
    y: point.y - size * Math.sin(angle) - size * 0.55 * Math.cos(angle),
  };
  const right = {
    x: point.x - size * Math.cos(angle) - size * 0.55 * Math.sin(angle),
    y: point.y - size * Math.sin(angle) + size * 0.55 * Math.cos(angle),
  };
  return `${point.x},${point.y} ${left.x},${left.y} ${right.x},${right.y}`;
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
      overflow: auto;
      padding: 8px;
      background: var(--canvas);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .canvas::-webkit-scrollbar { height: 10px; width: 10px; }
    .canvas::-webkit-scrollbar-thumb { background: oklch(78% 0.02 220); border-radius: 99px; }
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

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function formatRepositoryMeta(repository, sourcePath) {
  const parts = [
    sourcePath,
    repository?.root,
    repository?.commit ? `@${repository.commit}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
