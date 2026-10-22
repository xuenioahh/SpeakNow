import fs from 'node:fs/promises';
import path from 'node:path';
import { blindPacket, validateDataset, validateRatings, digest, evaluate, usageMetrics, priorityCandidates, validatePriorityReviews } from './lib.mjs';
const [command, input, second, third, fourth] = process.argv.slice(2);
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); };
const recordingPath = (file, ref) => {
  const directory = path.resolve(path.dirname(file)), resolved = path.resolve(directory, ref);
  if (!resolved.startsWith(directory + path.sep)) throw new Error('Reviewer recordings must be inside the private dataset folder.');
  return resolved;
};
if (command === 'blind') {
  const dataset = validateDataset(await read(input)), { packet, mapping } = blindPacket(dataset);
  const out = second; await write(path.join(out, 'blind-packet.json'), packet); await write(path.join(out, 'private-mapping.json'), mapping);
  // Neutral audio filenames hide chronology from reviewers. No media is uploaded.
  for (const pair of dataset.pairs) for (const take of ['A', 'B']) {
    const source = pair[mapping[pair.pairId][take]].recordingRef;
    await fs.copyFile(recordingPath(input, source), path.join(out, packet.pairs.find(value => value.pairId === pair.pairId)[take].recordingRef));
  }
  console.log(`Prepared ${packet.pairs.length} pairs. Share blind-packet and anonymous recordings only; keep mapping and AI outputs private.`);
} else if (command === 'priority-blind') {
  const dataset = validateDataset(await read(input));
  const candidates = priorityCandidates(dataset), out = second;
  const packet = candidates.map(candidate => ({ practiceId: candidate.practiceId, goal: candidate.goal, audience: candidate.audience, transcript: candidate.transcript, recordingRef: `${candidate.practiceId}${path.extname(candidate.recordingRef) || '.webm'}` }));
  await write(path.join(out, 'priority-blind-packet.json'), packet);
  for (let i = 0; i < candidates.length; i++) await fs.copyFile(recordingPath(input, candidates[i].recordingRef), path.join(out, packet[i].recordingRef));
  console.log(`Prepared ${packet.length} original-only priorities; AI choices are withheld.`);
} else if (command === 'lock-priorities') {
  const dataset = validateDataset(await read(input)), reviews = await read(second);
  validatePriorityReviews(dataset, reviews);
  await write(third, { lockedAt: new Date().toISOString(), datasetSha256: digest(dataset), sha256: digest(reviews), reviews });
  console.log('Independent original-only priorities locked before AI is revealed.');
} else if (command === 'lock') {
  const dataset = validateDataset(await read(input)), ratings = await read(second), mapping = await read(fourth);
  validateRatings(ratings, new Set(dataset.pairs.map(p => p.pairId)));
  await write(third, { lockedAt: new Date().toISOString(), datasetSha256: digest(dataset), mappingSha256: digest(mapping), sha256: digest(ratings), ratings });
  console.log('Human judgements locked before unblinding.');
} else if (command === 'report') {
  const dataset = await read(input), locked = await read(second), mapping = await read(third), reviews = fourth ? await read(fourth) : [];
  console.log(JSON.stringify(evaluate(dataset, locked, mapping, reviews), null, 2));
} else if (command === 'metrics') {
  console.log(JSON.stringify(usageMetrics(await read(input), second ? await read(second) : []), null, 2));
} else {
  throw new Error('Usage: blind dataset.json output-dir | priority-blind dataset.json output-dir | lock-priorities dataset.json reviews.json locked-priorities.json | lock dataset.json ratings.json locked.json private-mapping.json | report dataset.json locked.json private-mapping.json [priority-reviews.json] | metrics dataset.json [offers.json]');
}
