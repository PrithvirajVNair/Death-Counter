import React, { useMemo } from 'react';

export default function Embers({ count = 8 }) {
  const positions = useMemo(() =>
    Array.from({ length: count }, () => ({
      left: `${10 + Math.random() * 80}%`,
      animationDelay: `${Math.random() * 6}s`,
      animationDuration: `${4 + Math.random() * 4}s`,
    })),
    [count]
  );

  return (
    <div className="embers" aria-hidden="true">
      {positions.map((style, i) => (
        <div key={i} className="ember" style={style} />
      ))}
    </div>
  );
}
