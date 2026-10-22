import { useEffect, useRef } from 'react';


const SCENARIO_IMAGES = {
  airport: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&q=80",
  bank: "https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?w=400&q=80",
  hotel: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&q=80",
  restaurant: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=80",
  shopping: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&q=80",
  hospital: "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=400&q=80",
  university: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=400&q=80",
  office: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80",
  phone: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&q=80",
  car_rental: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=400&q=80",
  museum: "https://images.unsplash.com/photo-1544967082-d9d25d867d66?w=400&q=80",
  cafe: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&q=80",
};

export default function ScenarioCard({ scenario, onClick, selected = false }) {
  const frame = useRef(0);
  const pointer = useRef(null);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const Icon = scenario.icon;
  const imgUrl = SCENARIO_IMAGES[scenario.id];

  return (
    <button
      aria-label={`Preview ${scenario.title}`} aria-pressed={selected}
      onPointerMove={e => {
        if (e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const node = e.currentTarget;
        pointer.current = { x: e.clientX, y: e.clientY, node };
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          const point = pointer.current;
          if (!point) return;
          const rect = node.getBoundingClientRect();
          const x = Math.min(1, Math.max(0, (point.x - rect.left) / Math.max(1, rect.width)));
          const y = Math.min(1, Math.max(0, (point.y - rect.top) / Math.max(1, rect.height)));
          node.style.setProperty('--pointer-x', `${x * 100}%`);
          node.style.setProperty('--pointer-y', `${y * 100}%`);
          node.style.setProperty('--tilt-x', `${-(y - 0.5) * 4}deg`);
          node.style.setProperty('--tilt-y', `${(x - 0.5) * 4}deg`);
        });
      }}
      onPointerLeave={e => { cancelAnimationFrame(frame.current); frame.current = 0; pointer.current = null; e.currentTarget.style.setProperty('--tilt-x', '0deg'); e.currentTarget.style.setProperty('--tilt-y', '0deg'); }}
      type="button"
      onClick={onClick}
      className="scenario-card glass glass-hover rounded-2xl flex flex-col items-center cursor-pointer text-left transition-colors duration-150 group relative"
    >
      {/* Background image */}
      {imgUrl && (
        <div className="w-full aspect-[16/9] overflow-hidden rounded-t-2xl relative">
          <img
            src={imgUrl}
            srcSet={`${imgUrl.replace("w=400", "w=200")} 200w, ${imgUrl} 400w`}
            alt=""
            width="400" height="225"
            sizes="(max-width: 600px) calc((100vw - 44px) / 2), (max-width: 900px) calc((100vw - 64px) / 3), (max-width: 1120px) calc((100vw - 80px) / 4), 260px"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
          {/* Icon badge */}
          <div className={`absolute bottom-2 left-2 w-8 h-8 rounded-lg bg-gradient-to-br ${scenario.color} flex items-center justify-center shadow-lg`}>
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      )}

      <div className="scenario-card-copy w-full px-4 py-4">
        <h3 className="font-semibold text-foreground text-base leading-tight">{scenario.title}</h3>
        <p className="text-sm text-muted-foreground mt-1.5 leading-snug">{scenario.subtitle}</p>
      </div>
    </button>
  );
}
