/**
 * Shared shutdown decision for the dashboard examples.
 *
 * All three dashboards end a run the same way: cancel resting orders, ask the
 * tracker what is still open, print either "flat" or a warning naming every
 * open leg, and exit non-zero if anything is still open. The exit code is the
 * part that matters — a bounded run in a script or CI is only safe to chain
 * off if "finished holding inventory" is distinguishable from "finished flat".
 *
 * That decision lived inline and identically in three files, where the only
 * way to exercise it was to end a live run holding a position. Here it is one
 * pure function over plain data, so the open-position branch can be tested
 * directly (tests/dashboard-shutdown.test.ts) and the dashboards keep exactly
 * one implementation between them.
 *
 * Unlike examples/run_mm.ts, the dashboards do not flatten on exit: they
 * report and hand the position back to the operator. The warning therefore has
 * to say what is open and how to close it.
 */

/** The fields of a tracked position this decision actually reads. */
export interface LegPosition {
  /** 1 long, -1 short, 0 flat. */
  sign: number;
  /** Absolute position size in scaled base units; 0 when flat. */
  size: number;
}

/** One book a run was trading. `venue` is set only for multi-venue runs. */
export interface ShutdownLeg {
  venue?: string;
  marketId: number;
  position?: LegPosition | undefined;
}

/** The default close command; per-venue for a multi-venue run. */
const CLOSE_CMD = 'npx tsx examples/close_all_positions.ts';

/**
 * The legs still holding inventory.
 *
 * `size` is a magnitude, so `size !== 0` is the whole test: a leg reporting
 * sign but zero size is flat, and a leg the tracker never heard about
 * (`position` undefined) is not evidence of an open position.
 */
export function openLegs(legs: readonly ShutdownLeg[]): ShutdownLeg[] {
  return legs.filter((l) => l.position !== undefined && l.position.size !== 0);
}

/**
 * Process exit code for a finished run: 1 while anything is still open.
 *
 * Deliberately not "1 on error" — a run can end cleanly and still leave
 * inventory, and that is the case a caller must not treat as success.
 */
export function shutdownExitCode(legs: readonly ShutdownLeg[]): 0 | 1 {
  return openLegs(legs).length > 0 ? 1 : 0;
}

/**
 * The lines a dashboard prints as it exits, in order.
 *
 * Returned rather than printed so the wording is testable and so a caller
 * decides where it goes. `label` is the shutdown reason ("Final", "Strategy
 * stopped") the dashboards already pass through.
 */
export function formatShutdownReport(label: string, legs: readonly ShutdownLeg[]): string[] {
  const open = openLegs(legs);
  const multi = legs.some((l) => l.venue !== undefined);

  if (open.length === 0) {
    return [multi ? `${label}: all venues flat.` : `${label}: flat.`];
  }

  const lines = open.map((l) => {
    const where = l.venue ? `${l.venue} position` : 'position';
    return (
      `${label}: WARNING ${where} still open mkt=${l.marketId} ` +
      `sign=${l.position!.sign} size=${l.position!.size}.`
    );
  });

  if (multi) {
    // One command per venue: close_all_positions.ts reads a single venue's
    // credentials from env, so two open venues need two invocations.
    lines.push(
      `       Close before the next run — once for each venue listed above,\n` +
        `       with that venue's LIGHTER_NETWORK and credentials in env:\n` +
        `         ${CLOSE_CMD}`,
    );
  } else {
    lines.push(`       Close it before the next run: ${CLOSE_CMD}`);
  }

  return lines;
}
