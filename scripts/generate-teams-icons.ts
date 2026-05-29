import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const outputDir = "teams";

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function encodePng(width: number, height: number, pixels: Uint8Array) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    scanlines[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, y * stride, stride).copy(scanlines, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function setPixel(pixels: Uint8Array, width: number, x: number, y: number, color: [number, number, number, number]) {
  if (x < 0 || y < 0 || x >= width) return;
  const offset = (y * width + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function fillRect(pixels: Uint8Array, width: number, height: number, x: number, y: number, w: number, h: number, color: [number, number, number, number]) {
  for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx += 1) {
      setPixel(pixels, width, xx, yy, color);
    }
  }
}

function fillTriangle(pixels: Uint8Array, width: number, height: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, color: [number, number, number, number]) {
  const minX = Math.floor(Math.max(0, Math.min(ax, bx, cx)));
  const maxX = Math.ceil(Math.min(width - 1, Math.max(ax, bx, cx)));
  const minY = Math.floor(Math.max(0, Math.min(ay, by, cy)));
  const maxY = Math.ceil(Math.min(height - 1, Math.max(ay, by, cy)));
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const w1 = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / area;
      const w2 = ((cx - bx) * (y - by) - (cy - by) * (x - bx)) / area;
      const w3 = ((ax - cx) * (y - cy) - (ay - cy) * (x - cx)) / area;
      if ((w1 >= 0 && w2 >= 0 && w3 >= 0) || (w1 <= 0 && w2 <= 0 && w3 <= 0)) setPixel(pixels, width, x, y, color);
    }
  }
}

function makeColorIcon(size: number) {
  const pixels = new Uint8Array(size * size * 4);
  fillRect(pixels, size, size, 0, 0, size, size, [17, 26, 34, 255]);
  fillTriangle(pixels, size, size, size * 0.2, size * 0.67, size * 0.5, size * 0.17, size * 0.8, size * 0.67, [19, 168, 158, 255]);
  fillTriangle(pixels, size, size, size * 0.37, size * 0.67, size * 0.5, size * 0.43, size * 0.63, size * 0.67, [248, 250, 252, 235]);
  fillRect(pixels, size, size, Math.round(size * 0.28), Math.round(size * 0.74), Math.round(size * 0.44), Math.round(size * 0.09), [230, 169, 51, 255]);
  return encodePng(size, size, pixels);
}

function makeOutlineIcon(size: number) {
  const pixels = new Uint8Array(size * size * 4);
  fillTriangle(pixels, size, size, size * 0.2, size * 0.67, size * 0.5, size * 0.17, size * 0.8, size * 0.67, [255, 255, 255, 255]);
  fillTriangle(pixels, size, size, size * 0.37, size * 0.67, size * 0.5, size * 0.43, size * 0.63, size * 0.67, [0, 0, 0, 0]);
  fillRect(pixels, size, size, Math.round(size * 0.28), Math.round(size * 0.74), Math.round(size * 0.44), Math.round(size * 0.09), [255, 255, 255, 255]);
  return encodePng(size, size, pixels);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "color.png"), makeColorIcon(192));
writeFileSync(join(outputDir, "outline.png"), makeOutlineIcon(32));
console.log("Generated teams/color.png and teams/outline.png");
