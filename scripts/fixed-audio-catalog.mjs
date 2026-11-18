import { createHash } from 'node:crypto';
import { QUESTION_SETS } from '../shared/questionBank.js';
import { SPEAKING_TASKS } from '../shared/speakingTasks.js';
import { SCENARIOS } from '../src/lib/scenarios.js';
import { getDailyTasks } from '../src/lib/dailyTasks.js';

export const textHash = text => createHash('sha256').update(text.trim().normalize('NFC')).digest('hex');
export function fixedAudioCatalog() {
  const entries = [];
  for (const set of QUESTION_SETS.filter(set => ['repeat', 'interview'].includes(set.taskType))) {
    for (const question of set.questions) entries.push({ audioId: `question-${question.questionId}`, questionId: question.questionId, type: set.taskType, text: question.questionText, textHash: textHash(question.questionText) });
  }
  for (const task of SPEAKING_TASKS.filter(task => task.exam === 'toefl' && ['listen-repeat', 'interview'].includes(task.type))) {
    for (const [index, text] of task.prompts.entries()) entries.push({ audioId: `legacy-${task.id}-${index}`, questionId: `${task.id}:${index}`, type: task.type, text, textHash: textHash(text) });
  }
  for (const scenario of SCENARIOS) {
    for (const task of getDailyTasks(scenario)) {
      const text = task.conversation.firstMessage;
      entries.push({ audioId: `daily-${scenario.id}-${task.id}-opening`, dialogueId: `${scenario.id}:${task.id}:opening`, type: 'daily-opening', text, textHash: textHash(text) });
    }
  }
  return entries;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const entries = fixedAudioCatalog();
  const counts = Object.fromEntries(['repeat', 'interview', 'listen-repeat', 'daily-opening'].map(type => [type, entries.filter(item => item.type === type).length]));
  console.log(JSON.stringify({ total: entries.length, counts, duplicateIds: entries.length - new Set(entries.map(item => item.audioId)).size }));
}
