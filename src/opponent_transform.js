export function rgbToOpponent(rgb) {
  const [r, g, b] = rgb;
  return {
    blackWhite: 0.299 * r + 0.587 * g + 0.114 * b,
    redGreen: r - g,
    yellowBlue: 0.5 * (r + g) - b
  };
}

export function opponentComplementarity(opA, opB) {
  const rw = Math.abs(opA.blackWhite - (1 - opB.blackWhite));
  const rg = Math.abs(opA.redGreen + opB.redGreen);
  const yb = Math.abs(opA.yellowBlue + opB.yellowBlue);
  return Math.max(0, 1 - (0.34 * rw + 0.33 * rg + 0.33 * yb));
}
