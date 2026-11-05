export type ExistingMaterial = { id: string; name: string };
const normalized = (name: string) => name.trim().toLocaleLowerCase("pt-PT");

/** Reserve local IDs before matching names; never reuse a foreign parent's ID. */
export function reconcileMaterialIds(
  drafts: { id?: string; name: string }[],
  existing: ExistingMaterial[],
  createId: () => string = () => crypto.randomUUID(),
): string[] {
  const names = drafts.map((draft) => normalized(draft.name));
  if (names.some((name) => !name)) throw new Error("Indique o nome de cada material.");
  if (new Set(names).size !== names.length) throw new Error("Não repita o mesmo material.");
  const existingIds = new Set(existing.map((row) => row.id));
  const reserved = drafts.map((draft) => draft.id && existingIds.has(draft.id) ? draft.id : null);
  const explicit = reserved.filter((id): id is string => id !== null);
  if (new Set(explicit).size !== explicit.length) throw new Error("O mesmo material aparece mais de uma vez.");
  const used = new Set(explicit);
  return drafts.map((_, index) => {
    if (reserved[index]) return reserved[index]!;
    const match = existing.find((row) => !used.has(row.id) && normalized(row.name) === names[index]);
    const id = match?.id ?? createId();
    if (used.has(id)) throw new Error("Não foi possível atribuir um identificador único.");
    used.add(id);
    return id;
  });
}

