const valid = p => p && (p.visibility === undefined || p.visibility > 0.65);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function landmarkMetrics(f, p) {
    const metrics = {};
    if (f) {
      const width = distance(f[33], f[263]);
      if (width > 0.03) {
        metrics.faceX = (f[33].x + f[263].x) / 2;
        metrics.faceY = (f[33].y + f[263].y) / 2;
        metrics.faceSize = width;
        if (f[13] && f[14]) metrics.mouth = distance(f[13], f[14]) / width;
        metrics.head = (f[1].x - (f[33].x + f[263].x) / 2) / width;
        metrics.headVertical = (f[1].y - (f[33].y + f[263].y) / 2) / width;
        // Iris position proxy, not eye contact, emotion or attention inference.
        if (f[468]) metrics.eyes = distance(f[468], f[33]) / Math.max(0.01, distance(f[133], f[33]));
      }
    }
    if (p && valid(p[11]) && valid(p[12])) {
      const width = distance(p[11], p[12]);
      if (width > 0.03) {
        metrics.posture = (p[11].y - p[12].y) / width;
        if (valid(p[15]) && valid(p[16])) {
          metrics.hands = (distance(p[15], p[11]) + distance(p[16], p[12])) / (2 * width);
          metrics.leftHand = (p[15].y - p[11].y) / width;
          metrics.rightHand = (p[16].y - p[12].y) / width;
        }
      }
    }
  return metrics;
}
