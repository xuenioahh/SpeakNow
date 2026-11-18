// Server-owned source material. Vite substitutes an empty registry for the browser.
import toefl from './question-bank/catalogue.json' with { type: 'json' };
import ielts from './question-bank/ielts-catalogue.json' with { type: 'json' };
export const initialSets = [...toefl.sets, ...ielts.sets];
