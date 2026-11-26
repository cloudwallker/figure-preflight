interface LayoutBounds {
  inkAabb: number[];
  envelopeAabb: number[];
  layoutPx: number[] | null;
}

interface TextReference {
  inkAabb: number[];
  envelopeAabb: number[];
  advancePx: number[] | null;
  gridFitted: LayoutBounds;
  fractional?: LayoutBounds;
}

// These projects launch pinned local browsers. Select their font layout mode
// before comparing any measured coordinates.
export function textBoundsForEngine(ref: TextReference, browserName: string): LayoutBounds {
  if (process.platform === 'linux' && browserName === 'chromium') {
    return ref.gridFitted;
  }
  if (process.platform === 'linux' && browserName === 'firefox' && ref.fractional) {
    return ref.fractional;
  }
  return {inkAabb: ref.inkAabb, envelopeAabb: ref.envelopeAabb, layoutPx: ref.advancePx};
}
