import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VoiceInteraction} from '../../src/lib/voice/VoiceInteraction.js';
test('late language feedback keeps speaking state, original transcript and media association',()=>{
 const session=new VoiceInteraction({initialMessages:[{id:'user-turn-1',role:'user',content:'Please check this drink.',recordingId:'original-take'}]});
 session.update({status:'speaking',activePlaybackId:'ai-turn-1'});
 assert.equal(session.applyTurnFeedback('turn-1',{task:'Relevant to the drink.'}),true);
 assert.equal(session.getSnapshot().status,'speaking');
 assert.equal(session.getSnapshot().messages[0].recordingId,'original-take');
 assert.equal(session.getSnapshot().messages[0].content,'Please check this drink.');
 assert.equal(session.applyTurnFeedback('other-turn',{task:'Wrong turn.'}),false);
 session.ended=true;assert.equal(session.applyTurnFeedback('turn-1',{task:'Too late.'}),false);session.dispose();
});
