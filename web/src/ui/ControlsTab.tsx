export function ControlsTab() {
  return (
    <div className="controls-tab">
      <section className="controls-tab__section">
        <h3 className="controls-tab__heading">Keyboard</h3>
        <table className="controls-tab__table">
          <tbody>
            <tr><td><kbd>A</kbd></td><td>Toggle attack targeting</td></tr>
            <tr><td><kbd>B</kbd></td><td>Build city (selected settler)</td></tr>
            <tr><td><kbd>Enter</kbd></td><td>End turn</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Cancel / close (see priority below)</td></tr>
            <tr><td><kbd>Shift</kbd> + <kbd>Arrow</kbd></td><td>Select next available unit with movement points</td></tr>
          </tbody>
        </table>
      </section>

      <section className="controls-tab__section">
        <h3 className="controls-tab__heading">Mouse</h3>
        <table className="controls-tab__table">
          <tbody>
            <tr><td><span className="controls-tab__mouse">Left click</span></td><td>Select hex or unit; fire ranged attack when targeting</td></tr>
            <tr><td><span className="controls-tab__mouse">Double-click</span></td><td>Open city production panel</td></tr>
            <tr><td><span className="controls-tab__mouse">Right click</span></td><td>Move unit; queue movement if beyond reach</td></tr>
            <tr><td><span className="controls-tab__mouse">Ctrl</span> + <span className="controls-tab__mouse">Right click</span></td><td>Inspect land tiles</td></tr>
          </tbody>
        </table>
      </section>

      <section className="controls-tab__section">
        <h3 className="controls-tab__heading">Escape Priority</h3>
        <p className="controls-tab__note">
          Pressing <kbd>Esc</kbd> closes things in this order: attack mode &rarr; move queue &rarr;
          selection &rarr; overlays &rarr; help &rarr; research &rarr; inspector &rarr; combat log &rarr; debug.
        </p>
      </section>
    </div>
  );
}
