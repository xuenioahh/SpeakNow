// Fictional role-play context. This is guidance, never an order or score ledger.
export function cafeDialogueGuide({ isGoalOriented, sceneCueId }) {
  const cues = {
    menu: 'The learner is looking at the menu: espresso, latte, filter coffee, oat milk and pastries.',
    coffee: 'The learner is inspecting a cup: clarify milk choice, labelling and takeaway when relevant.',
    pastry: 'The learner is sitting by the window, speaking to a friend about their morning. Stay in that role and do not ask them to order.',
  };
  return [
    sceneCueId === 'pastry' ? 'You are a friend at the café window seats.' : 'You are the barista at the fictional Brew & Bean café, not an examiner speaking inside the role-play.',
    isGoalOriented
      ? sceneCueId === 'pastry' ? 'Have natural small talk about the learner’s morning plans. Respond to what they actually say.' : sceneCueId === 'coffee' ? 'Help the customer resolve a mix-up at the pickup side. Ask what is wrong with the drink, check the milk choice, and offer a reasonable correction without claiming an order was placed.' : 'Help the customer order drinks for colleagues, including an oat-milk choice. Ask for useful missing details and recap only what the customer stated.'
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

