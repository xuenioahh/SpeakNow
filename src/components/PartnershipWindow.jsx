import { Download, Handshake } from 'lucide-react';

export default function PartnershipWindow() {
  const download = () => {
    const text = `# SpeakNow · Collaboration brief\n\nFocus: context-led speaking practice and personal expression review.\n\nPossible collaboration\n- Language educators: scenario design and listener-comprehension tasks.\n- Behaviour and communication researchers: consented annotation, reliability and individual-difference evaluation.\n- Technology partners: speech timestamps and compatible model services.\n\nCurrent prototype\nVideo remains in the recording tab. Optional model reflection receives words and numerical movement summaries. Personal comparisons require user-confirmed examples.\n\nTo discuss\nOrganisation / contact:\nProposed question or use case:\nParticipants and consent approach:\nEvaluation method and expected outcomes:\nTechnical needs and resources:\n\nThis is a planning document, not an application or confirmation of partnership.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'speaknow-collaboration-brief.md'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <details className="scenario-partnership"><summary><Handshake size={18} /> Build better speaking practice with us</summary><p>A space for language educators, communication researchers and technology partners to shape scenarios and evaluate what actually helps learners.</p><div className="scenario-partner-tags"><span>Teaching pilots</span><span>Behaviour research</span><span>Technology integration</span></div><button onClick={download}><Download size={16} /> Download a collaboration brief</button><p className="scenario-partner-note">Use the brief to prepare a conversation. Downloading does not send an application or share your practice data.</p></details>;
}
