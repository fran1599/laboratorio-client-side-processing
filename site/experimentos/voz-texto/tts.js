

const $ = id => document.getElementById(id);
const run = { version:'0.2.0', startedAt:new Date().toISOString(), diagnostics:{hardwareConcurrency:navigator.hardwareConcurrency??null,deviceMemoryGB:navigator.deviceMemory??null,secureContext:window.isSecureContext}, tts:[], events:[] };

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
  naturalB:{lengthScale:1.06,noiseScale:0.85,noiseW:0.65},
  claudeCandidate8:{lengthScale:0.89,noiseScale:1.10,noiseW:1.22}
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
    playRequested=true;
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
    const hasClaude=list.some(v=>v.key==='es_MX-claude-high');
    if(hasClaude){
      const favorite=document.createElement('option');
      favorite.value='preset:claude-candidate-8';
      favorite.textContent='Claude · lectura natural (perfil favorito)';
      select.append(favorite);
    }
    const originals=document.createElement('optgroup');
    originals.label='Voces originales';
    for(const v of list){
      const option=document.createElement('option');
      option.value=v.key;
      option.textContent=voiceLabel(v);
      originals.append(option);
    }
    select.append(originals);
    if(hasClaude)select.value='preset:claude-candidate-8';
    $('synth').disabled=!list.length;
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
      progressivePlayback:true,
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

$('synth').onclick=()=>{
  const selectedVoice=$('voice').value;
  const text=$('tts-text').value.trim();
  if(!selectedVoice||!text)return;
  const isFavorite=selectedVoice==='preset:claude-candidate-8';
  const voiceId=isFavorite?'es_MX-claude-high':selectedVoice;
  const readingMode='natural';
  const pauseProfile='naturalPlus';
  const prosodyPreset=isFavorite?'claudeCandidate8':'original';
  const prosody=isFavorite?PROSODY_PRESETS.claudeCandidate8:null;
  const plan=buildNaturalSpeechPlan(text,400,pauseProfile);
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
  download('tts-'+Date.now()+'.json',JSON.stringify(run,null,2),'application/json');
};
// Catálogo al iniciar: no requiere un paso manual para usar la herramienta.
$('voices').click();
