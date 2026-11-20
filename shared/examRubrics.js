// Plain-language study notes. Links point to the complete examiner descriptors.
const ielts = {
  title: 'IELTS Speaking band criteria',
  scale: 'Examiners give equal weight to four criteria across the whole speaking test. Bands 6 and 7 below are reference points for practice.',
  source: 'https://ielts.org/cdn/ielts-guides/ielts-speaking-band-descriptors.pdf',
  criteria: {
    coherence: 'Fluency and coherence',
    lexical: 'Lexical resource',
    grammar: 'Grammatical range and accuracy',
    pronunciation: 'Pronunciation'
  },
  benchmarks: [
    ['Fluency and coherence', 'At Band 6, a speaker can sustain a turn but sometimes loses the thread. At Band 7, ideas generally stay connected through longer answers.'],
    ['Lexical resource', 'At Band 6, vocabulary usually conveys the point and paraphrasing generally works. At Band 7, word choices are more flexible across topics.'],
    ['Grammatical range and accuracy', 'At Band 6, errors in complex sentences rarely obscure meaning. At Band 7, speakers use varied structures more flexibly and often produce accurate sentences.'],
    ['Pronunciation', 'Band 6 speech is generally understandable with little effort. Band 7 builds on this with some higher-band control of features such as rhythm and stress.']
  ],
  audio: 'A transcript can show idea order, vocabulary and grammar. Judging spoken flow, stress and pronunciation requires listening.'
};
const etsSource = 'https://www.ets.org/pdfs/toefl/speaking-rubrics.pdf';
const repeat = {
  title: 'TOEFL Listen and Repeat scoring guide',
  scale: 'ETS rates each spoken response holistically from 0 to 5. These anchors explain that task scale.',
  source: etsSource,
  criteria: { wording: 'Accuracy of repetition', intelligibility: 'Intelligibility' },
  benchmarks: [
    ['5', 'Accurate throughout and easy to understand.'],
    ['4', 'Small wording changes preserve the message.'],
    ['3', 'Most of the sentence is present, but the meaning shifts.'],
    ['2', 'Major omissions or inaccuracies leave a fragment.'],
    ['1', 'Only a few words come through.'],
    ['0', 'No usable response in English related to the prompt.']
  ],
  audio: 'Compare the transcript with the reference for wording. Replay the recording to check what a listener can understand.'
};
const interview = {
  title: 'TOEFL Take an Interview scoring guide',
  scale: repeat.scale,
  source: etsSource,
  criteria: { development: 'Relevance and elaboration', language: 'Grammar and vocabulary', delivery: 'Pace and intelligibility' },
  benchmarks: [
    ['5', 'Develops the point fully, uses precise language and speaks clearly at a natural pace.'],
    ['4', 'Explains a relevant answer clearly overall, with occasional gaps in linking or precision.'],
    ['3', 'Addresses the question, but limited detail or clarity weakens the answer.'],
    ['2', 'Offers little relevant support and struggles to communicate the point.'],
    ['1', 'Only isolated phrases connect loosely to the question.'],
    ['0', 'No usable response in English related to the question.']
  ],
  audio: 'The transcript supports feedback on content and language. Pace, rhythm and intelligibility require audio.'
};
export function examRubric(exam, type) {
  if (exam === 'ielts') return ielts;
  if (exam !== 'toefl') return null;
  return type === 'listen-repeat' ? repeat : type === 'interview' ? interview : null;
}

export function transcriptCriterion(rubric, key) {
  if (!rubric || typeof key !== 'string' || !Object.hasOwn(rubric.criteria, key)) return null;
  if (['pronunciation', 'intelligibility', 'delivery'].includes(key)) return null;
  return rubric.criteria[key];
}

export function criterionKey(rubric, value) {
  if (!rubric || typeof value !== 'string') return null;
  const words = text => text.toLowerCase().match(/[a-z]+/g)?.sort().join(' ');
  const name = words(value);
  return Object.keys(rubric.criteria).find(key => {
    const label = transcriptCriterion(rubric, key);
    return label && (name === key || name === words(label));
  }) || null;
}
