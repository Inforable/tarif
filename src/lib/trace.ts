import { db, save } from "./store";
import type { CollectionCase, TraceEvent } from "./types";

let counter = 0;

export function getCase(id: string): CollectionCase {
  const c = db().cases.find((x) => x.id === id);
  if (!c) throw new Error(`Case ${id} not found`);
  return c;
}

/** Append one event to a case's trace and persist immediately, so the live view sees it. */
export function emit(caseId: string, ev: Omit<TraceEvent, "id" | "at" | "attempt"> & { attempt?: number }) {
  const c = getCase(caseId);
  const event: TraceEvent = {
    id: `ev_${Date.now().toString(36)}_${(counter++).toString(36)}`,
    at: Date.now(),
    attempt: ev.attempt ?? Math.max(1, c.attempts.length),
    ...ev,
  };
  c.trace.push(event);
  save();
  return event;
}

export function setPhase(caseId: string, phase: number, status?: CollectionCase["status"]) {
  const c = getCase(caseId);
  c.phase = phase;
  if (status) c.status = status;
  save();
}
