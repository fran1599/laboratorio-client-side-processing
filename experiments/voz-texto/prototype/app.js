import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

const $ = id => document.getElementById(id);
const run = { version:'0.1.7', startedAt:new Date().toISOString(), diagnostics:{}, stt:[], tts:[], voiceComparisons:[], events:[] };

function log(event, detail={}) {
  run.events.push({ at:new Date().toISOString(), event, ...detail });
  $('log').textContent = run.events.slice(-25).map(x => JSON.stringify(x)).join('\n');
}
function bytes(n) {
  if (!Number.isFinite(n)) return '—';
  const u=['B','KB','MB','GB']; let i=0;
  while(n>=1024 && i<u.length-1){n/=1024;i++}
  return n.toFixed(i>1?1:0)+' '+u[i];
}
function metric(parent, key, value) {
  const box=document.createElement('div'); box.className='metric';
  const k=document.createElement('span'); k.textContent=key;
  const v=document.createElement('strong'); v.textContent=value;
  box.append(k,v); parent.append(box);
}
function renderMetrics(id,obj) {
  const el=$(id); el.replaceChildren();
  for(const [k,v] of Object.entries(obj)){
    if(k==='at') continue;
    const box=document.createElement('div');
    const key=document.createElement('div'); key.className='k'; key.textContent=k;
    const val=document.createElement('strong'); val.textContent=v==null?'—':String(v);
    box.append(key,val); el.append(box);
  }
}
function downloadBlob(name,blob){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function download(name,text,type='text/plain'){
  downloadBlob(name,new Blob([text],{type}));
}
function serializeError(error){
  if(error instanceof Error){
    return {
      type:error.name||'Error',
      message:error.message||String(error),
      stack:error.stack||null,
      cause:error.cause?serializeError(error.cause):null
    };
  }
  return {
    type:typeof error,
    value:String(error),
    constructor:error?.constructor?.name||null
  };
}
function stripMarkdownForSpeech(text){
  let value=String(text||'').replace(/\r\n?/g,'\n');
  value=value.replace(/\x60{3}[^\n]*\n([\s\S]*?)\x60{3}/g,(_,code)=>{
    const cleaned=code.replace(/^\s+|\s+$/g,'').replace(/\n+/g,'. ');
    return '\nCódigo. '+cleaned+'. Fin del código.\n';
  });
  value=value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]*\)/g,'$1')
    .replace(/https?:\/\/\S+/g,' enlace ')
    .replace(/\x60([^\x60]+)\x60/g,'$1')
    .replace(/\*\*([^*]+)\*\*/g,'$1')
    .replace(/__([^_]+)__/g,'$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g,'$1')
    .replace(/(?<!_)_([^_]+)_(?!_)/g,'$1')
    .replace(/~~([^~]+)~~/g,'$1')
    .replace(/\s+↔\s+/g,' y ')
    .replace(/\s+→\s+/g,' a ')
    .replace(/\s+←\s+/g,' desde ')
    .replace(/\s+×\s+/g,' por ');

  const lines=value.split('\n');
  const out=[];
  for(const raw of lines){
    let line=raw.trim();
    if(!line){out.push('');continue}
    if(/^[-*_]{3,}$/.test(line))continue;
    const heading=line.match(/^#{1,6}\s+(.+)$/);
    if(heading){
      line=heading[1].trim();
      if(!/[.!?…:]$/.test(line))line+='.';
      out.push(line);
      out.push('');
      continue;
    }
    const isListItem=/^[-*+]\s+/.test(line)||/^\d+[.)]\s+/.test(line)||/^\[?[ xX]\]\s+/.test(line);
    line=line
      .replace(/^>\s?/,'')
      .replace(/^[-*+]\s+/,'')
      .replace(/^\[?[ xX]\]\s+/,'');
    const numbered=line.match(/^(\d+)[.)]\s+(.+)$/);
    if(numbered) line=numbered[1]+'. '+numbered[2];
    out.push(line);
    if(isListItem)out.push('');
  }
  return out.join('\n')
    .replace(/[ \t]+/g,' ')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

function splitLongSpeechUnit(text,maxLength){
  const value=text.trim();
  if(!value)return[];
  if(value.length<=maxLength)return[value];
  const pieces=[];
  let current='';
  const clauses=value.split(/(?<=[,;:])\s+/);
  const source=clauses.length>1?clauses:value.split(/\s+/);
  for(const part of source){
    const next=(current+' '+part).trim();
    if(next.length>maxLength){
      if(current)pieces.push(current.trim());
      current=part;
    }else current=next;
  }
  if(current)pieces.push(current.trim());
  return pieces;
}

const PAUSE_PROFILES={
  compact:{period:240,question:360,exclamation:320,paragraph:500,technical:140,end:180},
  naturalPlus:{period:380,question:560,exclamation:460,paragraph:760,technical:180,end:240},
  marked:{period:500,question:720,exclamation:600,paragraph:950,technical:220,end:320}
};

const PROSODY_PRESETS={
  original:null,
  naturalA:{lengthScale:1.03,noiseScale:0.75,noiseW:0.72},
  naturalB:{lengthScale:1.06,noiseScale:0.85,noiseW:0.65}
};

function punctuationBoundary(text){
  const value=text.trim().replace(/["'»”)]*$/,'');
  if(value.endsWith('?'))return'question';
  if(value.endsWith('!'))return'exclamation';
  if(value.endsWith('.')||value.endsWith('…'))return'period';
  return'period';
}

function buildNaturalSpeechPlan(text,maxLength=400,pauseProfile='naturalPlus'){
  const prepared=stripMarkdownForSpeech(text);
  if(!prepared)return{preparedText:'',chunks:[]};
  const pauses=PAUSE_PROFILES[pauseProfile]||PAUSE_PROFILES.naturalPlus;
  const paragraphs=prepared.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
  const chunks=[];

  for(let p=0;p<paragraphs.length;p++){
    const paragraph=paragraphs[p].replace(/\n+/g,' ').trim();
    const sentences=paragraph.match(/[^.!?…]+[.!?…]+(?:["'»”)]*)|[^.!?…]+$/g)??[paragraph];

    for(let s=0;s<sentences.length;s++){
      const sentence=sentences[s].trim();
      if(!sentence)continue;
      const parts=splitLongSpeechUnit(sentence,maxLength);
      const baseBoundary=punctuationBoundary(sentence);
      for(let i=0;i<parts.length;i++){
        const lastPart=i===parts.length-1;
        const lastSentence=s===sentences.length-1;
        const lastParagraph=p===paragraphs.length-1;

        let boundary='technical';
        let pauseAfterMs=pauses.technical;
        if(lastPart){
          boundary=baseBoundary;
          pauseAfterMs=pauses[baseBoundary]??pauses.period;
          if(lastSentence&&!lastParagraph){
            boundary='paragraph';
            pauseAfterMs=Math.max(pauseAfterMs,pauses.paragraph);
          }else if(lastSentence&&lastParagraph){
            boundary='end';
            pauseAfterMs=Math.max(pauseAfterMs,pauses.end);
          }
        }
        chunks.push({text:parts[i],pauseAfterMs,boundary});
      }
    }
  }
  return{preparedText:prepared,chunks,pauseProfile};
}
function buildLiteralSpeechPlan(text,maxLength=400){
  const prepared=String(text||'').trim();
  if(!prepared)return{preparedText:'',chunks:[]};
  const sentences=prepared.match(/[^.!?…\n]+[.!?…]*\s*/g)??[prepared];
  const chunks=[];
  let current='';
  const push=()=>{
    const value=current.trim();
    if(value)chunks.push({text:value,pauseAfterMs:0,boundary:'literal'});
    current='';
  };
  for(const sentence of sentences){
    const parts=splitLongSpeechUnit(sentence,maxLength);
    for(const part of parts){
      const next=(current+' '+part).trim();
      if(next.length>maxLength)push();
      current=(current+' '+part).trim();
    }
  }
  push();
  return{preparedText:prepared,chunks};
}

function buildSpeechPlan(text,mode='natural',maxLength=400,pauseProfile='naturalPlus'){
  return mode==='literal'
    ?buildLiteralSpeechPlan(text,maxLength)
    :buildNaturalSpeechPlan(text,maxLength,pauseProfile);
}

function refreshSpeechPreview(){
  const text=$('tts-text')?.value??'';
  const mode=$('reading-mode')?.value??'natural';
  const pauseProfile=$('pause-profile')?.value??'naturalPlus';
  const plan=buildSpeechPlan(text,mode,400,pauseProfile);
  if($('prepared-text'))$('prepared-text').value=plan.preparedText;
  if($('prep-summary')){
    $('prep-summary').textContent=
      (mode==='natural'?'Lectura natural':'Lectura literal')+
      ' · '+text.length+' caracteres originales · '+plan.preparedText.length+
      ' preparados · '+plan.chunks.length+' fragmentos · pausas '+($('pause-profile')?.selectedOptions?.[0]?.textContent||'');
  }
  return plan;
}
function readWavHeader(buffer){
  if(buffer.byteLength<44) throw new Error('WAV incompleto.');
  const view=new DataView(buffer);
  const tag=offset=>String.fromCharCode(
    view.getUint8(offset),view.getUint8(offset+1),view.getUint8(offset+2),view.getUint8(offset+3)
  );
  if(tag(0)!=='RIFF'||tag(8)!=='WAVE') throw new Error('Formato WAV no reconocido.');
  return {
    audioFormat:view.getUint16(20,true),
    channels:view.getUint16(22,true),
    sampleRate:view.getUint32(24,true),
    byteRate:view.getUint32(28,true),
    blockAlign:view.getUint16(32,true),
    bitsPerSample:view.getUint16(34,true),
    dataSize:view.getUint32(40,true)
  };
}
async function wavDuration(blob){
  const header=readWavHeader(await blob.slice(0,44).arrayBuffer());
  return header.byteRate?Math.min(header.dataSize,Math.max(0,blob.size-44))/header.byteRate:0;
}
async function appendSilenceToWav(blob,pauseMs=0){
  if(!pauseMs||pauseMs<=0)return blob;
  const headerBytes=await blob.slice(0,44).arrayBuffer();
  const header=readWavHeader(headerBytes);
  if(header.audioFormat!==1||!header.byteRate||!header.blockAlign)return blob;
  const dataSize=Math.min(header.dataSize,Math.max(0,blob.size-44));
  let silenceBytes=Math.round((header.byteRate*pauseMs)/1000);
  silenceBytes=Math.max(0,Math.ceil(silenceBytes/header.blockAlign)*header.blockAlign);
  const out=new Uint8Array(44+dataSize+silenceBytes);
  out.set(new Uint8Array(headerBytes),0);
  out.set(new Uint8Array(await blob.slice(44,44+dataSize).arrayBuffer()),44);
  const view=new DataView(out.buffer);
  view.setUint32(4,36+dataSize+silenceBytes,true);
  view.setUint32(40,dataSize+silenceBytes,true);
  return new Blob([out],{type:'audio/wav'});
}
async function mergeWavBlobs(blobs){
  if(blobs.length===1)return blobs[0];
  const headers=[];
  let totalData=0;
  for(const blob of blobs){
    const raw=await blob.slice(0,44).arrayBuffer();
    const header=readWavHeader(raw);
    const dataSize=Math.min(header.dataSize,Math.max(0,blob.size-44));
    headers.push({raw,header,dataSize});
    totalData+=dataSize;
  }
  const base=headers[0].header;
  for(const {header} of headers){
    if(header.audioFormat!==base.audioFormat||header.channels!==base.channels||
       header.sampleRate!==base.sampleRate||header.bitsPerSample!==base.bitsPerSample){
      throw new Error('Los fragmentos WAV no comparten el mismo formato.');
    }
  }
  const out=new Uint8Array(44+totalData);
  out.set(new Uint8Array(headers[0].raw),0);
  const view=new DataView(out.buffer);
  view.setUint32(4,36+totalData,true);
  view.setUint32(40,totalData,true);
  let offset=44;
  for(let i=0;i<blobs.length;i++){
    const payload=new Uint8Array(await blobs[i].slice(44,44+headers[i].dataSize).arrayBuffer());
    out.set(payload,offset);
    offset+=payload.length;
  }
  return new Blob([out],{type:'audio/wav'});
}
async function gpuInfo(){
  if(!navigator.gpu) return {supported:false};
  try{
    const adapter=await navigator.gpu.requestAdapter();
    if(!adapter) return {supported:false};
    const i=adapter.info||{};
    return {supported:true,vendor:i.vendor||null,architecture:i.architecture||null,device:i.device||null,description:i.description||null};
  }catch(error){ return {supported:false,error:String(error)} }
}
async function diagnostics(){
  const gpu=await gpuInfo();
  const d={
    secureContext:window.isSecureContext,
    hardwareConcurrency:navigator.hardwareConcurrency??null,
    deviceMemoryGB:navigator.deviceMemory??null,
    webgpu:gpu,
    wasm:typeof WebAssembly==='object',
    microphone:!!navigator.mediaDevices?.getUserMedia,
    cacheApi:'caches' in window,
    jsHeapLimit:performance.memory?.jsHeapSizeLimit??null,
    userAgent:navigator.userAgent
  };
  run.diagnostics=d;
  const el=$('diag'); el.replaceChildren();
  metric(el,'Contexto seguro',d.secureContext?'Sí':'No');
  metric(el,'CPU lógica',d.hardwareConcurrency==null?'No informada':String(d.hardwareConcurrency));
  metric(el,'RAM aproximada',d.deviceMemoryGB==null?'No informada':d.deviceMemoryGB+' GB');
  metric(el,'WebGPU',d.webgpu.supported?'Disponible':'No disponible');
  metric(el,'WebAssembly',d.wasm?'Disponible':'No disponible');
  metric(el,'Micrófono',d.microphone?'Disponible':'No disponible');
  metric(el,'Cache API',d.cacheApi?'Disponible':'No disponible');
  metric(el,'Límite heap JS',d.jsHeapLimit?bytes(d.jsHeapLimit):'No informado');
  log('diagnostics',{hardwareConcurrency:d.hardwareConcurrency,deviceMemoryGB:d.deviceMemoryGB,webgpu:d.webgpu.supported});
}
$('refresh').onclick=diagnostics;
await diagnostics();

// Audio capture / selection
let blob=null, recorder=null, stream=null, chunks=[];
$('record').onclick=async()=>{
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
    chunks=[]; recorder=new MediaRecorder(stream);
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    recorder.onstop=()=>{
      blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});
      const p=$('preview'); p.src=URL.createObjectURL(blob); p.hidden=false;
      $('transcribe').disabled=false; stream.getTracks().forEach(t=>t.stop());
      $('stt-status').textContent='Grabación lista.';
      log('recording-ready',{bytes:blob.size,type:blob.type});
    };
    recorder.start(); $('record').disabled=true; $('stop').disabled=false;
    $('stt-status').textContent='Grabando localmente…'; log('recording-started');
  }catch(error){ $('stt-status').textContent='Error de micrófono: '+error.message; log('microphone-error',{error:String(error)}) }
};
$('stop').onclick=()=>{
  if(recorder?.state==='recording') recorder.stop();
  $('record').disabled=false; $('stop').disabled=true;
};
$('file').onchange=e=>{
  const f=e.target.files?.[0]; if(!f)return;
  blob=f; const p=$('preview'); p.src=URL.createObjectURL(f); p.hidden=false;
  $('transcribe').disabled=false;
  $('stt-status').textContent='Audio listo ('+bytes(f.size)+').';
  log('audio-selected',{bytes:f.size,type:f.type||null});
};

async function audio16k(input){
  const raw=await input.arrayBuffer();
  const ctx=new AudioContext();
  const decoded=await ctx.decodeAudioData(raw.slice(0));
  const outCtx=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);
  const src=outCtx.createBufferSource(); src.buffer=decoded; src.connect(outCtx.destination); src.start();
  const rendered=await outCtx.startRendering(); await ctx.close();
  return {wave:new Float32Array(rendered.getChannelData(0)),duration:decoded.duration,sourceRate:decoded.sampleRate};
}

let transcriber=null, transcriberKey=null;
async function getTranscriber(){
  const requested=$('device').value;
  const device=requested==='auto'?(run.diagnostics.webgpu?.supported?'webgpu':'wasm'):requested;
  if(device==='webgpu'&&!run.diagnostics.webgpu?.supported) throw new Error('WebGPU no está disponible.');
  const model=$('model').value, key=model+':'+device;
  if(transcriber&&transcriberKey===key) return {pipe:transcriber,model,device,loadMs:0,reused:true};
  transcriber=null; transcriberKey=null; $('stt-progress').value=0;
  $('stt-status').textContent='Cargando '+model+' con '+device+'…';
  const start=performance.now();
  transcriber=await pipeline('automatic-speech-recognition',model,{
    device,
    progress_callback:p=>{
      if(Number.isFinite(p.progress)) $('stt-progress').value=Math.max(0,Math.min(100,p.progress));
    }
  });
  transcriberKey=key;
  return {pipe:transcriber,model,device,loadMs:performance.now()-start,reused:false};
}

$('transcribe').onclick=async()=>{
  if(!blob)return; $('transcribe').disabled=true;
  try{
    const heapBefore=performance.memory?.usedJSHeapSize??null;
    $('stt-status').textContent='Decodificando audio…';
    const a=await audio16k(blob);
    const engine=await getTranscriber();
    $('stt-status').textContent='Transcribiendo localmente…';
    const start=performance.now();
    const out=await engine.pipe(a.wave,{
      language:'spanish',task:'transcribe',chunk_length_s:29,stride_length_s:5,return_timestamps:true
    });
    const inferenceMs=performance.now()-start;
    $('transcript').value=(out.text||'').trim();
    $('stt-progress').value=100; $('stt-status').textContent='Transcripción terminada.';
    const result={
      at:new Date().toISOString(),model:engine.model,device:engine.device,
      modelLoadMs:Math.round(engine.loadMs),pipelineReuse:engine.reused,
      inferenceMs:Math.round(inferenceMs),audioSeconds:Number(a.duration.toFixed(2)),
      realtimeFactor:Number((inferenceMs/1000/a.duration).toFixed(3)),
      sourceSampleRate:a.sourceRate,workingSampleRate:16000,
      jsHeapBefore:heapBefore,jsHeapAfter:performance.memory?.usedJSHeapSize??null,
      outputChars:(out.text||'').length,chunks:out.chunks?.length||0
    };
    run.stt.push(result); renderMetrics('stt-metrics',result); log('stt-complete',result);
  }catch(error){
    $('stt-status').textContent='Error STT: '+error.message;
    log('stt-error',{error:String(error)});
  }finally{$('transcribe').disabled=false}
};
$('copy').onclick=()=>navigator.clipboard.writeText($('transcript').value);
$('txt').onclick=()=>download('transcripcion.txt',$('transcript').value);

// Piper TTS — generación en Worker + reproducción progresiva
let ttsWorker=null;
let ttsJob=null;
let ttsTimer=null;
let chunkProcessingQueue=Promise.resolve();
let currentWav=null;
let streamItems=[];
let streamIndex=-1;
let playRequested=false;
let waitingForChunk=false;
let availableTtsVoices=[];
let compareJob=null;
const compareAudioUrls=new Map();

function getTtsWorker(){
  if(ttsWorker)return ttsWorker;
  ttsWorker=new Worker('./tts-worker.js',{type:'module'});
  ttsWorker.onmessage=event=>{
    handleTtsWorkerMessage(event.data).catch(error=>{
      const detail=serializeError(error);
      log('tts-ui-error',{error:detail});
      $('tts-status').textContent='Error TTS: '+(detail.message||detail.value||String(error));
    });
  };
  ttsWorker.onerror=event=>{
    log('tts-worker-crash',{message:event.message||'Worker error'});
    $('tts-status').textContent='Error del Worker TTS: '+(event.message||'desconocido');
    finishTtsJob(false);
  };
  return ttsWorker;
}
function normalizeVoices(data){
  if(Array.isArray(data)){
    return data.map((voice,index)=>{
      if(typeof voice==='string')return{key:voice,name:voice};
      if(voice&&typeof voice==='object')return{...voice,key:voice.key||voice.id||voice.voiceId||null};
      return{key:null,name:'voice-'+index};
    }).filter(v=>v.key);
  }
  if(data&&typeof data==='object'){
    return Object.entries(data).map(([key,voice])=>{
      if(typeof voice==='string')return{key,name:voice};
      return{key,...(voice||{})};
    }).filter(v=>v.key);
  }
  return[];
}
function voiceLabel(v){
  const language=v.language?.name_native||v.language?.name_english||v.language?.code||v.language||v.locale||null;
  const name=v.name||v.speaker||v.key;
  const quality=v.quality||v.model_quality||null;
  return[name,language,quality].filter(Boolean).join(' · ');
}
function renderVoiceCompareOptions(list){
  availableTtsVoices=list;
  const root=$('compare-voices');
  root.replaceChildren();
  const preferred=['es_MX-claude-high','es_ES-davefx-medium','es_ES-sharvard-medium','es_ES-carlfm-x_low'];
  for(const voice of list){
    const label=document.createElement('label');
    label.className='voice-option';
    const input=document.createElement('input');
    input.type='checkbox';
    input.value=voice.key;
    input.checked=preferred.includes(voice.key);
    const text=document.createElement('span');
    text.textContent=voiceLabel(voice);
    label.append(input,text);
    root.append(label);
  }
  $('compare-generate').disabled=!list.length;
}
function selectedCompareVoices(){
  return [...document.querySelectorAll('#compare-voices input[type="checkbox"]:checked')].map(x=>x.value);
}
function compactCompareText(text,maxLength=500){
  const prepared=stripMarkdownForSpeech(text).replace(/\n+/g,' ').trim();
  if(prepared.length<=maxLength)return prepared;
  const cut=prepared.slice(0,maxLength);
  const boundary=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('? '),cut.lastIndexOf('! '),cut.lastIndexOf('; '));
  return (boundary>180?cut.slice(0,boundary+1):cut).trim();
}
function compareVoiceName(voiceId){
  const voice=availableTtsVoices.find(v=>v.key===voiceId);
  return voice?voiceLabel(voice):voiceId;
}
function setComparisonRating(voiceId,field,value){
  const item=compareJob?.results?.find(x=>x.voiceId===voiceId);
  if(!item)return;
  item.ratings=item.ratings||{};
  item.ratings[field]=value===''?null:Number(value);
  persistComparisonSnapshot();
}
function setComparisonFavorite(voiceId){
  if(!compareJob)return;
  compareJob.favorite=voiceId;
  persistComparisonSnapshot();
}
function persistComparisonSnapshot(){
  if(!compareJob)return;
  const snapshot={
    at:new Date().toISOString(),
    jobId:compareJob.id,
    sampleChars:compareJob.text.length,
    voices:compareJob.voices,
    completed:compareJob.completed,
    favorite:compareJob.favorite||null,
    results:compareJob.results.map(x=>({
      voiceId:x.voiceId,
      inferenceMs:x.inferenceMs,
      wavBytes:x.wavBytes,
      ratings:x.ratings||{naturalness:null,clarity:null,timbre:null}
    }))
  };
  const index=run.voiceComparisons.findIndex(x=>x.jobId===snapshot.jobId);
  if(index>=0)run.voiceComparisons[index]=snapshot;
  else run.voiceComparisons.push(snapshot);
}
function renderCompareResult(data){
  const root=$('compare-results');
  const card=document.createElement('article');
  card.className='voice-result';
  card.dataset.voiceId=data.voiceId;

  const title=document.createElement('h4');
  title.textContent=compareVoiceName(data.voiceId);

  const meta=document.createElement('p');
  meta.className='muted';
  meta.textContent='Inferencia: '+(data.inferenceMs/1000).toFixed(1)+' s · '+bytes(data.wav.size||0);

  const audio=document.createElement('audio');
  audio.controls=true;
  audio.preload='metadata';
  const old=compareAudioUrls.get(data.voiceId);
  if(old)URL.revokeObjectURL(old);
  const url=URL.createObjectURL(data.wav);
  compareAudioUrls.set(data.voiceId,url);
  audio.src=url;

  const ratings=document.createElement('div');
  ratings.className='rating-grid';
  for(const [field,labelText] of [
    ['naturalness','Naturalidad'],
    ['clarity','Claridad'],
    ['timbre','Timbre']
  ]){
    const label=document.createElement('label');
    label.textContent=labelText;
    const select=document.createElement('select');
    select.innerHTML='<option value="">—</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>';
    select.addEventListener('change',()=>setComparisonRating(data.voiceId,field,select.value));
    label.append(select);
    ratings.append(label);
  }

  const favorite=document.createElement('label');
  favorite.className='favorite-option';
  const radio=document.createElement('input');
  radio.type='radio';
  radio.name='voice-favorite';
  radio.value=data.voiceId;
  radio.addEventListener('change',()=>setComparisonFavorite(data.voiceId));
  favorite.append(radio,document.createTextNode(' Marcar como favorita'));

  card.append(title,meta,audio,ratings,favorite);
  root.append(card);
}

function formatDuration(seconds){
  if(!Number.isFinite(seconds)||seconds<0)return'—';
  const rounded=Math.max(0,Math.round(seconds));
  const h=Math.floor(rounded/3600);
  const m=Math.floor((rounded%3600)/60);
  const s=rounded%60;
  if(h)return h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  return m+':'+String(s).padStart(2,'0');
}
function generatedDuration(){
  return streamItems.reduce((sum,item)=>sum+item.duration,0);
}
function playbackPosition(){
  if(streamIndex<0)return 0;
  let base=0;
  for(let i=0;i<streamIndex;i++)base+=streamItems[i]?.duration||0;
  return base+($('tts-audio').currentTime||0);
}
function estimateTotalAudioSeconds(){
  if(!ttsJob||!ttsJob.completedChars||!ttsJob.generatedSeconds)return null;
  return (ttsJob.generatedSeconds/ttsJob.completedChars)*ttsJob.totalChars;
}
function updateTtsProgressUI(){
  if(!ttsJob)return;
  const elapsed=(performance.now()-ttsJob.startedAt)/1000;
  const pct=ttsJob.totalChars?Math.min(100,(ttsJob.completedChars/ttsJob.totalChars)*100):0;
  const msPerChar=ttsJob.completedChars?ttsJob.completedInferenceMs/ttsJob.completedChars:null;
  const remainingChars=Math.max(0,ttsJob.totalChars-ttsJob.completedChars);
  const eta=msPerChar?remainingChars*msPerChar/1000:null;
  const estimatedAudio=estimateTotalAudioSeconds();
  const buffered=Math.max(0,ttsJob.generatedSeconds-playbackPosition());

  $('tts-progress').value=pct;
  $('tts-overall').textContent=pct.toFixed(1)+'%';
  $('tts-fragment').textContent=ttsJob.completedChunks+' / '+ttsJob.totalChunks;
  $('tts-elapsed').textContent=formatDuration(elapsed);
  $('tts-eta').textContent=eta==null?'Calculando…':formatDuration(eta);
  $('tts-generated').textContent=
    formatDuration(ttsJob.generatedSeconds)+(estimatedAudio?' / ~'+formatDuration(estimatedAudio):'');
  $('tts-buffer').textContent=formatDuration(buffered);
  if(ttsJob.currentChunkStartedAt){
    const current=(performance.now()-ttsJob.currentChunkStartedAt)/1000;
    $('tts-current').textContent='Fragmento '+ttsJob.currentChunkIndex+' de '+ttsJob.totalChunks+
      ' · '+formatDuration(current)+' en proceso';
  }
  syncPlayer();
}
function startTtsTimer(){
  clearInterval(ttsTimer);
  updateTtsProgressUI();
  ttsTimer=setInterval(updateTtsProgressUI,500);
}
function finishTtsJob(success){
  clearInterval(ttsTimer);
  ttsTimer=null;
  if(ttsJob){
    ttsJob.currentChunkStartedAt=null;
    ttsJob.state=success?'complete':'error';
  }
  $('tts-chunk-progress').value=success?100:0;
  $('synth').disabled=false;
  updateTtsProgressUI();
}
function resetStream(){
  const audio=$('tts-audio');
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  for(const item of streamItems)URL.revokeObjectURL(item.url);
  streamItems=[];
  streamIndex=-1;
  playRequested=false;
  waitingForChunk=false;
  currentWav=null;
  $('player').hidden=true;
  $('download-wav').disabled=true;
  $('seek').value=0;
  $('player-time').textContent='0:00 / 0:00';
}
function applyPlaybackSettings(){
  const audio=$('tts-audio');
  audio.playbackRate=Number($('rate').value);
  if('preservesPitch'in audio)audio.preservesPitch=$('preserve-pitch').checked;
}
function syncPlayer(){
  const total=generatedDuration();
  const current=Math.min(playbackPosition(),total||0);
  $('player-time').textContent=formatDuration(current)+' / '+formatDuration(total);
  $('seek').value=total?Math.round((current/total)*1000):0;
}
function findStreamPosition(seconds){
  let base=0;
  for(let i=0;i<streamItems.length;i++){
    const end=base+streamItems[i].duration;
    if(seconds<=end||i===streamItems.length-1){
      return{index:i,offset:Math.max(0,Math.min(streamItems[i].duration,seconds-base))};
    }
    base=end;
  }
  return{index:0,offset:0};
}
function loadStreamItem(index,offset=0,autoplay=playRequested){
  const item=streamItems[index];
  if(!item)return;
  const audio=$('tts-audio');
  streamIndex=index;
  waitingForChunk=false;
  audio.src=item.url;
  audio.load();
  const ready=async()=>{
    applyPlaybackSettings();
    try{audio.currentTime=Math.min(offset,Math.max(0,(audio.duration||offset)-0.01))}catch{}
    syncPlayer();
    if(autoplay){
      try{
        await audio.play();
        playRequested=true;
      }catch(error){
        playRequested=false;
        log('tts-autoplay-blocked',{error:serializeError(error)});
      }
    }
  };
  if(audio.readyState>=1)ready();
  else audio.addEventListener('loadedmetadata',ready,{once:true});
}
async function enqueueStreamChunk(blob,pauseAfterMs=0){
  const withPause=await appendSilenceToWav(blob,pauseAfterMs);
  const duration=await wavDuration(withPause);
  const item={blob:withPause,url:URL.createObjectURL(withPause),duration,pauseAfterMs};
  streamItems.push(item);
  if(ttsJob)ttsJob.generatedSeconds+=duration;
  $('player').hidden=false;
  if(streamIndex<0){
    playRequested=$('progressive-play').checked;
    loadStreamItem(0,0,playRequested);
  }else if(waitingForChunk&&playRequested){
    loadStreamItem(streamIndex+1,0,true);
  }
  return duration;
}
$('tts-audio').addEventListener('timeupdate',()=>{syncPlayer();updateTtsProgressUI()});
$('tts-audio').addEventListener('play',()=>{$('playpause').textContent='Pausar';playRequested=true});
$('tts-audio').addEventListener('pause',()=>{$('playpause').textContent='Reproducir'});
$('tts-audio').addEventListener('ended',()=>{
  if(streamIndex+1<streamItems.length){
    loadStreamItem(streamIndex+1,0,playRequested);
  }else if(ttsJob?.state==='running'&&playRequested){
    waitingForChunk=true;
    $('tts-play-state').textContent='Esperando el próximo fragmento…';
  }else{
    playRequested=false;
    $('playpause').textContent='Reproducir';
    $('tts-play-state').textContent=ttsJob?.state==='complete'?'Reproducción disponible completa':'Pausado';
  }
});
$('playpause').onclick=async()=>{
  const audio=$('tts-audio');
  if(!streamItems.length)return;
  if(audio.paused){
    playRequested=true;
    if(streamIndex<0)loadStreamItem(0,0,true);
    else{
      try{await audio.play()}catch(error){log('tts-play-error',{error:serializeError(error)})}
    }
  }else{
    playRequested=false;
    waitingForChunk=false;
    audio.pause();
  }
};
$('restart').onclick=()=>{
  if(!streamItems.length)return;
  playRequested=true;
  loadStreamItem(0,0,true);
};
$('seek').oninput=()=>{
  const total=generatedDuration();
  if(!total||!streamItems.length)return;
  const target=(Number($('seek').value)/1000)*total;
  const pos=findStreamPosition(target);
  loadStreamItem(pos.index,pos.offset,playRequested);
};
$('rate').onchange=()=>{
  applyPlaybackSettings();
  log('tts-playback-rate',{rate:Number($('rate').value)});
  updateTtsProgressUI();
};
$('preserve-pitch').onchange=()=>{
  applyPlaybackSettings();
  log('tts-preserve-pitch',{enabled:$('preserve-pitch').checked});
};
$('download-wav').onclick=()=>{
  if(currentWav)downloadBlob('piper-'+Date.now()+'.wav',currentWav);
};

$('voices').onclick=()=>{
  $('voices').disabled=true;
  $('tts-status').textContent='Cargando catálogo de voces…';
  getTtsWorker().postMessage({type:'voices'});
};

async function handleTtsWorkerMessage(data){
  if(data.type==='worker-ready'){
    log('tts-worker-ready');
    return;
  }
  if(data.type==='voices'){
    const all=normalizeVoices(data.voices);
    const es=all.filter(v=>/(^es_|spanish|español|daniela|argentin)/i.test(
      [v.key,v.name,v.language?.name_native,v.language?.name_english,v.language?.code,v.language,v.locale]
        .filter(Boolean).join(' ')
    ));
    const list=es.length?es:all;
    const select=$('voice');select.replaceChildren();
    for(const v of list){
      const option=document.createElement('option');
      option.value=v.key;
      option.textContent=voiceLabel(v);
      select.append(option);
    }
    const preferred=list.find(v=>v.key==='es_MX-claude-high') || list.find(v=>/es_AR.*daniela|daniela/i.test([v.key,v.name].filter(Boolean).join(' ')));
    if(preferred)select.value=preferred.key;
    $('synth').disabled=!list.length;
    renderVoiceCompareOptions(list);
    $('voices').disabled=false;
    $('tts-status').textContent=list.length?list.length+' voces candidatas.':'No se encontraron voces.';
    log('tts-voices',{count:list.length,selected:select.value||null,sampleKeys:list.slice(0,5).map(v=>v.key)});
    return;
  }
  if(data.type==='engine-log'){
    log('tts-engine-log',{message:data.message});
    return;
  }
  if(data.type==='engine-state'){
    $('tts-stage').textContent=data.state==='ready'?'Motor listo':'Inicializando motor';
    $('tts-status').textContent=data.state==='ready'?'Motor listo. Comienza la síntesis…':'Inicializando voz '+data.voiceId+'…';
    return;
  }
  if(data.type==='download-progress'){
    const p=data.progress||{};
    if(p.total&&Number.isFinite(p.loaded)){
      const percent=Math.round(p.loaded*100/p.total);
      $('tts-stage').textContent='Descargando recursos de voz';
      $('tts-current').textContent=percent+'% de '+bytes(p.total);
      $('tts-chunk-progress').value=percent;
    }
    return;
  }
  if(data.type==='compare-start'&&compareJob&&data.jobId===compareJob.id){
    $('compare-status').textContent='Generando '+data.index+' de '+data.total+': '+compareVoiceName(data.voiceId);
    $('compare-progress').value=Math.round(((data.index-1)/data.total)*100);
    return;
  }
  if(data.type==='compare-result'&&compareJob&&data.jobId===compareJob.id){
    const item={
      voiceId:data.voiceId,
      inferenceMs:data.inferenceMs,
      wavBytes:data.wav.size??null,
      ratings:{naturalness:null,clarity:null,timbre:null}
    };
    compareJob.results.push(item);
    compareJob.completed=compareJob.results.length;
    renderCompareResult(data);
    $('compare-progress').value=Math.round((compareJob.completed/compareJob.voices.length)*100);
    $('compare-status').textContent='Listas '+compareJob.completed+' de '+compareJob.voices.length+' voces.';
    log('voice-compare-result',{voiceId:data.voiceId,inferenceMs:data.inferenceMs,wavBytes:data.wav.size??null});
    persistComparisonSnapshot();
    return;
  }
  if(data.type==='compare-error'&&compareJob&&data.jobId===compareJob.id){
    log('voice-compare-error',{voiceId:data.voiceId,error:data.error});
    $('compare-status').textContent='Falló '+compareVoiceName(data.voiceId)+'. Continúa la comparación…';
    return;
  }
  if(data.type==='compare-complete'&&compareJob&&data.jobId===compareJob.id){
    $('compare-progress').value=100;
    $('compare-status').textContent='Comparación lista. Escuchá y puntuá cada voz.';
    $('compare-generate').disabled=false;
    persistComparisonSnapshot();
    log('voice-compare-complete',{voices:compareJob.voices,completed:compareJob.completed});
    return;
  }
  if(!ttsJob||data.jobId!==ttsJob.id)return;
  if(data.type==='chunk-start'){
    ttsJob.currentChunkIndex=data.index;
    ttsJob.currentChunkStartedAt=performance.now();
    $('tts-stage').textContent='Generando audio';
    $('tts-status').textContent='Sintetizando fragmento '+data.index+' de '+data.total+'…';
    $('tts-chunk-progress').removeAttribute('value');
    updateTtsProgressUI();
    return;
  }
  if(data.type==='chunk-complete'){
    chunkProcessingQueue=chunkProcessingQueue.then(async()=>{
      const duration=await enqueueStreamChunk(data.wav,data.pauseAfterMs||0);
      ttsJob.completedChunks=data.index;
      ttsJob.completedChars+=data.chars;
      ttsJob.completedInferenceMs+=data.inferenceMs;
      ttsJob.currentChunkStartedAt=null;
      if(!ttsJob.firstAudioReadyMs)ttsJob.firstAudioReadyMs=Math.round(performance.now()-ttsJob.startedAt);
      ttsJob.wavParts.push(streamItems[streamItems.length-1].blob);
      log('tts-chunk-complete',{
        index:data.index,total:data.total,chars:data.chars,inferenceMs:data.inferenceMs,
        wavBytes:data.wav.size??null,audioSeconds:Number(duration.toFixed(3)),pauseAfterMs:data.pauseAfterMs||0,boundary:data.boundary||null
      });
      updateTtsProgressUI();
    });
    return;
  }
  if(data.type==='chunk-error'){
    log('tts-chunk-error',{index:data.index,total:data.total,chars:data.chars,error:data.error});
    return;
  }
  if(data.type==='worker-error'){
    log('tts-error',{error:data.error});
    $('tts-status').textContent='Error TTS: '+(data.error?.message||data.error?.value||'desconocido');
    $('tts-stage').textContent='Error';
    finishTtsJob(false);
    return;
  }
  if(data.type==='synth-complete'){
    await chunkProcessingQueue;
    $('tts-stage').textContent='Preparando archivo final';
    $('tts-status').textContent='Uniendo '+ttsJob.wavParts.length+' fragmentos en un único WAV…';
    $('tts-chunk-progress').removeAttribute('value');
    currentWav=await mergeWavBlobs(ttsJob.wavParts);
    const wallClockMs=Math.round(performance.now()-ttsJob.startedAt);
    const audioSeconds=generatedDuration();
    const result={
      at:new Date().toISOString(),
      voiceId:ttsJob.voiceId,
      library:'@jtsage/piper-tts-web@1.2.0',
      worker:true,
      wallClockMs,
      inferenceMs:Math.round(ttsJob.completedInferenceMs),
      firstAudioReadyMs:ttsJob.firstAudioReadyMs,
      chunks:ttsJob.totalChunks,
      readingMode:ttsJob.readingMode,
      pauseProfile:ttsJob.pauseProfile,
      prosodyPreset:ttsJob.prosodyPreset,
      prosody:ttsJob.prosody,
      textCharsOriginal:ttsJob.originalChars,
      textCharsPrepared:ttsJob.totalChars,
      wavBytes:currentWav.size,
      audioSeconds:Number(audioSeconds.toFixed(2)),
      realtimeFactor:Number((ttsJob.completedInferenceMs/1000/audioSeconds).toFixed(3)),
      progressivePlayback:$('progressive-play').checked,
      jsHeapBefore:ttsJob.heapBefore,
      jsHeapAfter:performance.memory?.usedJSHeapSize??null
    };
    run.tts.push(result);
    renderMetrics('tts-metrics',result);
    log('tts-complete',result);
    $('download-wav').disabled=false;
    $('tts-stage').textContent='Completado';
    $('tts-status').textContent='Conversión terminada. El audio completo está disponible.';
    $('tts-play-state').textContent='Audio completo generado';
    finishTtsJob(true);
  }
}

$('compare-from-main').onclick=()=>{
  $('compare-text').value=compactCompareText($('tts-text').value,500);
};
$('compare-generate').onclick=()=>{
  const voices=selectedCompareVoices();
  const text=compactCompareText($('compare-text').value,500);
  if(!voices.length||!text)return;
  for(const url of compareAudioUrls.values())URL.revokeObjectURL(url);
  compareAudioUrls.clear();
  $('compare-results').replaceChildren();
  $('compare-generate').disabled=true;
  $('compare-progress').value=0;
  $('compare-status').textContent='Preparando comparación…';
  compareJob={
    id:'compare-'+Date.now(),
    text,
    voices,
    results:[],
    completed:0,
    favorite:null
  };
  log('voice-compare-start',{voices,textChars:text.length});
  getTtsWorker().postMessage({type:'compare-voices',jobId:compareJob.id,voices,text});
};

$('tts-text').addEventListener('input',refreshSpeechPreview);
$('reading-mode').addEventListener('change',refreshSpeechPreview);
$('pause-profile').addEventListener('change',refreshSpeechPreview);
$('prosody-preset').addEventListener('change',()=>{
  const key=$('prosody-preset').value;
  const p=PROSODY_PRESETS[key];
  $('prosody-values').textContent=p
    ?'length_scale '+p.lengthScale+' · noise_scale '+p.noiseScale+' · noise_w '+p.noiseW
    :'Valores originales de la voz';
});
refreshSpeechPreview();
$('prosody-preset').dispatchEvent(new Event('change'));

$('synth').onclick=()=>{
  const voiceId=$('voice').value;
  const text=$('tts-text').value.trim();
  if(!voiceId||!text)return;
  const readingMode=$('reading-mode').value;
  const pauseProfile=$('pause-profile').value;
  const prosodyPreset=$('prosody-preset').value;
  const prosody=PROSODY_PRESETS[prosodyPreset];
  const plan=buildSpeechPlan(text,readingMode,400,pauseProfile);
  const chunks=plan.chunks;
  if(!chunks.length)return;
  resetStream();
  $('synth').disabled=true;
  $('tts-job').hidden=false;
  $('tts-progress').value=0;
  $('tts-chunk-progress').removeAttribute('value');
  $('tts-stage').textContent='Preparando';
  $('tts-current').textContent='Esperando al motor…';
  ttsJob={
    id:'tts-'+Date.now(),
    state:'running',
    voiceId,
    totalChunks:chunks.length,
    originalChars:text.length,
    totalChars:plan.preparedText.length,
    readingMode,
    pauseProfile,
    prosodyPreset,
    prosody,
    completedChunks:0,
    completedChars:0,
    completedInferenceMs:0,
    generatedSeconds:0,
    startedAt:performance.now(),
    currentChunkStartedAt:null,
    currentChunkIndex:0,
    firstAudioReadyMs:null,
    wavParts:[],
    heapBefore:performance.memory?.usedJSHeapSize??null
  };
  log('tts-chunks',{count:chunks.length,lengths:chunks.map(x=>x.text.length),pausesMs:chunks.map(x=>x.pauseAfterMs),boundaries:chunks.map(x=>x.boundary),textCharsOriginal:text.length,textCharsPrepared:plan.preparedText.length,readingMode,pauseProfile,prosodyPreset,prosody});
  startTtsTimer();
  getTtsWorker().postMessage({type:'synth',jobId:ttsJob.id,voiceId,chunks,prosody});
};

$('export').onclick=()=>{
  run.finishedAt=new Date().toISOString();
  download('voz-texto-'+Date.now()+'.json',JSON.stringify(run,null,2),'application/json');
};