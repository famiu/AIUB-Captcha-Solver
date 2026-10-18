// Runs extension/solver.js over a dump from dump_real.py and reports what the
// extension would do with each captcha: fill in a correct answer, fill in a
// wrong one, or refresh (not confident enough).
// usage: node eval_js.js REAL.bin [--model MODEL.js] [--min-confidence P]
"use strict";

const fs = require("fs");
const path = require("path");
const util = require("util");
const vm = require("vm");

const ext = path.join(__dirname, "..", "extension");
const usage = "usage: node eval_js.js REAL.bin [--model MODEL.js] [--min-confidence P]\n" +
  "  --model           model file from export.py (default: extension/model.js)\n" +
  "  --min-confidence  probability an answer needs (default: the extension's)";
let args;
try {
  args = util.parseArgs({
    allowPositionals: true,
    options: { model: { type: "string" }, "min-confidence": { type: "string" } },
  });
} catch (e) {
  console.error(`${e.message}\n${usage}`);
  process.exit(2);
}
if (args.positionals.length !== 1) {
  console.error(usage);
  process.exit(2);
}
const modelFile = args.values.model || path.join(ext, "model.js");

const ctx = { atob: (s) => Buffer.from(s, "base64").toString("binary"), module: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(modelFile, "utf8"), ctx, { filename: modelFile });
vm.runInContext(fs.readFileSync(path.join(ext, "solver.js"), "utf8"), ctx, { filename: "solver.js" });
const solver = ctx.module.exports;
const minArg = args.values["min-confidence"];
const minConfidence = minArg === undefined ? solver.MIN_CONFIDENCE : Number(minArg);
if (minArg === "" || !(minConfidence >= 0 && minConfidence <= 1)) {
  console.error(`--min-confidence must be a number from 0 to 1\n${usage}`);
  process.exit(2);
}
const dump = args.positionals[0];

const buf = fs.readFileSync(dump);
const rec = 16 + solver.W * solver.H * 4;
if (buf.length === 0 || buf.length % rec) {
  console.error(`${dump}: not a dump from dump_real.py (size ${buf.length} is not a multiple of ${rec})`);
  process.exit(1);
}
let n = 0;
let correct = 0;
let wrong = 0;
let refresh = 0;
const t0 = Date.now();
for (let off = 0; off < buf.length; off += rec) {
  const [name, expr] = buf.toString("latin1", off, off + 16).trim().split(" ");
  const rgba = new Uint8ClampedArray(buf.buffer, buf.byteOffset + off + 16, solver.W * solver.H * 4);
  const r = solver.solveRGBA(rgba, minConfidence);
  const [, a, op, b] = /^(\d+)([+-])(\d+)$/.exec(expr);
  const want = op === "+" ? +a + +b : a - b;
  n++;
  if (!r.confident) {
    refresh++;
  } else if (r.answer === want) {
    correct++;
  } else {
    wrong++;
    console.log(`wrong ${name}: want ${expr} = ${want}, got ${r.answer} (confidence ${r.confidence.toFixed(3)})`);
  }
}
const ms = (Date.now() - t0) / n;
console.log(`${n} captchas, needing confidence ${minConfidence}: ${correct} correct, ${wrong} wrong, ${refresh} refreshed; ${ms.toFixed(0)} ms/captcha`);
