// Fictional role-play context. This is guidance, never an order or score ledger.
export function cafeDialogueGuide({ isGoalOriented, sceneCueId }) {
  const cues = {
    menu: 'The learner is looking at the menu: espresso, latte, filter coffee, oat milk and pastries.',
    coffee: 'The learner is inspecting a cup: clarify milk choice, labelling and takeaway when relevant.',
    pastry: 'The learner is looking at the pastry tray: discuss choices and check ingredients, without guaranteeing suitability.',
  };
  return [
    'You are the barista at the fictional Brew & Bean café, not an examiner speaking inside the role-play.',
    isGoalOriented
      ? 'Help the customer order five drinks and pastries for colleagues, including a lactose-intolerant colleague. Keep track of quantities, drink choices, milk, takeaway and pastry requests already stated in the conversation. Ask one short question about the most useful missing detail. Accept changes and replace the earlier choice; never double-count a correction. When the customer is ready, recap only stated details and ask for confirmation. Do not treat viewing a scene object as completing or ordering anything.'
      : 'Have a relaxed café conversation. Follow the customer’s topic; do not force the five-drink mission into free talk.',
    'The menu shows espresso, latte and filter coffee, oat milk and pastries. Prices, stock and pastry ingredients are not specified. Do not invent them or guarantee allergy safety. Offer to check ingredients when asked.',
    'Keep grammar and exam advice in feedback, outside the barista’s reply. Do not infer pronunciation from typed words.',
    cues[sceneCueId] || '',
  ].filter(Boolean).join(' ');
}

export function cafeConversationHistory(history, userText) {
  const messages = (Array.isArray(history) ? history : [])
    .filter(message => ['user', 'ai', 'assistant'].includes(message?.role) && typeof message.content === 'string');
  // VoiceInteraction already includes the current user turn in history.
  if (messages.at(-1)?.role === 'user' && messages.at(-1)?.content === userText) messages.pop();
  return messages.slice(-20).map(message => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content.slice(0, 1200)}`).join('\n');
}

export function cafeLocalPractice({ userText, isGoalOriented, sceneCueId }) {
  const latest = String(userText || '').toLowerCase();
  let question = 'Which drinks would you choose for the five colleagues?';
  if (!isGoalOriented) question = 'What do you enjoy about your usual coffee or café?';
  else if (/confirm|that(?:’|')?s all|everything|correct|ready/.test(latest)) question = 'Could you recap the drinks, milk choices and pastries, so the barista can check the order?';
  else if (/pastr|croissant|dairy.free|ingredients/.test(latest) || sceneCueId === 'pastry') question = 'Which ingredients would you ask the barista to check before choosing pastries?';
  else if (/oat|milk|lactose/.test(latest)) question = 'How would you ask for the oat-milk drink to be labelled separately?';
  else if (/to go|takeaway|take away|label/.test(latest) || sceneCueId === 'coffee') question = 'What would you say to check the drink choices and quantities before paying?';
  else if (/espresso|latte|filter|coffee/.test(latest)) question = 'How would you explain the milk choice for the colleague who is lactose intolerant?';
  return {
    source: 'fallback',
    fallback_reason: 'model_unavailable',
    reply: `For local café practice: ${question}`,
    feedback: { grammar: '', vocabulary: '', pronunciation: '', task: 'Practise this follow-up in your own words. Local guidance does not confirm or score an order.' },
  };
}
