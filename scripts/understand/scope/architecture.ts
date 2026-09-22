const INNER_TYPES = new Set(["module", "unit", "contract"]);

export function resolveFocusId(walkthrough) {
  const participants = walkthrough.participants ?? [];
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  if (walkthrough.focusParticipantId && byId.has(walkthrough.focusParticipantId)) {
    return walkthrough.focusParticipantId;
  }
  const candidates = participants.filter((participant) => hasInnerDescendant(participant.id, participants));
  return candidates.length === 1 ? candidates[0].id : undefined;
}

export function projectArchitecture(walkthrough, focusId, collapseFocus) {
  const byId = new Map<string, any>(walkthrough.participants.map((participant) => [participant.id, participant]));
  const shown = scopeIds(walkthrough, focusId, byId);
  let participants = walkthrough.participants.filter((participant) => shown.has(participant.id));
  if (collapseFocus) {
    const hidden = descendantIds(focusId, participants);
    hidden.delete(focusId);
    participants = participants.filter((participant) => !hidden.has(participant.id));
  }
  const visible = new Set(participants.map((participant) => participant.id));
  const lift = (id) => {
    let current = byId.get(id);
    while (current && !visible.has(current.id)) {
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return current;
  };
  return { ...walkthrough, participants, relations: liftRelations(walkthrough.relations, lift) };
}

export function shouldOmitOverview(view) {
  const boxes = view.participants.filter((participant) => participant.type !== "contract");
  return boxes.length < 2 || view.relations.length === 0;
}

function scopeIds(walkthrough, focusId, byId) {
  const shown = descendantIds(focusId, walkthrough.participants);
  for (const relation of walkthrough.relations ?? []) {
    const sourceIn = shown.has(relation.sourceId);
    const targetIn = shown.has(relation.targetId);
    if (sourceIn === targetIn) continue;
    shown.add(relation.sourceId);
    shown.add(relation.targetId);
  }
  for (const id of [...shown]) addAncestors(id, byId, shown);
  return shown;
}

function descendantIds(rootId, participants) {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const participant of participants) {
      if (!participant.parentId || !ids.has(participant.parentId) || ids.has(participant.id)) continue;
      ids.add(participant.id);
      grew = true;
    }
  }
  return ids;
}

function addAncestors(id, byId, shown) {
  let current = byId.get(id);
  while (current?.parentId && byId.has(current.parentId)) {
    if (shown.has(current.parentId)) return;
    shown.add(current.parentId);
    current = byId.get(current.parentId);
  }
}

function hasInnerDescendant(id, participants) {
  for (const participant of participants) {
    if (participant.parentId !== id) continue;
    if (INNER_TYPES.has(participant.type)) return true;
    if (hasInnerDescendant(participant.id, participants)) return true;
  }
  return false;
}

function liftRelations(relations, lift) {
  const seen = new Set();
  const lifted: { id: string; type: string; sourceId: string; targetId: string; label?: string; protocol?: string }[] = [];
  for (const relation of relations) {
    if (relation.type === "implements") continue;
    const source = lift(relation.sourceId);
    const target = lift(relation.targetId);
    if (!source || !target || source.id === target.id) continue;
    const key = `${relation.type}:${source.id}:${target.id}:${relation.protocol ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lifted.push({ ...relation, sourceId: source.id, targetId: target.id });
  }
  return lifted;
}
