import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { alignedMoment, validateAnalysis, validateComparison, hasQuote, validateContext, CATEGORIES } from '../../src/impact/contracts.js'
import { handleImpact, validateInput, COACHING_PROMPT } from '../../api/presentation-impact.js'
import { context, transcript, fixture, comparison, weakComparison } from './fixtures.js'


test('same transcript: three distinct grounded audience views', () => {
  const result = validateAnalysis(fixture(), transcript, context, 'original')
  assert.equal(result.audiences.length, 3)
  assert.equal(new Set(result.audiences.map((a) => a.primary.audienceImpact)).size, 3)
  assert.ok(result.audiences.every((a) => hasQuote(transcript, a.primary.originalText)))
})
test('unsupported claim can be prioritized without invented metrics', () => {
  const result = validateAnalysis(fixture(), transcript, context, 'original')
  assert.equal(result.audiences[1].primary.category, 'Unsupported Claim')
  assert.doesNotMatch(result.audiences[1].primary.suggestedRevision, /\d/)
})
test('all eight Moment Surgeon categories are constrained to the supported vocabulary', () => {
  assert.equal(CATEGORIES.length, 8)
  for (const category of CATEGORIES) {
    const result = validateAnalysis(fixture(transcript, category), transcript, context, 'original')
    assert.ok(result.audiences.every((a) => a.primary?.category === category))
  }
})
test('business relevance can take priority over language correctness', () => {
  const result = validateAnalysis(fixture(transcript, 'Missing Audience Relevance'), transcript, context, 'original')
  assert.equal(result.audiences[1].primary.category, 'Missing Audience Relevance')
  assert.match(COACHING_PROMPT, /Never penalize/)
})
test('already good: no forced primary or secondary problems', () => {
  const text = 'This pilot evaluates caching. In our supplied test the delay fell from 200 to 170 milliseconds. These results cover one workload only. Please review the pilot design.'
  const result = validateAnalysis(fixture(text, null), text, context, 'good')
  assert.ok(result.audiences.every((a) => a.primary === null && a.secondary.length === 0))
})
test('invented quotes are omitted from moments, strengths and dimensions', () => {
  const value = fixture()
  value.audiences[0].primary.originalText = 'The user did not say this.'
  value.audiences[0].strengths = [{ originalText: 'invented', explanation: 'bad', suggestion: '' }]
  value.audiences[0].dimensions[0].originalText = 'invented'
  const result = validateAnalysis(value, transcript, context, 'original')
  assert.equal(result.audiences[0].primary, null)
  assert.equal(result.audiences[0].strengths.length, 0)
  assert.equal(result.rejectedEvidence, 3)
})
test('new ROI and metrics in revisions are rejected', () => {
  const value = fixture()
  value.audiences[0].primary.suggestedRevision = 'This will save 35% and $100000.'
  assert.equal(validateAnalysis(value, transcript, context, 'original').audiences[0].primary, null)
})
test('unknown category, missing fields and model timestamps fail validation', () => {
  for (const mutate of [(v) => { v.audiences[0].primary.category = 'Accent Error' }, (v) => { delete v.audiences[0].primary.explanation }, (v) => { v.audiences[0].primary.startMs = 4500 }]) {
    const value = fixture(); mutate(value)
    assert.throws(() => validateAnalysis(value, transcript, context, 'original'))
  }
})
test('quoted evidence tolerates whitespace, not paraphrases', () => {
  assert.equal(hasQuote('Our\nproposal   may work.', 'Our proposal may work.'), true)
  assert.equal(hasQuote('Our proposal may work.', 'Our proposal will work.'), false)
  assert.equal(hasQuote(transcript, ''), false)
})
test('unique audiences and all dimensions required', () => {
  const value = fixture(); value.audiences[2].audienceType = 'Technical'
  assert.throws(() => validateAnalysis(value, transcript, context, 'original'))
  const other = fixture(); other.audiences[0].dimensions.pop()
  assert.throws(() => validateAnalysis(other, transcript, context, 'original'))
})
test('no timestamps without verified alignment', () => {
  const moment = fixture().audiences[0].primary
  assert.equal(alignedMoment(moment).startMs, undefined)
  assert.equal(alignedMoment(moment, [{ text: moment.originalText, startMs: 100, endMs: 1000, source: 'model' }]).startMs, undefined)
  assert.equal(alignedMoment(moment, [{ text: moment.originalText, startMs: 100, endMs: 1000, source: 'verified-audio-alignment' }]).startMs, 100)
})
test('comparison quotes both actual inputs or reports insufficient evidence', () => {
  const meaningful = 'We should test this design before claiming industry-wide impact, while preserving the proposal to improve response time and reduce operating costs.'
  assert.equal(validateComparison({ ...comparison, afterEvidence: 'We should test this design before claiming industry-wide impact' }, transcript, meaningful).improvementStatus, 'Improved')
  assert.equal(validateComparison(weakComparison, transcript, weakComparison.afterEvidence).improvementStatus, 'Partially Improved')
  assert.equal(validateComparison(comparison, transcript, 'Something else.').improvementStatus, 'Insufficient Evidence')
  const unresolved = { ...comparison, targetAddressed: false, coreMessagePreserved: false, afterEvidence: 'Our proposal will still completely transform the industry without presenting support from a test or a specific piece of evidence.' }
  assert.equal(validateComparison(unresolved, transcript, unresolved.afterEvidence).improvementStatus, 'Not Yet Improved')
  assert.equal(validateComparison(comparison, transcript, 'Yes, we should test it.').improvementStatus, 'Insufficient Evidence')
})
test('invalid context, empty or oversized input rejected', () => {
  assert.throws(() => validateContext({ ...context, targetAudience: 'Investors' }))
  for (const text of ['', 'a'.repeat(40001)]) assert.throws(() => validateInput({ mode: 'analyze', practiceId: 'original', context, transcript: text }))
})
test('comparison requires linked original practice and grounded target', () => {
  const base = { mode: 'compare', practiceId: 'retry', parentPracticeId: 'original', context, transcript: 'New attempt.', originalTranscript: transcript, originalText: transcript, target: { category: 'Unsupported Claim', originalText: 'fake', practiceObjective: 'Explain.' } }
  assert.throws(() => validateInput(base))
  assert.throws(() => validateInput({ ...base, target: { ...base.target, originalText: 'Our solution will completely transform the industry.' }, originalText: 'invented quote' }))
})
async function endpoint(body, env, fetcher) {
  const req = Readable.from([JSON.stringify(body)]); req.method = 'POST'
  const res = { setHeader() {}, end(text) { this.body = JSON.parse(text) } }
  await handleImpact(req, res, env, fetcher)
  return res
}
test('missing key returns honest unavailable state', async () => {
  const res = await endpoint({ mode: 'analyze', practiceId: 'original', context, transcript }, {})
  assert.equal(res.statusCode, 503); assert.equal(res.body.result, undefined)
})
test('one model call covers three views; usage recorded', async () => {
  let calls = 0
  const res = await endpoint({ mode: 'analyze', practiceId: 'original', context, transcript }, { OPENAI_API_KEY: 'test-key' }, async (_, options) => {
    calls += 1
    const body = JSON.parse(options.body)
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true)
    assert.equal(JSON.parse(body.input).transcript, transcript)
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(fixture()) }] }], usage: { input_tokens: 100, output_tokens: 200 } }) }
  })
  assert.equal(res.statusCode, 200); assert.equal(calls, 1); assert.equal(res.body.metrics.outputTokens, 200)
})
test('API publishes filtered evidence, never invalid raw model quotes', async () => {
  const tainted = fixture()
  tainted.audiences[0].primary.originalText = 'An invented sentence that was never spoken.'
  const res = await endpoint({ mode: 'analyze', practiceId: 'original', context, transcript }, { OPENAI_API_KEY: 'test-key' }, async () => ({
    ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(tainted) }] }] }),
  }))
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.result.audiences[0].primary, null)
  assert.equal(res.body.metrics.rejectedEvidence, 1)
  assert.equal(JSON.stringify(res.body).includes('An invented sentence'), false)
})
test('API downgrades weak claimed improvement before publication', async () => {
  const after = weakComparison.afterEvidence
  const body = {
    mode: 'compare', practiceId: 'retry', parentPracticeId: 'original', context,
    transcript: after, originalTranscript: transcript,
    originalText: 'Our solution will completely transform the industry.',
    target: { category: 'Unsupported Claim', originalText: 'Our solution will completely transform the industry.', practiceObjective: 'Qualify the claim and describe evidence in an honest 30-second attempt.' },
  }
  const res = await endpoint(body, { OPENAI_API_KEY: 'test-key' }, async () => ({
    ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(weakComparison) }] }] }),
  }))
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.result.improvementStatus, 'Partially Improved')
})
test('invalid, refused, incomplete and timed out responses publish no feedback', async () => {
  for (const result of [{ status: 'incomplete', output: [] }, { status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'No' }] }] }, { status: 'completed', output: [{ content: [{ type: 'output_text', text: '{}' }] }] }]) {
    const res = await endpoint({ mode: 'analyze', practiceId: 'original', context, transcript }, { OPENAI_API_KEY: 'test-key' }, async () => ({ ok: true, json: async () => result }))
    assert.equal(res.statusCode, 502); assert.equal(res.body.result, undefined)
  }
  const res = await endpoint({ mode: 'analyze', practiceId: 'original', context, transcript }, { OPENAI_API_KEY: 'test-key' }, async () => { throw new Error('timeout') })
  assert.equal(res.statusCode, 502)
})
test('rate limiting surfaced without automatic paid retries', async () => {
  const res = await endpoint({ mode: 'analyze', practiceId: 'original', context, transcript }, { OPENAI_API_KEY: 'test-key' }, async () => ({ ok: false, status: 429 }))
  assert.equal(res.statusCode, 429)
})
// Owned retry persistence is exercised by tests/consolidation/security.test.js.
