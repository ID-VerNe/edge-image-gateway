import { writeFileSync } from "node:fs";
import UPNG from "../vendor/upng/UPNG.esm.js";
import jpeg from "jpeg-js";
const { resize } = await import("../src/resize/index.ts");
const { encodeWebp } = await import("../src/encode/webp.ts");

// Build a truecolor+alpha PNG via UPNG.encode
const w=160,h=120;
const rgba=new Uint8Array(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4; rgba[i]=x*1.5; rgba[i+1]=y*2; rgba[i+2]=100; rgba[i+3]=(x+y)%2?200:255; }
const pngBytes = UPNG.encode([rgba], w, h, 0);
console.log("png bytes:", pngBytes.length, "magic:", Array.from(pngBytes.slice(0,8)).map(b=>String.fromCharCode(b)).join(""));

// Now decode through our wrapper
const { decodePng } = await import("../src/decode/png.ts");
const dec = decodePng(pngBytes);
console.log("decoded png:", dec.width+"x"+dec.height, "len", dec.data.length, "expected", w*h*4);
if (dec.width!==w||dec.height!==h||dec.data.length!==w*h*4) process.exit(1);

// resize + encode
const r = resize({ src: dec.data, width: dec.width, height: dec.height, toWidth: 80, toHeight: 60, filter: "lanczos3" });
const out = encodeWebp({ data: r, width: 80, height: 60 }, { lossless: true });
writeFileSync("test/out_png.webp", out.bytes);
console.log("png->webp:", out.bytes.length, "bytes");

// round-trip via ts-webp
const { decode } = await import("@stacksjs/ts-webp");
const rt = decode(out.bytes);
console.log("round-trip:", rt.width+"x"+rt.height, "hasAlpha", rt.hasAlpha);
console.log("PNG ALL OK");
