export function readDraft(id: string) {
  return { id };
}

export function saveResult(draft: { id: string; stored?: boolean }) {
  draft.stored = true;
  return draft;
}
