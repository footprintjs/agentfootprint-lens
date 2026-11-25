/** Copied into the private consumer: only saved JSON, never producer runtimes. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

module.exports = function verifyRealFixtures(lens, record) {
  for (const name of [
    "footprintjs",
    "hcifootprint",
    "agentfootprint",
    "@xyflow/react",
  ]) {
    assert.throws(() => require.resolve(name), { code: "MODULE_NOT_FOUND" });
  }
  const load = (name) =>
    JSON.parse(readFileSync(join(__dirname, name), "utf8"));
  const flow = load("flow.json");
  const hci = load("hci.json");
  const fixtures = [flow.root, flow.child, hci];
  function read(fixture, step, selectedKey) {
    const reads = {
      ...record.keysReadFromMap(fixture.reads.byStep),
      ...(fixture.reads.coverage && { coverage: fixture.reads.coverage }),
    };
    const model = lens.buildRecordLensModel({
      sourceId: fixture.sourceId,
      source: fixture.source,
      reads,
      step,
      selectedKey,
    });
    assert.notEqual(model.status, "refused");
    return model;
  }
  for (const fixture of fixtures) {
    const before = JSON.stringify(fixture);
    const cursor = record.timeTravel(fixture.source);
    for (const stop of cursor.stops) {
      const model = read(fixture, stop.step);
      assert.deepEqual(model.stops, cursor.stops);
      assert.deepEqual(model.selected, stop);
      assert.deepEqual(model.folded, cursor.stateAt(stop));
      assert.deepEqual(model.folded.skipped ?? [], []);
    }
    assert.equal(JSON.stringify(fixture), before);
  }
  assert.equal(read(flow.root, 2, "net").folded.state.net, 95);
  assert.equal(
    read(flow.root, 2, "net").provenance.slice.writer.runtimeStageId,
    "total#1"
  );
  assert.equal(read(flow.root, 4, "net").folded.state.net, 80);
  assert.equal(
    read(flow.root, 4, "net").provenance.slice.writer.runtimeStageId,
    "revise#4"
  );
  assert.deepEqual(read(flow.child, 0).folded.state, { net: 95 });
  assert.deepEqual(read(flow.child, 1, "approved").folded.state, {
    net: 95,
    approved: true,
  });
  assert.equal(
    read(flow.child, 1, "approved").provenance.slice.writer.runtimeStageId,
    "review/check#3"
  );
  const finalHci = read(hci, 5, "orderId");
  assert.deepEqual(finalHci.folded.state.items, [{ id: "p1" }, { id: "p2" }]);
  assert.equal(finalHci.folded.state.itemCount, 2);
  assert.equal(finalHci.folded.state.privateNote, "REDACTED");
  assert.equal(finalHci.folded.state.orderId, "demo-order-1");
  assert.equal(finalHci.provenance.slice.writer.runtimeStageId, "checkout#3");
  assert.equal(
    read(hci, 2, "orderId").provenance.slice.missing,
    "never-written"
  );
  assert(
    read(hci, 1, "privateNote").provenance.slice.notes.some(
      (note) => note.code === "redacted"
    )
  );
  assert(
    hci.observation.transitions.some(
      (row) => row.id === hci.observation.pendingId && row.outcome === "pending"
    )
  );
  assert(
    !finalHci.stops.some(
      (stop) => stop.runtimeStageId === hci.observation.pendingId
    )
  );
  return fixtures.map((fixture) => ({
    sourceId: fixture.sourceId,
    stops: record.timeTravel(fixture.source).stops.length,
  }));
};
