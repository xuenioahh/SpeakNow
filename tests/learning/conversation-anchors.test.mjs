import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IMMERSIVE_SCENARIOS } from '../../src/lib/immersiveScenarios.js';
import { SCENARIOS } from '../../src/lib/scenarios.js';
import { getDailyTasks, getDailyTask } from '../../src/lib/dailyTasks.js';

test('all 36 existing conversations have separated stationary actors and safe front-aisle cameras', () => {
  const ids = new Set();
  assert.equal(Object.keys(IMMERSIVE_SCENARIOS).length, 12);
  for (const [scene, theme] of Object.entries(IMMERSIVE_SCENARIOS)) {
    assert.equal(theme.cues.length, 3);
    for (const cue of theme.cues) {
      assert.ok(!ids.has(cue.sceneAnchorId)); ids.add(cue.sceneAnchorId);
      assert.equal(cue.sceneAnchorId, `${scene}:${cue.id}`);
      assert.ok(cue.npcPosition[0] > -3.1 && cue.npcPosition[0] < 3.1);
      assert.equal(cue.npcPosition[1], 0);
      assert.ok(cue.cameraPosition[2] >= 3.15);
      assert.ok(cue.cameraWaypoint[2] >= cue.cameraPosition[2]);
      assert.ok(cue.detail && cue.npcName && cue.station);
      for (const other of theme.cues.filter(item => item !== cue)) assert.ok(Math.hypot(cue.npcPosition[0] - other.npcPosition[0], cue.npcPosition[2] - other.npcPosition[2]) > 1);
    }
  }
  assert.equal(ids.size, 36);
});

test('NPC identity and original goals travel together; an unknown task never falls back to task one', () => {
  for (const scenario of SCENARIOS) {
    const tasks = getDailyTasks(scenario);
    assert.equal(tasks.length, 3);
    for (const task of tasks) {
      assert.equal(getDailyTask(scenario, task.id).sceneAnchorId, `${scenario.id}:${task.id}`);
      assert.ok(task.conversation.context.includes(task.npcName));
      assert.ok(task.conversation.context.includes(task.station));
      assert.ok(task.conversation.context.includes(task.detail));
    }
    assert.equal(getDailyTask(scenario, 'not-a-real-task'), undefined);
  }
  assert.equal(getDailyTask(SCENARIOS.find(scene => scene.id === 'cafe'), 'pastry').role, 'Friend at the café');
});
