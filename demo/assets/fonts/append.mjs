import fs from "node:fs";

const addition = `
export const FONT_FACES = \`
  @font-face { font-family: 'Bebas Neue'; font-weight: 400; src: url(\${BEBAS}) format('woff2'); }
  @font-face { font-family: 'DM Mono'; font-weight: 400; src: url(\${DMMONO400}) format('woff2'); }
  @font-face { font-family: 'DM Mono'; font-weight: 500; src: url(\${DMMONO500}) format('woff2'); }
  @font-face { font-family: 'DM Sans'; font-weight: 100 1000; src: url(\${DMSANS}) format('woff2'); }
\`;
`;

fs.appendFileSync("../../titles/fonts.js", addition);
console.log("appended", addition.length, "bytes");
