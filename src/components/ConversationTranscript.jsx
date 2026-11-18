import { useEffect, useRef, useState } from 'react';
import { Volume2, Square } from 'lucide-react';

export default function ConversationTranscript({ messages, streamingText, finalText, interimText, partnerName, onReplay, activePlaybackId, replayDisabled }) {
  const list = useRef(null);
  const follow = useRef(true);
  const first = useRef(true);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const node = list.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (follow.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!list.current || !follow.current) return;
    list.current.scrollTo({ top: list.current.scrollHeight, behavior: first.current || streamingText || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    first.current = false;
  }, [messages, streamingText, finalText, interimText]);
  function jumpToLatest() {
    follow.current = true;
    setPaused(false);
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }
  return <div className="conversation-transcript-wrap">
    <div ref={list} className="conversation-transcript" role="log" aria-label="Live conversation" aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={event => {
      const node = event.currentTarget;
      follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
      setPaused(!follow.current);
    }}>
      {messages.map(message => <article key={message.id} className={`conversation-message ${message.role === 'user' ? 'from-you' : 'from-npc'}`}><span>{message.role === 'user' ? 'You' : partnerName}</span><p>{message.content}</p>{message.role === 'ai' && onReplay && <button className="message-replay" aria-label={activePlaybackId === message.id ? 'Stop voice' : `Replay ${partnerName}'s message`} disabled={replayDisabled} onClick={() => onReplay(message.id)}>{activePlaybackId === message.id ? <Square size={12} /> : <Volume2 size={13} />}<span>{activePlaybackId === message.id ? 'Stop' : 'Replay'}</span></button>}</article>)}
      {streamingText && <article className="conversation-message from-npc is-streaming"><span>{partnerName}</span><p>{streamingText}<span className="conversation-cursor" aria-hidden="true" /></p></article>}
      {(finalText || interimText) && <article className="conversation-message from-you is-draft"><span>You · speaking</span><p>{finalText} <em>{interimText}</em></p></article>}
    </div>
    {paused && <button className="conversation-latest" type="button" onClick={jumpToLatest}>↓ Latest messages</button>}
  </div>;
}
