import type { WindowMode } from './window-mode';

export function LauncherSettings({ mode, change }: { mode: WindowMode; change(mode: WindowMode): void }) {
  return <div className="rc-form rc-launcher-settings" role="region" aria-label="Launcher settings">
    <h1>General</h1><h2>Appearance</h2>
    <fieldset aria-describedby="rc-window-mode-help"><legend>Window Mode</legend>
      <label><input type="radio" name="window-mode" aria-label="Standard window mode" title="Show full launcher" aria-description="Choose with a click, Space or arrow keys. Shows suggestions when Root Search is empty." autoFocus={mode === 'standard'} checked={mode === 'standard'} onChange={() => change('standard')} /><span><strong>Standard</strong><small>Search bar and suggestions</small></span></label>
      <label><input type="radio" name="window-mode" aria-label="Compact window mode" title="Show compact launcher" aria-description="Choose with a click, Space or arrow keys. Empty Root Search shows only the search bar." autoFocus={mode === 'compact'} checked={mode === 'compact'} onChange={() => change('compact')} /><span><strong>Compact</strong><small>Search bar until you need results</small></span></label>
    </fieldset>
    <p id="rc-window-mode-help">Changes save immediately in this VV browser profile. In Compact, typing or Command K reveals results; Down or Enter shows suggestions before anything can launch. Escape collapses an empty search. Leaving focus collapses empty suggestions and keeps typed text.</p>
    <p>Command or Control comma opens these settings from Root Search. Escape returns to the launcher.</p>
  </div>;
}
