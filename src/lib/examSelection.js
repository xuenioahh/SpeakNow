import { getSpeakingTask } from '../../shared/speakingTasks';
import { bankSelection } from '../../shared/questionBank';

export function examSelection(params) {
  if (params.has('setId') || params.has('questionId') || params.has('taskType')) return bankSelection(params);
  const task = getSpeakingTask(params.get('task'));
  if (!task) return null;
  const question = params.get('question');
  if (question !== null && (!/^\d+$/.test(question) || !task.prompts[Number(question)])) return null;
  const part = params.get('part');
  if (part && (task.type !== 'ielts-mock' || !/^[123]$/.test(part))) return null;
  return { task, questionIndex: question === null ? null : Number(question), part: part ? Number(part) : null };
}

export function examDraftKey(userId, taskId, parentId = '', focus = '', questionIndex = null, part = null, sessionMode = 'practice') {
  return `exam:${userId || 'guest'}:${taskId}:${parentId || 'new'}:${focus}:${questionIndex ?? 'all'}${part ? `:part${part}` : ''}${sessionMode === 'exam' ? ':exam-mode' : ''}`;
}
