import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

const $ = id => document.getElementById(id);
const run = { version:'0.1.2', startedAt:new Date().toISOString(), diagnostics:{}, stt:[], tts:[], events:[] };

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

// Piper TTS
let piper=null, audioUrl=null, currentWav=null, activeTtsVoice=null;
async function getPiper(){
  if(piper)return piper;
  $('tts-status').textContent='Cargando biblioteca Piper…';
  piper=await import('https://cdn.jsdelivr.net/npm/@jtsage/piper-tts-web@1.2.0/+esm');
  return piper;
}
function normalizeVoices(data){
  if(Array.isArray(data)){
    return data.map((voice,index)=>{
      if(typeof voice==='string') return {key:voice,name:voice};
      if(voice&&typeof voice==='object') return {...voice,key:voice.key||voice.id||voice.voiceId||null};
      return {key:null,name:'voice-'+index};
    }).filter(v=>v.key);
  }
  if(data&&typeof data==='object'){
    return Object.entries(data).map(([key,voice])=>{
      if(typeof voice==='string') return {key,name:voice};
      return {key,...(voice||{})};
    }).filter(v=>v.key);
  }
  return [];
}
function voiceLabel(v){
  const language=v.language?.name||v.language?.code||v.language||v.locale||null;
  const name=v.name||v.speaker||v.key;
  const quality=v.quality||v.model_quality||null;
  return [name,language,quality].filter(Boolean).join(' · ');
}
$('voices').onclick=async()=>{
  $('voices').disabled=true;
  try{
    const lib=await getPiper(); $('tts-status').textContent='Consultando catálogo…';
    const data=await lib.voices();
    const all=normalizeVoices(data);
    const es=all.filter(v=>/(^es_|spanish|español|daniela|argentin)/i.test([v.key,v.name,v.language?.name,v.language?.code,v.language,v.locale].filter(Boolean).join(' ')));
    const list=es.length?es:all;
    const select=$('voice'); select.replaceChildren();
    for(const v of list){
      const o=document.createElement('option');
      o.value=v.key;
      o.textContent=voiceLabel(v);
      select.append(o);
    }
    const preferred=list.find(v=>/es_AR.*daniela|daniela/i.test([v.key,v.name].filter(Boolean).join(' ')));
    if(preferred)select.value=preferred.key;
    $('synth').disabled=!list.length;
    $('tts-status').textContent=list.length?list.length+' voces candidatas.':'No se encontraron voces.';
    log('tts-voices',{count:list.length,selected:select.value||null,sampleKeys:list.slice(0,5).map(v=>v.key)});
  }catch(error){$('tts-status').textContent='Error Piper: '+error.message;log('tts-library-error',{error:String(error)})}
  finally{$('voices').disabled=false}
};
function formatTime(seconds){
  if(!Number.isFinite(seconds)) return '0:00';
  const mins=Math.floor(seconds/60);
  const secs=Math.floor(seconds%60).toString().padStart(2,'0');
  return mins+':'+secs;
}
function syncPlayer(){
  const audio=$('tts-audio');
  const duration=Number.isFinite(audio.duration)?audio.duration:0;
  $('player-time').textContent=formatTime(audio.currentTime)+' / '+formatTime(duration);
  $('seek').value=duration?Math.round((audio.currentTime/duration)*1000):0;
}
function applyPlaybackSettings(){
  const audio=$('tts-audio');
  const rate=Number($('rate').value);
  audio.playbackRate=rate;
  if('preservesPitch' in audio) audio.preservesPitch=$('preserve-pitch').checked;
}
$('rate').onchange=()=>{
  applyPlaybackSettings();
  log('tts-playback-rate',{rate:Number($('rate').value)});
};
$('preserve-pitch').onchange=()=>{
  applyPlaybackSettings();
  log('tts-preserve-pitch',{enabled:$('preserve-pitch').checked});
};
$('playpause').onclick=async()=>{
  const audio=$('tts-audio');
  if(!audio.src)return;
  if(audio.paused) await audio.play();
  else audio.pause();
};
$('restart').onclick=async()=>{
  const audio=$('tts-audio');
  if(!audio.src)return;
  audio.currentTime=0;
  await audio.play();
};
$('seek').oninput=()=>{
  const audio=$('tts-audio');
  if(Number.isFinite(audio.duration)) audio.currentTime=(Number($('seek').value)/1000)*audio.duration;
};
$('download-wav').onclick=()=>{
  if(currentWav) downloadBlob('piper-'+Date.now()+'.wav',currentWav);
};
$('tts-audio').addEventListener('loadedmetadata',()=>{applyPlaybackSettings();syncPlayer()});
$('tts-audio').addEventListener('timeupdate',syncPlayer);
$('tts-audio').addEventListener('play',()=>{$('playpause').textContent='Pausar'});
$('tts-audio').addEventListener('pause',()=>{$('playpause').textContent='Reproducir'});
$('tts-audio').addEventListener('ended',()=>{$('playpause').textContent='Reproducir';syncPlayer()});
$('synth').onclick=async()=>{
  $('synth').disabled=true; $('tts-progress').value=0;
  try{
    const lib=await getPiper(), voiceId=$('voice').value, text=$('tts-text').value.trim();
    if(!voiceId||!text) throw new Error('Falta voz o texto.');
    if(activeTtsVoice && activeTtsVoice!==voiceId && lib.TtsSession && '_instance' in lib.TtsSession){
      lib.TtsSession._instance=null;
      log('tts-session-reset',{from:activeTtsVoice,to:voiceId});
    }
    activeTtsVoice=voiceId;
    const heapBefore=performance.memory?.usedJSHeapSize??null;
    $('tts-status').textContent='Sintetizando '+voiceId+'…';
    const start=performance.now();
    const wav=await lib.predict({text,voiceId},p=>{
      if(p?.total&&Number.isFinite(p.loaded)) $('tts-progress').value=Math.round(p.loaded*100/p.total);
    });
    const result={
      at:new Date().toISOString(),voiceId,library:'@jtsage/piper-tts-web@1.2.0',
      inferenceMs:Math.round(performance.now()-start),
      textChars:text.length,wavBytes:wav.size??null,playbackRate:Number($('rate').value),
      jsHeapBefore:heapBefore,jsHeapAfter:performance.memory?.usedJSHeapSize??null
    };
    currentWav=wav;
    if(audioUrl)URL.revokeObjectURL(audioUrl); audioUrl=URL.createObjectURL(wav);
    const audio=$('tts-audio'); audio.src=audioUrl; applyPlaybackSettings();
    $('player').hidden=false; $('seek').value=0; $('playpause').textContent='Reproducir';
    $('tts-progress').value=100; $('tts-status').textContent='Audio generado. Usá los controles de reproducción debajo.';
    run.tts.push(result); renderMetrics('tts-metrics',result); log('tts-complete',result);
  }catch(error){$('tts-status').textContent='Error TTS: '+error.message;log('tts-error',{error:String(error)})}
  finally{$('synth').disabled=false}
};

$('export').onclick=()=>{
  run.finishedAt=new Date().toISOString();
  download('voz-texto-'+Date.now()+'.json',JSON.stringify(run,null,2),'application/json');
};