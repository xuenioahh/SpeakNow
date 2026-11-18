import { IMMERSIVE_SCENARIOS } from './immersiveScenarios.js';

export function getDailyTasks(scenario) {
  const cues = IMMERSIVE_SCENARIOS[scenario?.id]?.cues || [];
  return cues.map((cue, index) => ({
    ...cue,
    index,
    summary: scenario.id === 'cafe' ? ({ menu: 'Order drinks and explain milk preferences.', coffee: 'Ask the barista to fix a mixed-up drink.', pastry: 'Chat with a friend by the window.' })[cue.id] : cue.detail.split(/[.!?]/)[0] + '.',
    role: cue.npcRole || scenario.aiRole,
    conversation: {
      ...scenario.goalOriented,
      goal: cue.title,
      context: `You are ${cue.npcName}, a ${cue.npcRole || scenario.aiRole}, at ${cue.station} in ${scenario.title}. Initial situation: ${cue.detail} Follow the learner's meaning and topic, remember previous details, and contribute relevant thoughts. The initial task is a starting point; it does not limit conversation length or topics. Save language correction for review.`,
      firstMessage: scenario.id === 'cafe' && cue.id === 'pastry' ? "Hey! It is nice to see you. How is your morning going?" : scenario.id === 'cafe' && cue.id === 'coffee' ? 'Hi! Is something wrong with your drink?' : index === 0 ? scenario.goalOriented.firstMessage : `Hello! ${cue.title === 'Ask your guide' ? 'What would you like to know about the art?' : 'What would you like to check?'}`,
      successCriteria: cue.detail,
    },
  }));
}

export function getDailyTask(scenario, cueId) {
  const tasks = getDailyTasks(scenario);
  return cueId ? tasks.find(task => task.id === cueId) : tasks[0];
}
