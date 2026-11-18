const valid = p => p && (p.visibility === undefined || p.visibility > 0.65);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function landmarkMetrics(f, p, frameObserved = false, hands = null) {
    /** @type {Record<string, any>} */
    const metrics = frameObserved || f || p ? { facePresent: Boolean(f), bodyPresent: Boolean(p && valid(p[11]) && valid(p[12])) } : {};
    if (f) {
      const width = distance(f[33], f[263]);
      if (width > 0.03) {
        metrics.faceX = (f[33].x + f[263].x) / 2;
        metrics.faceY = (f[33].y + f[263].y) / 2;
        metrics.faceSize = width;
        metrics.faceClipped = f.some(point => point.x < .015 || point.x > .985 || point.y < .015 || point.y > .985);
        if (f[13] && f[14]) metrics.mouth = distance(f[13], f[14]) / width;
        metrics.head = (f[1].x - (f[33].x + f[263].x) / 2) / width;
        metrics.headVertical = (f[1].y - (f[33].y + f[263].y) / 2) / width;
        metrics.headTilt = (f[263].y - f[33].y) / width;
        if (f[105] && f[159]) metrics.brow = distance(f[105], f[159]) / width;
        // Iris position proxy, not eye contact, emotion or attention inference.
        if (f[468]) metrics.eyes = distance(f[468], f[33]) / Math.max(0.01, distance(f[133], f[33]));
        if (f[468] && f[473] && f[133] && f[362] && f[159] && f[145] && distance(f[159], f[145]) / width > .015) {
          const project = (iris, a, b) => ((iris.x-a.x)*(b.x-a.x)+(iris.y-a.y)*(b.y-a.y))/Math.max(.0001,(b.x-a.x)**2+(b.y-a.y)**2);
          metrics.gazeHorizontal = (project(f[468], f[33], f[133]) + project(f[473], f[362], f[263])) / 2;
        }
      }
    }
    if (p && valid(p[11]) && valid(p[12])) {
      const width = distance(p[11], p[12]);
      if (width > 0.03) {
        metrics.bodyClipped = [p[11], p[12]].some(point => point.x < .025 || point.x > .975 || point.y < .025 || point.y > .975);
        metrics.poseVisibility = Math.min(p[11].visibility ?? 1, p[12].visibility ?? 1);
        metrics.posture = (p[11].y - p[12].y) / width;
        if(valid(p[0]))metrics.headBodyOffset=(p[0].x-(p[11].x+p[12].x)/2)/width;
        if (valid(p[23]) && valid(p[24])) metrics.bodyLean = ((p[11].x+p[12].x)-(p[23].x+p[24].x))/(2*width);
        metrics.handsVisible = Boolean(valid(p[15]) && valid(p[16]));
        if (valid(p[15]) && valid(p[16])) {
          metrics.hands = (distance(p[15], p[11]) + distance(p[16], p[12])) / (2 * width);
          metrics.leftHand = (p[15].y - p[11].y) / width;
          metrics.rightHand = (p[16].y - p[12].y) / width;
        }
      }
    }
    if (Array.isArray(hands)) {
      metrics.handModelAvailable = true;
      metrics.handCount = hands.length;
      metrics.handTracks = hands.map(hand => ({
        side: hand.side,
        x: hand.landmarks[0].x,
        y: hand.landmarks[0].y,
        spread: distance(hand.landmarks[4], hand.landmarks[20]),
      }));
      for (const point of metrics.handTracks) {
        const side = point.side.toLowerCase();
        if (['left','right'].includes(side)) { metrics[`${side}HandX`] = point.x; metrics[`${side}HandY`] = point.y; }
      }
      metrics.handsVisible = hands.length > 0;
    }
  return metrics;
}
