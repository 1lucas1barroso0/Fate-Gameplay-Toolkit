import * as React from "react";

export function FateMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Quatro dados Fate" {...props}>
      <path className="mark-back" d="M18 3h28l15 15v28L46 61H18L3 46V18Z" />
      <g className="mark-tiles">
        <rect x="11" y="11" width="19" height="19" rx="5" />
        <rect x="34" y="11" width="19" height="19" rx="5" />
        <rect x="11" y="34" width="19" height="19" rx="5" />
        <rect x="34" y="34" width="19" height="19" rx="5" />
      </g>
      <g className="mark-symbols" strokeLinecap="round">
        <path d="M17 20.5h7" />
        <path d="M40 20.5h7M43.5 17v7" />
        <circle cx="20.5" cy="43.5" r="2.2" />
        <circle cx="43.5" cy="43.5" r="2.2" />
      </g>
    </svg>
  );
}
