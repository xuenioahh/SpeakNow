import { AUDIENCES, DIMENSIONS } from '../../src/impact/contracts.js'
export const context = { topic: 'AI Infrastructure Upgrade', coreMessage: 'A new infrastructure design could improve response time and reduce operational costs.', desiredOutcome: 'Explain the proposal clearly.', targetAudience: 'Business', audienceDescription: 'Business executives with limited technical knowledge.' }
export const transcript = 'We redesigned the inference pipeline using a distributed caching architecture. Our solution will completely transform the industry.'
export function fixture(text = transcript, category = 'Unsupported Claim') {
  const quote = text.includes('Our solution') ? 'Our solution will completely transform the industry.' : text
  return {
    audiences: AUDIENCES.map((audienceType) => ({
      audienceType, strengths: [], improvementAreas: [],
      dimensions: DIMENSIONS.map((dimension) => ({ dimension, originalText: text.split('. ')[0], explanation: `${audienceType}: review ${dimension} against the actual transcript.` })),
      primary: category ? {
        category, originalText: quote,
        explanation: 'The sweeping claim is not accompanied by supporting evidence in this transcript.',
        audienceImpact: audienceType === 'Technical' ? 'Explain the key implementation limits and supporting performance evidence that you can share.' : audienceType === 'Business' ? 'Connect the proposal to value, cost and risk using evidence you actually have.' : 'For this audience, explain the unfamiliar technical term in plain everyday language with one simple relevant example.',
        priorityReason: 'This central claim affects credibility and can be narrowed in one short attempt.',
        instruction: 'Qualify the claim and provide evidence you possess, or acknowledge what remains untested.',
        suggestedRevision: 'We propose testing whether this design can improve the system; the impact has not yet been demonstrated.',
        practiceObjective: 'Explain the proposal cautiously and distinguish expected benefits from demonstrated results in 30 seconds.',
      } : null,
      secondary: [],
    })),
  }
}
export const comparison = {
  improvementStatus: 'Improved', explanation: 'The revised version explicitly states the uncertainty instead of promising an industry transformation.',
  targetAddressed: true, coreMessagePreserved: true, newMajorIssue: false,
  beforeEvidence: 'Our solution will completely transform the industry.', afterEvidence: 'We need to test whether it helps.',
  accuracyNote: 'The proposal remains a proposal; external technical accuracy is not verified.', audienceFit: 'The qualification makes the proposed evaluation clearer for decision makers.', remainingIssue: '',
}

export const weakComparison = {
  improvementStatus: 'Improved', explanation: 'The attempt is longer.',
  targetAddressed: false, coreMessagePreserved: true, newMajorIssue: false,
  beforeEvidence: 'Our solution will completely transform the industry.',
  afterEvidence: 'We redesigned the inference pipeline using a distributed caching architecture. The system uses several layers and has many technical components that are still being evaluated.',
  accuracyNote: 'Not verified.', audienceFit: 'The claim remains unsupported.', remainingIssue: 'Connect the design to the stated outcome and add only available evidence.',
}
