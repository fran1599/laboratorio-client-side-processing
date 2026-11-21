import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
const publicCopy=fs.readFileSync(new URL("../../site/experimentos/guia-destiny-2/index.html",import.meta.url),"utf8");
assert.equal(publicCopy,source,"Published demo must match the experiment source");
const content=source.match(/<script type="application\/json" id="guide-data">([\s\S]*?)<\/script>/);
assert.ok(content,"Guide JSON payload is missing");
const data=JSON.parse(content[1]);
assert.equal(data.stages.length,6);
assert.equal(data.steps.length,28);
assert.equal(new Set(data.steps.map(x=>x.id)).size,data.steps.length,"Step IDs must be unique");
for(const s of data.steps){assert.ok(data.stages[s.stage],"Unknown stage");for(const k of ["title","action","detail","check","tip"]){assert.ok(typeof s[k]==="string"&&s[k].length>10,k+" missing for "+s.id)}}
const inline=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.equal(inline.length,2,"Unexpected script elements");
new vm.Script(inline[1][1],{filename:"guia-destiny-2.js"});
for(const id of ["stageSelect","tocOpen","modeBtn","stepDone","prevBtn","nextBtn","shareBtn","resetBtn","progressTrack"]){assert.ok(source.includes('id="'+id+'"'),"Missing control "+id)}
assert.ok(!/<script\s+src=/.test(source),"Unexpected remote scripts");
assert.ok(!/<link[^>]+href=["']https?:/i.test(source),"Unexpected external stylesheet");
assert.ok(!/\bfetch\s*\(/.test(inline[1][1]),"Unexpected automatic network request");
console.log("Guía Equilibrio: schema, files and JavaScript syntax OK.");
