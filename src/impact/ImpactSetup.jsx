import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AUDIENCES, GUIDANCE } from './contracts';
export default function ImpactSetup({ value, onChange }) {
  return <section className="glass rounded-2xl p-5 impact-config">
    <p className="eyebrow">Your 5-minute presentation</p><h2>Choose a message and the people listening</h2>
    {[['topic', 'Presentation Topic'], ['coreMessage', 'Core Message'], ['desiredOutcome', 'Desired Outcome']].map(([key, label]) => <label className="impact-field" key={key}><span>{label}</span><textarea rows={2} maxLength={2400} required value={value[key]} onChange={event => onChange({ ...value, [key]: event.target.value })} /></label>)}
    <div className="impact-audiences" role="group" aria-label="Target audience">{AUDIENCES.map(type => <Button type="button" key={type} variant={type === value.targetAudience ? 'default' : 'outline'} aria-pressed={type === value.targetAudience} onClick={() => onChange({ ...value, targetAudience: type })}>{type} Audience</Button>)}</div>
    <label className="impact-field"><span>Who specifically? (for example, classmates and your lecturer)</span><Input maxLength={2400} value={value.audienceDescription} onChange={event => onChange({ ...value, audienceDescription: event.target.value })} /></label>
    <ul className="text-sm text-muted-foreground space-y-1">{GUIDANCE[value.targetAudience].map(tip => <li key={tip}>{tip}</li>)}</ul>
  </section>;
}
