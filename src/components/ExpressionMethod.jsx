export default function ExpressionMethod() {
  return <details className="expression-method">
    <summary>How this analysis works · research & limits</summary>
    <div className="expression-method-grid">
      <div><h3>1. A goal before feedback</h3><p>You choose the situation, listener and intended message, then test one change. Goal setting, self-monitoring, feedback and rehearsal are described in the <a href="https://discovery.ucl.ac.uk/id/eprint/10176196/" target="_blank" rel="noreferrer">Behaviour Change Technique Ontology (Marques et al., 2023)</a>. This informs our practice design; it does not validate this app’s effectiveness.</p></div>
      <div><h3>2. Observation before interpretation</h3><p>We measure visible landmark movement and pair it with your words. Meaning depends on context. <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC8353184/" target="_blank" rel="noreferrer">Nonverbal Social Sensing (2021)</a> explains why movement detection and interpretation are different tasks. Movement does not establish emotion, personality or attention.</p></div>
      <div><h3>3. Your own comparison</h3><p>Gesture use varies between people. <a href="https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01828/full" target="_blank" rel="noreferrer">Schmalenbach et al. (2017)</a> studied individual differences using self-report and a perception task. We therefore use your confirmed examples as a design choice, rather than a universal ideal.</p></div>
    </div>
    <p>Comparisons use earlier sessions with the same scene, audience category, focus, seated/standing setup and confirmed meaning. Different goals within those groups may still affect movement; replay before interpreting a difference.</p>
    <p className="expression-small">Technical rules: roughly 4 samples/second; at least 8 valid measurements and 60% visibility for a metric; at least 50% frame coverage to save movement evidence. Three earlier independent sessions start an exploratory comparison using session medians and median absolute deviation. These are engineering thresholds, not scientifically validated cutoffs or confidence scores. Camera distance, lighting, culture and accessibility needs can still affect the result.</p>
  </details>;
}
