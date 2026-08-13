import qrcodeTerminal from "qrcode-terminal";

// qrcode-terminal's "small" mode omits the QR's quiet zone (the blank
// margin scanners rely on to find the code), so we pad it back in here.
function addQuietZone(ascii: string): string {
  const lines = ascii.split("\n");
  const width = Math.max(...lines.map((line) => line.length));
  const blankLine = " ".repeat(width + 4);
  const padded = lines.map((line) => `  ${line.padEnd(width)}  `);
  return [blankLine, blankLine, ...padded, blankLine, blankLine].join("\n");
}

export function renderQrAscii(data: string): Promise<string> {
  return new Promise((resolve) => {
    qrcodeTerminal.generate(data, { small: true }, (ascii) => resolve(addQuietZone(ascii)));
  });
}
