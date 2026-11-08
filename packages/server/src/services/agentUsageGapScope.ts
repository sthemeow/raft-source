/** A computer-level gap is not an agent-level fact. Narrow it only when a
 * computer-to-machine link and an overlapping placement both exist. If either
 * is unavailable, keep the server-wide warning rather than hiding uncertainty. */
export function scopeUsageGaps(input: {
  gaps: ReadonlyArray<{ computerId: string; firstEndedAt: Date; lastEndedAt: Date }>;
  computerMachines: ReadonlyMap<string, string | null>;
  placements: ReadonlyArray<{ agentId: string; machineId: string; startedAt: Date; endedAt: Date | null }>;
  overflow?: boolean;
}): { all: boolean; agents: Set<string> } {
  const agents = new Set<string>();
  if (input.overflow) return { all: true, agents };
  const byMachine = new Map<string, Array<(typeof input.placements)[number]>>();
  for (const row of input.placements) {
    const list = byMachine.get(row.machineId) ?? [];
    list.push(row); byMachine.set(row.machineId, list);
  }
  for (const gap of input.gaps) {
    // An sk_machine alias uses its machine ID as the computer ID. If neither
    // lookup resolves to an overlapping placement, the safe fallback is all.
    const linked = input.computerMachines.get(gap.computerId);
    const machineId = linked ?? (byMachine.has(gap.computerId) ? gap.computerId : null);
    if (!machineId) return { all: true, agents };
    const matches = (byMachine.get(machineId) ?? []).filter((row) => row.startedAt <= gap.lastEndedAt && (!row.endedAt || row.endedAt > gap.firstEndedAt));
    if (!matches.length) return { all: true, agents };
    // A warning may begin before the placement snapshot or span a period
    // with no recorded placement. Narrow only if the known windows cover its
    // whole range; otherwise an affected agent might be missing from history.
    const ordered = [...matches].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    let coveredThrough = gap.firstEndedAt.getTime();
    for (const row of ordered) {
      if (row.startedAt.getTime() > coveredThrough) return { all: true, agents };
      coveredThrough = Math.max(coveredThrough, row.endedAt?.getTime() ?? Infinity);
    }
    if (coveredThrough <= gap.lastEndedAt.getTime()) return { all: true, agents };
    for (const row of matches) agents.add(row.agentId);
  }
  return { all: false, agents };
}
