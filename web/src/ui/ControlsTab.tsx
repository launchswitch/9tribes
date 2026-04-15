export function ControlsTab() {
  return (
    <div className="controls-tab">
      <section className="controls-tab__section">
        <h3 className="controls-tab__heading">Keyboard</h3>
        <table className="controls-tab__table">
          <tbody>
            <tr><kbd>A</kbd><td>Toggle attack targeting</td></tr>
            <tr><kbd>B</kbd><td>Build city (selected settler)</td></tr>
            <tr><kbd>Enter</kbd><td>End turn</td></tr>
            <tr><kbd>Esc</kbd><td>Cancel / close (see priority below)</td></tr>
          </tbody>
        </table>
      </section>

      <section className="controls-tab__section">
        <h3 className="controls-tab__heading">Mouse</h3>
        <table className="controls-tab__table">
          <tbody>
            <tr><span className="controls-tab__mouse">Left click</span><td>Select hex or unit; fire ranged attack when targeting</td></tr>
            <tr><span className="controls-tab__mouse">Double-click</span><td>Open city production panel</td></tr>
            <tr><span className="controls-tab__mouse">Right click</span><td>Move unit; queue movement if beyond reach</td></tr>
            <tr><span className="controls-tab__mouse">Right click (empty)</span><td>Inspect hex</td></tr>
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
