/*
 * Hide internal child presets from the UI roster.
 *
 * Why this exists: since DSH 0.2.1 a sub-agent's persona and toolset must be
 * declared as an Agent Preset (`agentPreset` on `tool-subagent`), and
 * `agent-presets` has no "hidden" concept — its roster method returns every
 * declaration, so the mode picker shows the investigator and the reviewer as if
 * they were modes a person could choose.
 *
 * The roster call is dispatched dynamically on the live service instance
 * (`Reflect.get(receiver, method)` in the API gateway), so wrapping that one
 * method on the instance filters what the Web UI lists while leaving the
 * registry untouched: `resolve` / `mount` / `compositionInventory` still see the
 * child presets, so delegation keeps working.
 *
 * If DSH renames or drops the method, this plugin does nothing — the child
 * presets simply reappear in the picker. It never throws for that reason.
 */

/** Presets that exist only to back a delegation tool. */
const INTERNAL_PRESETS = new Set([
  'requirements-explore',
  'requirements-review',
]);

/** The registry's UI-facing roster method. */
const ROSTER_METHOD = 'remoteExportList';

export default class HideInternalPresets {
  static inject = ['agentPresets'];

  constructor(ctx) {
    const registry = ctx.agentPresets;
    const original = registry?.[ROSTER_METHOD];
    if (typeof original !== 'function') return;

    const bound = original.bind(registry);
    const filtered = async (...args) => {
      const roster = await bound(...args);
      if (roster === null || typeof roster !== 'object' || !Array.isArray(roster.presets)) {
        return roster;
      }
      return {
        ...roster,
        presets: roster.presets.filter((preset) => !INTERNAL_PRESETS.has(preset?.id)),
      };
    };

    try {
      Object.defineProperty(registry, ROSTER_METHOD, {
        configurable: true,
        writable: true,
        value: filtered,
      });
    } catch {
      // A non-extensible service is a DSH internal change, not a user error.
    }
  }
}
