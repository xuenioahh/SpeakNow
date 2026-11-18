import {test} from 'node:test';
import assert from 'node:assert/strict';
import {landmarkMetrics} from '../../src/lib/expressionLandmarks.js';
test('missing video evidence stays unassessed; only a processed frame can report absent landmarks',()=>{
 assert.deepEqual(landmarkMetrics(undefined,undefined),{});
 assert.deepEqual(landmarkMetrics(undefined,undefined,true),{facePresent:false,bodyPresent:false});
});
