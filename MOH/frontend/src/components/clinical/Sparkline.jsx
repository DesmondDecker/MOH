export default function Sparkline({ points, width = 200, height = 40, unit = '' }) {
  if (!points || points.length < 2) {
    return <p className="text-xs text-ink-soft">Not enough readings yet to show a trend.</p>;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p.value - min) / range) * height;
    return `${x},${y}`;
  });

  return (
    <div>
      <svg width={width} height={height} className="text-teal" role="img" aria-label="Vitals trend">
        <polyline points={coords.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
        {points.map((p, i) => (
          <circle key={i} cx={i * stepX} cy={height - ((p.value - min) / range) * height} r="2.5" fill="currentColor" />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-ink-soft font-mono mt-1">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {values[values.length - 1]}
          {unit} latest
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}
