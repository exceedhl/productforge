import { readDraft, saveResult } from "./draftStore";

export function refreshWidget(id: string) {
  if (!id) throw new Error("missing id");
  const draft = readDraft(id);
  if (!draft) return { status: "empty" };
  return { status: "ready", saved: saveResult(draft) };
}

export function registerWidgetRoutes(router: { get: (path: string, handler: () => void) => void }) {
  router.get("/widgets/:id", () => undefined);
}
