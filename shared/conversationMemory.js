// Extractive memory retains the learner's actual words; no invented facts.
export function conversationMemory(history, latest = '') {
  const messages = (Array.isArray(history) ? history : []).flatMap(message =>
    ['user', 'ai', 'assistant'].includes(message?.role) && typeof message.content === 'string'
      ? [{ role: message.role === 'user' ? 'user' : 'assistant', content: message.content.trim().slice(0, 3000) }] : []);
  if (messages.at(-1)?.role === 'user' && messages.at(-1)?.content === latest.trim()) messages.pop();
  const line = message => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`;
  if (messages.map(line).join('\n').length <= 6500) return { summary: '', recent: messages, totalMessages: messages.length };
  let size = 0, cut = messages.length;
  while (cut > 0 && size + line(messages[cut - 1]).length < 4500) { cut--; size += line(messages[cut]).length + 1; }
  // Keep whole recent exchanges even when a single reply is unusually long.
  cut = Math.min(cut, Math.max(0, messages.length - 8));
  const terms = new Set(latest.toLowerCase().match(/[a-z]{3,}/g) || []);
  // Rank short exact excerpts, rather than dropping an entire long answer when
  // it exceeds the memory budget. Every turn re-selects from the full history.
  const older = messages.slice(0, cut).flatMap((message, index) =>
    (message.content.match(/[^.!?\n]+[.!?]?/g) || [message.content]).flatMap(sentence => {
      const chunks = sentence.trim().match(/.{1,360}(?:\s|$)|.{1,360}/g) || [];
      return chunks.map(content => ({ ...message, content: content.trim(), index,
        priority: (message.role === 'user' ? 3 : 0)
          + (/\b(prefer|allerg\w*|my name|i live|i work|my friend|my sister|my brother|because|usually|remember|don't|do not|changed|instead)\b/i.test(content) ? 4 : 0)
          + [...terms].filter(word => content.toLowerCase().includes(word)).length * 2 }));
    }));
  const selected = [], seen = new Set(); let used = 0;
  const budget = Math.min(2800, Math.max(0, 8100-JSON.stringify(messages.slice(cut)).length));
  for (const item of older.sort((a, b) => b.priority - a.priority || b.index - a.index)) {
    const key = `${item.role}:${item.content}`;
    const cost = `Earlier ${line(item)}\n`.length;
    if (seen.has(key) || used + cost > budget) continue;
    selected.push(item); used += cost; seen.add(key);
  }
  return { summary: selected.sort((a, b) => a.index - b.index).map(item => `Earlier ${line(item)}`).join('\n'), recent: messages.slice(cut), totalMessages: messages.length };
}

export function conversationContext(history, latest = '', scenario = null, sessionId = null) {
  const memory = conversationMemory(history, latest);
  return {
    sessionId, scenario, currentTopic: String(latest).trim().slice(0, 400),
    recentUserMessages: memory.recent.filter(item => item.role === 'user').slice(-4),
    recentAssistantMessages: memory.recent.filter(item => item.role === 'assistant').slice(-4),
    relevantContext: memory.summary ? memory.summary.split('\n') : [],
    conversationSummary: memory.summary, totalMessages: memory.totalMessages,
  };
}

// A long practice remains fully saved; its feedback request has an explicit,
// bounded evidence sample. Original answer indices survive sampling.
export function conversationReviewContext(attempt) {
  const answers=attempt.answers.map((answer,answerIndex)=>({answerIndex,turnId:answer.turnId,text:answer.text,prompt:answer.prompt}));
  if(JSON.stringify({answers,turns:attempt.turns}).length<=24000)return {answers,turns:attempt.turns,coverage:'full transcript'};
  const chosen=new Set([0,1,2,...Array.from({length:5},(_,index)=>Math.floor((answers.length-1)*index/4)),...Array.from({length:4},(_,index)=>answers.length-1-index)]);
  const selected=[...chosen].filter(index=>index>=0&&answers[index]).sort((a,b)=>a-b).map(index=>({...answers[index],text:answers[index].text.slice(0,1200),prompt:answers[index].prompt?.slice(0,300)}));
  const memory=conversationMemory(attempt.turns||[],'Summarize the conversation and the user preferences and plans.');
  return {answers:selected,turns:memory.recent,conversationSummary:memory.summary,
    coverage:`Selected exact excerpts from ${selected.length} of ${answers.length} answers; use each explicit answerIndex, never its array position. Assess only these excerpts.`};
}
