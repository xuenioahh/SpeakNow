export const AUDIENCES = ['Technical', 'Business', 'General']
export const DIMENSIONS = ['Message Clarity', 'Audience Relevance', 'Evidence Quality', 'Structure & Transitions', 'Desired Outcome Alignment']
export const CATEGORIES = ['Unclear Main Message', 'Missing Audience Relevance', 'Unsupported Claim', 'Excessive Jargon', 'Weak Transition', 'Unclear Takeaway', 'Missing Call to Action', 'Overlong Explanation']
export const STATUSES = ['Improved', 'Partially Improved', 'Not Yet Improved', 'Insufficient Evidence']
export const GUIDANCE = {
  Technical: ['Explain the mechanism and implementation constraints.', 'Support claims with available evidence.', 'Name limitations and technical trade-offs.'],
  Business: ['Explain the practical problem first.', 'Connect the proposal to value, cost or risk.', 'Separate expected benefits from demonstrated results.', 'Make your intended outcome clear.'],
  General: ['Give enough context before introducing details.', 'Explain unfamiliar terms in everyday language.', 'Use a relevant example.', 'Finish with one clear takeaway.'],
}

const string = { type: 'string', maxLength: 2400 }
const enumeration = (values) => ({ type: 'string', enum: values })
const array = (items, maxItems = 8) => ({ type: 'array', items, maxItems })
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const note = object({ originalText: string, explanation: string, suggestion: string })
const moment = object({
  category: enumeration(CATEGORIES), originalText: string, explanation: string,
  audienceImpact: string, priorityReason: string, instruction: string,
  suggestedRevision: string, practiceObjective: string,
})
export const analysisSchema = object({
  audiences: array(object({
    audienceType: enumeration(AUDIENCES),
    strengths: array(note, 3), improvementAreas: array(note, 3),
    dimensions: array(object({ dimension: enumeration(DIMENSIONS), originalText: string, explanation: string }), 5),
    primary: { anyOf: [moment, { type: 'null' }] }, secondary: array(moment, 2),
  }), 3),
})
export const comparisonSchema = object({
  improvementStatus: enumeration(STATUSES), explanation: string,
  targetAddressed: { type: 'boolean' }, coreMessagePreserved: { type: 'boolean' }, newMajorIssue: { type: 'boolean' },
  beforeEvidence: string, afterEvidence: string,
  accuracyNote: string, audienceFit: string, remainingIssue: string,
})

// Runtime validation also runs on the client: stored data and server responses are untrusted.
export function assertSchema(value, schema, path = 'output') {
  if (schema.anyOf) {
    if (!schema.anyOf.some((item) => { try { assertSchema(value, item, path); return true } catch { return false } })) throw new Error(`${path}: invalid value`)
    return
  }
  if (schema.type === 'null') { if (value !== null) throw new Error(`${path}: expected null`); return }
  if (schema.type === 'boolean') { if (typeof value !== 'boolean') throw new Error(`${path}: expected boolean`); return }
  if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length > (schema.maxLength || 10000) || (schema.enum && !schema.enum.includes(value))) throw new Error(`${path}: invalid string`)
    return
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > schema.maxItems) throw new Error(`${path}: invalid list`)
    value.forEach((item, i) => assertSchema(item, schema.items, `${path}[${i}]`)); return
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected object`)
  if (Object.keys(value).some((key) => !Object.hasOwn(schema.properties, key))) throw new Error(`${path}: unexpected field`)
  for (const key of schema.required) assertSchema(value[key], schema.properties[key], `${path}.${key}`)
}

export const normalize = (text) => text.replace(/\s+/g, ' ').trim()
export function hasQuote(transcript, quote) {
  return typeof quote === 'string' && normalize(quote).length > 0 && normalize(transcript).includes(normalize(quote))
}
export function validateContext(value) {
  const schema = object({ topic: string, coreMessage: string, desiredOutcome: string, targetAudience: enumeration(AUDIENCES), audienceDescription: string })
  assertSchema(value, schema, 'context')
  return value
}
export function contextFromSetup(setup = {}) {
  return validateContext({ topic: setup.topic || '', coreMessage: setup.coreMessage || '', desiredOutcome: setup.desiredOutcome || '', targetAudience: setup.targetAudience || 'General', audienceDescription: setup.audienceDescription || '' })
}

// New quantitative claims in a suggested version are rejected, never silently accepted.
function safeRevision(text, source) {
  const numbers = text.match(/\b\d+(?:[.,]\d+)*(?:%|\b)/g) || []
  const supplied = new Set(source.match(/\b\d+(?:[.,]\d+)*(?:%|\b)/g) || [])
  return numbers.every((number) => supplied.has(number))
}
export function validateAnalysis(value, transcript, context, practiceId) {
  assertSchema(value, analysisSchema)
  if (value.audiences.length !== 3 || new Set(value.audiences.map((a) => a.audienceType)).size !== 3) throw new Error('Three distinct audience views are required.')
  let rejectedEvidence = 0
  const grounded = (note) => {
    const ok = hasQuote(transcript, note.originalText)
    if (!ok) rejectedEvidence += 1
    return ok
  }
  const audiences = value.audiences.map((view) => {
    if (view.dimensions.length !== 5 || new Set(view.dimensions.map((d) => d.dimension)).size !== 5) throw new Error('All five impact dimensions are required.')
    const validMoment = (item, index) => {
      if (!item || !grounded(item)) return null
      if (!safeRevision(item.suggestedRevision, `${transcript} ${context.coreMessage} ${context.desiredOutcome}`)) { rejectedEvidence += 1; return null }
      if (['explanation', 'audienceImpact', 'priorityReason', 'instruction', 'practiceObjective'].some((key) => !item[key].trim())) return null
      if (['explanation', 'audienceImpact', 'priorityReason', 'instruction', 'practiceObjective'].some((key) => item[key].trim().split(/\s+/).length < 8)) { rejectedEvidence += 1; return null }
      return { ...item, id: `${practiceId}:${view.audienceType}:${index}` }
    }
    return {
      ...view, strengths: view.strengths.filter(grounded), improvementAreas: view.improvementAreas.filter(grounded),
      dimensions: view.dimensions.filter(grounded),
      primary: validMoment(view.primary, 'primary'),
      secondary: view.secondary.map(validMoment).filter(Boolean),
    }
  })
  return { audiences, rejectedEvidence, practiceId }
}
export function validateComparison(value, before, after) {
  assertSchema(value, comparisonSchema)
  const supported = hasQuote(before, value.beforeEvidence) && hasQuote(after, value.afterEvidence) && after.trim().split(/\s+/).length >= 8
  if (!supported) return {
    improvementStatus: 'Insufficient Evidence', explanation: 'The comparison did not supply verifiable quotes from both attempts. Review the actual texts below.',
    targetAddressed: false, coreMessagePreserved: false, newMajorIssue: false,
    beforeEvidence: '', afterEvidence: '', accuracyNote: 'Not established.', audienceFit: 'Not established.', remainingIssue: '',
  }
  const materiallyImproved = value.targetAddressed && value.coreMessagePreserved && !value.newMajorIssue
  const someProgress = value.targetAddressed || value.coreMessagePreserved
  const improvementStatus = value.improvementStatus === 'Improved' && !materiallyImproved
    ? (someProgress ? 'Partially Improved' : 'Not Yet Improved')
    : value.improvementStatus === 'Partially Improved' && !someProgress
      ? 'Not Yet Improved'
      : value.improvementStatus
  return { ...value, improvementStatus }
}

// Timing may only be attached from an explicitly supplied, verified alignment source.
export function alignedMoment(moment, segments = []) {
  const match = segments.find((s) => s.source === 'verified-audio-alignment' && s.text === moment.originalText && Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.startMs >= 0 && s.endMs > s.startMs)
  return match ? { ...moment, startMs: match.startMs, endMs: match.endMs } : { ...moment }
}
