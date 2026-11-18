// Original SpeakNow simulations for a free end-to-end trial; no third-party bank.
const make = (id, exam, type, title, prompts, extra = {}) => ({
  setId: `sample-${id}`, exam, taskType: exam === 'ielts' ? `ielts-${type}` : type, setTitle: title,
  category: 'Free practice', categories: ['Free practice'], sourceDate: 'SpeakNow original', sourceType: 'original', sourceVersion: 1,
  sourceFingerprint: `original-${id}-v1`, accessLevel: 'free', isDemo: true,
  questions: prompts.map((questionText, index) => ({ questionId: `sample-${id}-${index}`, setId: `sample-${id}`, questionOrder: index + 1, questionText, rawText: questionText,
    sourceRefs: [{ sourceId: 'speaknow-original', page: 1 }], referenceAnswer: null, cuePoints: null, audioSource: null, availability: { sourceAudio: false, referenceAnswer: false } })), ...extra,
});
export const SAMPLE_SETS = [
  make('toefl-repeat', 'toefl', 'repeat', 'Campus · Free practice', ['The library opens at nine.', 'Please leave your bags beside the door.', 'You can borrow a laptop at the front desk.', 'The study rooms on the second floor are open until midnight.', 'Students should return their books before leaving for the winter break.', 'If you need help finding an article, the librarian can show you how to search the catalogue.', 'Although the main entrance is closed for repairs, students can still enter the building through the courtyard.']),
  make('toefl-interview', 'toefl', 'interview', 'Campus interview · Free practice', ['What place on campus do you use most often, and what do you do there?', 'Describe a time when studying with another person helped you.', 'Do you think universities should provide more quiet study spaces or more social spaces? Why?', 'How might online learning change the way students use university campuses in the future?']),
  make('ielts-part1', 'ielts', 'part1', 'Work, studies and home · Free practice', ['Do you work or are you a student?', 'What do you enjoy most about your work or studies?', 'Do you prefer studying alone or with other people? Why?', 'Tell me about the neighbourhood you live in.', 'What do you enjoy doing in your free time?', 'Do you prefer spending weekends at home or outdoors?']),
  make('ielts-part2', 'ielts', 'part2', 'Learning a useful skill · Free practice', ['Describe a useful skill you learned.', 'Do you use this skill often?'], {
    relatedSetId: 'sample-ielts-part3',
    steps: [{ type: 'part2', preparationSeconds: 60, answerSeconds: 120 }, { type: 'part2-followup', preparationSeconds: 0, answerSeconds: 30 }],
  }),
  make('ielts-part3', 'ielts', 'part3', 'Learning useful skills · Free practice', ['How has technology changed the way people learn practical skills?', 'Should schools prioritise practical skills or academic knowledge? Why?', 'Who should be responsible for helping adults learn new skills?', 'How can communities help people share practical knowledge?'], { relatedSetId: 'sample-ielts-part2' }),
];
SAMPLE_SETS[3].questions[0].cuePoints = ['What the skill was', 'When and how you learned it', 'Who helped you', 'Why it is useful'];
