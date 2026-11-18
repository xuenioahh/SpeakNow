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
  const terms = new Set(latest.toLowerCase().match(/[a-z]{4,}/g) || []);
  const older = messages.slice(0, cut).map((message, index) => ({ ...message, index,
    priority: (message.role === 'user' ? 2 : 0) + (/\b(prefer|allerg|my name|i live|i work|my friend|because|usually|remember|don't|do not)\b/i.test(message.content) ? 3 : 0)
      + [...terms].filter(word => message.content.toLowerCase().includes(word)).length }));
  const selected = []; let used = 0;
  for (const item of older.sort((a, b) => b.priority - a.priority || b.index - a.index)) {
    if (used + item.content.length > 2000) continue;
    selected.push(item); used += item.content.length;
  }
  return { summary: selected.sort((a, b) => a.index - b.index).map(item => `Earlier ${line(item)}`).join('\n'), recent: messages.slice(cut), totalMessages: messages.length };
}
