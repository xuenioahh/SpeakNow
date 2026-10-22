import assert from "node:assert/strict";
import {
  EXAM_STANDARDS,
  getScoreDescriptor,
  normalizeExamScore,
  roundExamScore,
} from "../src/lib/examStandards.js";
import { generateVoiceReport } from "../src/lib/localReports.js";

assert.equal(EXAM_STANDARDS.ielts.max, 9);
assert.equal(EXAM_STANDARDS.ielts.step, 0.5);
assert.equal(roundExamScore(6.24, "ielts"), 6);
assert.equal(roundExamScore(6.26, "ielts"), 6.5);
assert.match(getScoreDescriptor(7, "ielts"), /Long turns/);

assert.equal(EXAM_STANDARDS.toefl.max, 6);
assert.equal(EXAM_STANDARDS.toefl.step, 0.5);
assert.equal(roundExamScore(4.26, "toefl"), 4.5);
assert.equal(normalizeExamScore(24, "toefl", { legacyToefl: true }), 5);

const report = generateVoiceReport({
  messages: [
    { role: "user", content: "I prefer online classes because they save time. For example, I can review the lesson after work." },
    { role: "assistant", content: "Why?" },
  ],
  scoring: "toefl",
  duration: 45,
  words: 20,
  exchanges: 2,
  scenarioTitle: "Campus discussion",
  mode: "basic",
  dialogMode: "free_talk",
});

assert.deepEqual(report.scores, {});
assert.equal(report.totalScore, null);
assert.equal(report.pronunciation_analysis, null);
assert.equal(report.scoring_framework.practice_estimate, false);
assert.equal(report.scoring_framework.score_available, false);
assert.match(report.scoring_framework.strategy, /Listen and Repeat/);

console.log("exam standards checks passed");
