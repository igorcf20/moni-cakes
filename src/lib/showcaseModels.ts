// Modelos 3D gerados em código para a vitrine da página inicial (até haver fotos e STL de produtos reais).
// Saída no formato do STL: 9 números por triângulo, em mm, com Z para cima.

/** Vaso facetado e torcido (visual low-poly), 140 mm de altura, boca aberta. */
export function facetedVase(): Float32Array {
  const sides = 9;
  const twist = 0.2; // rad por anel
  const profile: [number, number][] = [ // [altura, raio] em mm
    [0, 26], [8, 34], [24, 42], [46, 46], [70, 41], [92, 31], [108, 24], [122, 25], [134, 31], [140, 33],
  ];
  const ring = (i: number) => {
    const [z, r] = profile[i];
    return Array.from({ length: sides }, (_, j) => {
      const a = (j / sides) * Math.PI * 2 + i * twist;
      return [Math.cos(a) * r, Math.sin(a) * r, z] as const;
    });
  };
  const rings = profile.map((_, i) => ring(i));
  const out: number[] = [];
  const tri = (...v: (readonly [number, number, number])[]) => v.forEach((p) => out.push(p[0], p[1], p[2]));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = rings[i][j], b = rings[i][(j + 1) % sides], c = rings[i + 1][(j + 1) % sides], d = rings[i + 1][j];
      tri(a, b, c);
      tri(a, c, d);
    }
  }
  const o = [0, 0, 0] as const;
  for (let j = 0; j < sides; j++) tri(o, rings[0][(j + 1) % sides], rings[0][j]);
  return new Float32Array(out);
}

export const VASE_HEIGHT_MM = 140;
