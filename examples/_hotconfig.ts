/**
 * Hot config file for the MM runners: an auto-filled JSON the runner
 * re-reads EVERY cycle, so config changes apply without stopping the run.
 *
 * Enabling (default OFF, like the file logs):
 *   MM_HOT_CONFIG=1              mm-config.json next to the runner
 *   MM_HOT_CONFIG=path/to/c.json  exact file
 *
 * On enable, the runner writes the current resolved config to the file
 * (auto-filled — every editable knob with its live value) and then watches
 * it: each strategy cycle re-reads the file and pushes any changed keys
 * into `strategy.updateConfig()`, which applies them at the top of the next
 * tick. Edit the file, save, watch the event log say "config updated".
 *
 * The file is rewritten by the runner only ONCE (at start); after that the
 * user owns it. A malformed file is reported in the event log and skipped —
 * it never kills a live run.
 */

import * as fs from 'fs';
import * as path from 'path';

/** A flat JSON object of editable config values. An undefined value means
 * "known but currently unset" — the file may introduce it. */
export type HotConfigFile = Record<string, number | boolean | undefined>;

/** Resolve the hot-config path, or null when the feature is off. */
export function resolveHotConfigPath(): string | null {
  const raw = process.env.MM_HOT_CONFIG;
  if (!raw || raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'off') {
    return null;
  }
  if (raw === '1' || raw.toLowerCase() === 'on' || raw.toLowerCase() === 'true') {
    return path.join(process.cwd(), 'mm-config.json');
  }
  return path.resolve(raw);
}

export interface HotConfig {
  /** The file path, or null when disabled. */
  path: string | null;
  /** Write the auto-filled config file now (values from `fields`). */
  writeInitial: (fields: Array<{ key: string; label: string; value: number | boolean | undefined }>) => void;
  /**
   * Read the file and return the changed keys (vs `known`).
   * Returns {} when disabled, unreadable, or unchanged.
   */
  readChanges: (known: HotConfigFile) => HotConfigFile;
}

/**
 * Wire the hot config file. Call once after the strategy is constructed so
 * `getEditableConfig()` is available for the auto-fill.
 */
export function setupHotConfig(): HotConfig {
  const file = resolveHotConfigPath();

  const writeInitial = (
    fields: Array<{ key: string; label: string; value: number | boolean | undefined }>,
  ): void => {
    if (!file) return;
    const out: HotConfigFile = {};
    const comments: Record<string, string> = {};
    const unsetKeys: string[] = [];
    for (const f of fields) {
      if (f.value !== undefined) {
        out[f.key] = f.value;
        comments[f.key] = f.label;
      } else {
        // Keep unset-but-editable keys visible as commented placeholders so
        // they can still be enabled (e.g. leverage on a run started without
        // one) — dropping them would remove them from the file entirely.
        unsetKeys.push(f.key);
        comments[f.key] = f.label;
      }
    }
    // JSON with per-key doc comments: emit a JS object with // comments via
    // string build, since JSON has no comments.
    const lines: string[] = [
      '{',
      '  // Hot config for the running MM strategy. Edit + save; the runner',
      '  // re-reads this EVERY cycle and applies changes without a restart.',
      '  // Keys match the config menu (press Space in the dashboard).',
      '  // To set an unset knob, un-comment its line and give it a value.',
    ];
    const entries = Object.entries(out);
    entries.forEach(([k, v], i) => {
      const label = comments[k] ?? k;
      const comma = i === entries.length - 1 && unsetKeys.length === 0 ? '' : ',';
      lines.push(`  "${k}": ${JSON.stringify(v)}${comma} // ${label}`);
    });
    unsetKeys.forEach((k, i) => {
      const comma = i === unsetKeys.length - 1 ? '' : ',';
      lines.push(`  // "${k}": 0${comma} // ${comments[k]} (unset — remove the // and set a value)`);
    });
    lines.push('}');
    try {
      fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
      console.log(`[CONFIG] hot config file written (auto-filled): ${file}`);
    } catch (e) {
      console.log(`[CONFIG] could not write hot config file: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Strip // comments before parsing (the auto-filled file has them).
  const parseWithComments = (text: string): HotConfigFile => {
    const noComments = text
      .split('\n')
      .map((l) => {
        const idx = l.indexOf('//');
        // Keep // inside quotes; naive split is fine because our own
        // generated comments are always outside strings, and we only parse
        // files we generated or the user edited in the same shape.
        return idx === -1 ? l : l.slice(0, idx);
      })
      .join('\n');
    return JSON.parse(noComments) as HotConfigFile;
  };

  const readChanges = (known: HotConfigFile): HotConfigFile => {
    if (!file) return {};
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return {}; // unreadable — skip this cycle
    }
    let parsed: HotConfigFile;
    try {
      parsed = parseWithComments(text);
    } catch (e) {
      console.log(
        `[CONFIG] hot config file is malformed, skipping: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {};
    }
    const changes: HotConfigFile = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!(k in known)) continue; // unknown keys are ignored, never applied
      // `undefined` = known-but-unset: any value found in the file counts as
      // a change (this is how a leverage is first set mid-run).
      if (known[k] !== v) changes[k] = v;
    }
    return changes;
  };

  return { path: file, writeInitial, readChanges };
}