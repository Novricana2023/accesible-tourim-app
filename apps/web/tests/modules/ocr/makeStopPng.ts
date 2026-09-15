import { deflateSync } from "node:zlib";

const GLYPHS: Record<string, string[]> = {
  S: [
    "011110",
    "110011",
    "110000",
    "011110",
    "000011",
    "110011",
    "011110",
  ],
  T: [
    "111111",
    "111111",
    "001100",
    "001100",
    "001100",
    "001100",
    "001100",
  ],
  O: [
    "011110",
    "110011",
    "110011",
    "110011",
    "110011",
    "110011",
    "011110",
  ],
  P: [
    "111110",
    "110011",
    "110011",
    "111110",
    "110000",
    "110000",
    "110000",
  ],
};

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const header = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(header.buffer);
  view.setUint32(0, data.length);
  header[4] = type.charCodeAt(0);
  header[5] = type.charCodeAt(1);
  header[6] = type.charCodeAt(2);
  header[7] = type.charCodeAt(3);
  header.set(data, 8);
  const crcInput = header.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput));
  return header;
}

export function makeStopPng(): Uint8Array {
  const scale = 20;
  const pad = 40;
  const letters = "STOP".split("");
  const glyphW = 6;
  const glyphH = 7;
  const gap = 2;
  const innerW = letters.length * glyphW + (letters.length - 1) * gap;
  const width = pad * 2 + innerW * scale;
  const height = pad * 2 + glyphH * scale;
  const pixels = new Uint8Array(width * height);
  pixels.fill(255);

  letters.forEach((letter, index) => {
    const glyph = GLYPHS[letter];
    if (!glyph) {
      return;
    }
    const originX = pad + index * (glyphW + gap) * scale;
    const originY = pad;
    for (let gy = 0; gy < glyph.length; gy += 1) {
      for (let gx = 0; gx < glyph[gy]!.length; gx += 1) {
        if (glyph[gy]![gx] !== "1") {
          continue;
        }
        for (let py = 0; py < scale; py += 1) {
          for (let px = 0; px < scale; px += 1) {
            const x = originX + gx * scale + px;
            const y = originY + gy * scale + py;
            pixels[y * width + x] = 0;
          }
        }
      }
    }
  });

  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0;
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const compressed = deflateSync(raw);

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [signature, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", new Uint8Array())];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}
