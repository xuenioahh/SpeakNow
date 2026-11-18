// Original staging for the existing 36 tasks. Coordinates use buildRoom's
// 6.85 × 5.65 m floor; actors remain at these positions for the room's lifetime.
const at = (position, station, role = '', pose = 'standing', camera = null) => ({ position, station, role, pose, camera });
const layouts = {
  cafe: [at([.05, 0, -1.62], 'Main counter', 'Barista'), at([1.65, 0, -1.62], 'Pickup counter', 'Pickup barista'), at([-2.25, 0, 1.15], 'Window table', 'Friend at the café', 'seated', [-1.7, 1.43, 3.8])],
  airport: [at([-1, 0, -1.3], 'Departure desk'), at([.85, 0, -1.3], 'Connections desk'), at([2.65, 0, .25], 'Baggage station')],
  bank: [at([-1.15, 0, -1.3], 'Account information'), at([.8, 0, -1.3], 'Application desk'), at([2.65, 0, .25], 'Document check')],
  hotel: [at([-1.15, 0, -1.45], 'Reception'), at([.85, 0, -1.45], 'Key desk'), at([2.65, 0, .35], 'Guest services')],
  restaurant: [at([-2.25, 0, .15], 'Menu service', '', 'standing', [-1.7, 1.65, 3.7]), at([.3, 0, -1.7], 'Kitchen liaison'), at([2.5, 0, -.7], 'Drinks service')],
  shopping: [at([-1.05, 0, -1.05], 'Technical service', '', 'standing', [-2.65, 1.65, 3.4]), at([.85, 0, -1.05], 'Returns desk'), at([2.65, 0, .6], 'Product display')],
  hospital: [at([-.6, 0, -1.3], 'Consultation desk'), at([-2.25, 0, 1], 'Examination area', '', 'standing', [-1.7, 1.65, 3.8]), at([2.55, 0, .3], 'Follow-up desk')],
  university: [at([-.7, 0, -1.3], 'Study planning'), at([-2.35, 0, -.8], 'Elective books', '', 'standing', [-1.8, 1.65, 3.3]), at([2.5, 0, .15], 'Registration calendar')],
  office: [at([.4, 0, -1.3], 'Team calendar'), at([-2.15, 0, -.6], 'Coverage discussion', '', 'standing', [-1.8, 1.65, 3.3]), at([2.5, 0, .2], 'Handover station')],
  // These are co-located role-play support representatives, not a claim that
  // a real telephone caller is physically inside the learner's home.
  phone: [at([-.8, 0, -1.3], 'Support call', 'Phone Support Representative'), at([-2.2, 0, -.7], 'Billing discussion', 'Billing Representative', 'standing', [-1.7, 1.65, 3.3]), at([2.25, 0, .3], 'Resolution desk', 'Phone Support Representative')],
  car_rental: [at([-2.65, 0, -1.15], 'Vehicle viewing', '', 'standing', [-2.6, 1.65, 3.8]), at([2, 0, -1.6], 'Key desk'), at([2.65, 0, .85], 'Cover information', '', 'standing', [2.8, 1.65, 3.9])],
  museum: [at([-2.45, 0, -1.35], 'Light study', '', 'standing', [-2.3, 1.65, 3.6]), at([1.45, 0, .25], 'Sculpture discussion'), at([2.45, 0, -1.3], 'Landscape study', '', 'standing', [3.05, 1.65, 3.35])],
};

export function getConversationAnchors(sceneId, cues) {
  return cues.map((cue, index) => {
    const layout = layouts[sceneId]?.[index];
    if (!layout) throw new Error(`Missing conversation anchor: ${sceneId}/${cue.id}`);
    const [x, , z] = layout.position;
    const cameraPosition = layout.camera || [Math.max(-2.8, Math.min(2.8, x * .8)), 1.65, 3.5];
    const npcYaw = Math.atan2(cameraPosition[0] - x, cameraPosition[2] - z);
    return { ...cue, sceneAnchorId: `${sceneId}:${cue.id}`, npcName: ['Alex', 'Sam', 'Jamie'][index], npcRole: layout.role,
      station: layout.station, pose: layout.pose, npcPosition: [...layout.position], npcYaw,
      cameraPosition, cameraTarget: [x, layout.pose === 'seated' ? 1.05 : 1.35, z],
      // Travel along the open front aisle before approaching a station.
      cameraWaypoint: [cameraPosition[0], cameraPosition[1], Math.max(3.8, cameraPosition[2])],
      anchor: [x, layout.pose === 'seated' ? 1.75 : 2.2, z], interactionDistance: 5.5 };
  });
}
