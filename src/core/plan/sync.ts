/**
 * Synchronizacja kart planu: wspolne przesuniecie (w dobach) w obrebie nazwanej grupy.
 * Plan lotu przesuwa widok strzalkami, profil z ta sama grupa pokazuje ten sam dzien.
 */
const offsets = new Map<string, number>();
const listeners = new Map<string, Set<(o: number) => void>>();

export function getOffset(group?: string): number {
  return group ? offsets.get(group) ?? 0 : 0;
}

export function setOffset(group: string | undefined, o: number): void {
  if (!group) return;
  offsets.set(group, o);
  listeners.get(group)?.forEach((fn) => fn(o));
}

export function subscribe(group: string | undefined, fn: (o: number) => void): () => void {
  if (!group) return () => {};
  if (!listeners.has(group)) listeners.set(group, new Set());
  listeners.get(group)!.add(fn);
  return () => listeners.get(group)?.delete(fn);
}
