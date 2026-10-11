#!/usr/bin/env node
// Embeds reskin/base.css into ifv.user.js between the IFV-RESKIN-CSS markers.
// Edit reskin/base.css, then run: node tools/embed-reskin.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "ifv.user.js");
const cssPath = join(root, "reskin", "base.css");

const START = "        /* IFV-RESKIN-CSS:START */\n";
const END = "\n        /* IFV-RESKIN-CSS:END */";

const css = readFileSync(cssPath, "utf8")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");

const block = `${START}        "reskin/base.css": \`\n${css}\`,\n${END}`;

const source = readFileSync(target, "utf8");
const startIdx = source.indexOf(START);
const endIdx = source.indexOf(END, startIdx);
if (startIdx === -1 || endIdx === -1) {
    console.error("Markers not found in ifv.user.js");
    process.exit(1);
}

const next =
    source.slice(0, startIdx) +
    block +
    source.slice(endIdx + END.length);

if (next === source) {
    console.log("No changes — ifv.user.js already up to date.");
} else {
    writeFileSync(target, next);
    console.log(
        `Embedded reskin/base.css (${css.length} bytes) into ifv.user.js.`,
    );
}
