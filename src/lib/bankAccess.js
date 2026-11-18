import { apiJson } from '@/api/http';
import { replaceQuestionCatalogue } from '../../shared/questionBank';
export let bankAccess = { fullMockTaskId: 'ielts-full-mock-demo-v1', access: { fullQuestionBank: false, sourceAccess: 'original-trial' } };
export async function loadQuestionCatalogue(signal) {
  const catalogue = await apiJson('/api/question-bank', { action: 'catalogue' }, { signal });
  replaceQuestionCatalogue(catalogue.sets);
  bankAccess = catalogue;
  return catalogue;
}
