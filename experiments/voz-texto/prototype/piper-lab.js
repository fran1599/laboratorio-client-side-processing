const $=id=>document.getElementById(id);

const run={
  version:'0.1.9',
  startedAt:new Date().toISOString(),
  diagnostics:{
    hardwareConcurrency:navigator.hardwareConcurrency??null,
    deviceMemoryGB:navigator.deviceMemory??null,
    secureContext:window.isSecureContext
  },
  samples:[],
  failures:[],
  events:[]
};

let worker=null;
let workerEventQueue=Promise.resolve();
let voices=[];
let currentJob=null;
const sampleUrls=new Map();
const voiceDefaults=new Map();
let configRequest=0;

const ORIGINAL={lengthScale:1,noiseScale:.667,noiseW:.8};
const PRESETS={
  original:ORIGINAL,
  naturalA:{lengthScale:1.03,noiseScale:.75,noiseW:.72},
  naturalB:{lengthScale:1.06,noiseScale:.85,noiseW:.65},
  claudeCandidate8:{lengthScale:.89,noiseScale:1.10,noiseW:1.22}
};
const NATURAL_PAUSES={period:380,question:560,exclamation:460,paragraph:760};

function log(event,detail={}){
  run.events.push({at:new Date().toISOString(),event,...detail});
  $('lab-log').textContent=run.events.slice(-30).map(x=>JSON.stringify(x)).join('\n');
}
function download(name,text,type='application/json'){
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a');
  a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function bytes(n){
  if(!Number.isFinite(n))return'—';
  const u=['B','KB','MB','GB'];let i=0;
  while(n>=1024&&i<u.length-1){n/=1024;i++}
  return n.toFixed(i>1?1:0)+' '+u[i];
}
function serializeError(error){
  if(error instanceof Error)return{name:error.name,message:error.message,stack:error.stack||null};
  return{value:String(error),type:typeof error};
}
function getWorker(){
  if(worker)return worker;
  worker=new Worker('./tts-worker.js',{type:'module'});
  worker.onmessage=e=>{
    workerEventQueue=workerEventQueue.then(()=>handleWorker(e.data)).catch(error=>{
      $('lab-status').textContent='Error de interfaz: '+error.message;
      log('lab-ui-error',{error:serializeError(error)});
      $('generate-sample').disabled=false;
    });
  };
  worker.onerror=e=>{
    $('lab-status').textContent='Error del Worker: '+(e.message||'desconocido');
    log('lab-worker-crash',{message:e.message||null});
  };
  return worker;
}
function normalizeVoices(data){
  if(Array.isArray(data)){
    return data.map((v,i)=>{
      if(typeof v==='string')return{key:v,name:v};
      if(v&&typeof v==='object')return{...v,key:v.key||v.id||v.voiceId||null};
      return{key:null,name:'voice-'+i};
    }).filter(v=>v.key);
  }
  if(data&&typeof data==='object'){
    return Object.entries(data).map(([key,v])=>typeof v==='string'?{key,name:v}:{key,...(v||{})}).filter(v=>v.key);
  }
  return[];
}
function voiceLabel(v){
  const language=v.language?.name_native||v.language?.name_english||v.language?.code||v.language||v.locale||null;
  return[v.name||v.speaker||v.key,language,v.quality||v.model_quality].filter(Boolean).join(' · ');
}
function sliderProsody(){
  return{
    lengthScale:Number($('length-scale').value),
    noiseScale:Number($('noise-scale').value),
    noiseW:Number($('noise-w').value)
  };
}
function readProsodyOverride(){
  return $('use-model-defaults').checked?null:sliderProsody();
}
function effectiveProsody(){
  const selected=$('lab-voice').value;
  if($('use-model-defaults').checked){
    return voiceDefaults.get(selected)||sliderProsody();
  }
  return sliderProsody();
}
function readPauses(){
  return{
    period:Number($('period-pause').value),
    question:Number($('question-pause').value),
    exclamation:Number($('exclamation-pause').value),
    paragraph:Number($('paragraph-pause').value)
  };
}
function updateOutputs(){
  $('length-out').value=Number($('length-scale').value).toFixed(3);
  $('noise-out').value=Number($('noise-scale').value).toFixed(3);
  $('noisew-out').value=Number($('noise-w').value).toFixed(3);
  $('period-out').value=$('period-pause').value+' ms';
  $('question-out').value=$('question-pause').value+' ms';
  $('exclamation-out').value=$('exclamation-pause').value+' ms';
  $('paragraph-out').value=$('paragraph-pause').value+' ms';
  const voice=$('lab-voice').value||'sin voz';
  const p=effectiveProsody();
  const mode=$('use-model-defaults').checked?'original':'override';
  $('lab-config-summary').textContent=voice+' · '+mode+' · '+p.lengthScale.toFixed(2)+' / '+p.noiseScale.toFixed(2)+' / '+p.noiseW.toFixed(2);
}
function setSliderProsody(p){
  $('length-scale').value=p.lengthScale;
  $('noise-scale').value=p.noiseScale;
  $('noise-w').value=p.noiseW;
}
function updateDefaultsState(){
  const useDefaults=$('use-model-defaults').checked;
  ['length-scale','noise-scale','noise-w'].forEach(id=>$(id).disabled=useDefaults);
  updateOutputs();
}
function applyProsody(preset){
  if(preset==='claudeCandidate8'){
    const claude=[...$('lab-voice').options].find(option=>option.value==='es_MX-claude-high');
    if(!claude){
      $('lab-status').textContent='Cargá las voces antes de aplicar el perfil candidato de Claude.';
      return;
    }
    $('lab-voice').value=claude.value;
    requestVoiceConfig();
    applyNaturalPauses();
  }
  if(preset==='original'){
    $('use-model-defaults').checked=true;
    const defaults=voiceDefaults.get($('lab-voice').value);
    if(defaults)setSliderProsody(defaults);
  }else{
    $('use-model-defaults').checked=false;
    setSliderProsody(PRESETS[preset]||ORIGINAL);
  }
  updateDefaultsState();
}
function requestVoiceConfig(){
  const voiceId=$('lab-voice').value;
  if(!voiceId)return;
  const requestId='voice-config-'+(++configRequest);
  getWorker().postMessage({type:'voice-config',requestId,voiceId});
}
function applyNaturalPauses(){
  $('period-pause').value=NATURAL_PAUSES.period;
  $('question-pause').value=NATURAL_PAUSES.question;
  $('exclamation-pause').value=NATURAL_PAUSES.exclamation;
  $('paragraph-pause').value=NATURAL_PAUSES.paragraph;
  updateOutputs();
}
function punctuationBoundary(text){
  const value=text.trim().replace(/["'»”)]*$/,'');
  if(value.endsWith('?'))return'question';
  if(value.endsWith('!'))return'exclamation';
  return'period';
}
function splitLong(text,max=400){
  if(text.length<=max)return[text];
  const words=text.split(/\s+/);
  const out=[];let current='';
  for(const word of words){
    const next=(current+' '+word).trim();
    if(next.length>max){
      if(current)out.push(current);
      current=word;
    }else current=next;
  }
  if(current)out.push(current);
  return out;
}
function buildChunks(text,pauses){
  const normalized=String(text||'').replace(/\r\n?/g,'\n').trim();
  const paragraphs=normalized.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
  const chunks=[];
  for(let p=0;p<paragraphs.length;p++){
    const sentences=paragraphs[p].replace(/\n+/g,' ').match(/[^.!?…]+[.!?…]+(?:["'»”)]*)|[^.!?…]+$/g)??[paragraphs[p]];
    for(let s=0;s<sentences.length;s++){
      const sentence=sentences[s].trim();
      if(!sentence)continue;
      const parts=splitLong(sentence);
      for(let i=0;i<parts.length;i++){
        const lastPart=i===parts.length-1;
        let boundary='technical';
        let pauseAfterMs=120;
        if(lastPart){
          boundary=punctuationBoundary(sentence);
          pauseAfterMs=pauses[boundary]??pauses.period;
          const lastSentence=s===sentences.length-1;
          const lastParagraph=p===paragraphs.length-1;
          if(lastSentence&&!lastParagraph){
            boundary='paragraph';
            pauseAfterMs=Math.max(pauseAfterMs,pauses.paragraph);
          }
        }
        chunks.push({text:parts[i],pauseAfterMs,boundary});
      }
    }
  }
  return chunks;
}
function readWavHeader(buffer){
  const view=new DataView(buffer);
  return{
    audioFormat:view.getUint16(20,true),
    channels:view.getUint16(22,true),
    sampleRate:view.getUint32(24,true),
    byteRate:view.getUint32(28,true),
    blockAlign:view.getUint16(32,true),
    bitsPerSample:view.getUint16(34,true),
    dataSize:view.getUint32(40,true)
  };
}
async function appendSilence(blob,pauseMs){
  if(!pauseMs)return blob;
  const head=await blob.slice(0,44).arrayBuffer();
  const h=readWavHeader(head);
  const dataSize=Math.min(h.dataSize,Math.max(0,blob.size-44));
  let silence=Math.round(h.byteRate*pauseMs/1000);
  silence=Math.ceil(silence/h.blockAlign)*h.blockAlign;
  const out=new Uint8Array(44+dataSize+silence);
  out.set(new Uint8Array(head),0);
  out.set(new Uint8Array(await blob.slice(44,44+dataSize).arrayBuffer()),44);
  const view=new DataView(out.buffer);
  view.setUint32(4,36+dataSize+silence,true);
  view.setUint32(40,dataSize+silence,true);
  return new Blob([out],{type:'audio/wav'});
}
async function mergeWavs(blobs){
  if(blobs.length===1)return blobs[0];
  const meta=[];let total=0;
  for(const blob of blobs){
    const head=await blob.slice(0,44).arrayBuffer();
    const h=readWavHeader(head);
    const dataSize=Math.min(h.dataSize,Math.max(0,blob.size-44));
    meta.push({head,h,dataSize});total+=dataSize;
  }
  const base=meta[0].h;
  for(const m of meta){
    if(m.h.audioFormat!==base.audioFormat||m.h.channels!==base.channels||m.h.sampleRate!==base.sampleRate||m.h.bitsPerSample!==base.bitsPerSample){
      throw new Error('Los fragmentos WAV no comparten formato.');
    }
  }
  const out=new Uint8Array(44+total);
  out.set(new Uint8Array(meta[0].head),0);
  const view=new DataView(out.buffer);
  view.setUint32(4,36+total,true);view.setUint32(40,total,true);
  let offset=44;
  for(let i=0;i<blobs.length;i++){
    const data=new Uint8Array(await blobs[i].slice(44,44+meta[i].dataSize).arrayBuffer());
    out.set(data,offset);offset+=data.length;
  }
  return new Blob([out],{type:'audio/wav'});
}
async function wavDuration(blob){
  const h=readWavHeader(await blob.slice(0,44).arrayBuffer());
  return h.byteRate?Math.min(h.dataSize,Math.max(0,blob.size-44))/h.byteRate:0;
}
function createResultCard(sample,blob){
  const root=$('lab-results');
  if(root.children.length===1&&root.firstElementChild?.classList.contains('muted'))root.replaceChildren();
  const card=document.createElement('article');
  card.className='lab-result-card';

  const title=document.createElement('h3');
  title.textContent='Muestra '+sample.number+' · '+sample.voiceId;

  const params=document.createElement('p');
  params.className='muted';
  params.textContent=(sample.prosodyMode==='model-defaults'?'Original de la voz · ':'Override · ')+
    'length '+sample.prosody.lengthScale.toFixed(3)+
    ' · noise '+sample.prosody.noiseScale.toFixed(3)+
    ' · noise_w '+sample.prosody.noiseW.toFixed(3)+
    ' · '+sample.audioSeconds.toFixed(1)+' s';

  const pause=document.createElement('p');
  pause.className='muted';
  pause.textContent='Pausas: . '+sample.pauses.period+' · ? '+sample.pauses.question+
    ' · ! '+sample.pauses.exclamation+' · ¶ '+sample.pauses.paragraph+' ms';

  const audio=document.createElement('audio');
  audio.controls=true;
  audio.preload='metadata';
  audio.playbackRate=Number($('lab-rate').value);
  const url=URL.createObjectURL(blob);
  sampleUrls.set(sample.id,url);
  audio.src=url;

  const actions=document.createElement('div');
  actions.className='actions';
  const downloadBtn=document.createElement('a');
  downloadBtn.href=url;
  downloadBtn.download='piper-lab-'+sample.number+'.wav';
  downloadBtn.textContent='Descargar WAV';
  downloadBtn.className='button-link';
  const reuse=document.createElement('button');
  reuse.textContent='Reutilizar parámetros';
  reuse.onclick=()=>{
    $('lab-voice').value=sample.voiceId;
    $('use-model-defaults').checked=sample.prosodyMode==='model-defaults';
    setSliderProsody(sample.prosody);
    $('period-pause').value=sample.pauses.period;
    $('question-pause').value=sample.pauses.question;
    $('exclamation-pause').value=sample.pauses.exclamation;
    $('paragraph-pause').value=sample.pauses.paragraph;
    updateDefaultsState();
  };
  actions.append(downloadBtn,reuse);

  card.append(title,params,pause,audio,actions);
  root.prepend(card);
}
async function handleWorker(data){
  if(data.type==='worker-ready'){log('worker-ready');return}
  if(data.type==='voices'){
    voices=normalizeVoices(data.voices);
    const es=voices.filter(v=>/(^es_|spanish|español)/i.test([v.key,v.name,v.language?.name_native,v.language?.name_english,v.language?.code,v.language].filter(Boolean).join(' ')));
    const list=es.length?es:voices;
    const select=$('lab-voice');select.replaceChildren();
    for(const v of list){
      const option=document.createElement('option');
      option.value=v.key;option.textContent=voiceLabel(v);select.append(option);
    }
    const claude=list.find(v=>v.key==='es_MX-claude-high');
    if(claude)select.value=claude.key;
    $('generate-sample').disabled=!list.length;
    $('load-voices').disabled=false;
    $('lab-status').textContent=list.length+' voces candidatas cargadas.';
    updateOutputs();
    requestVoiceConfig();
    log('voices-loaded',{count:list.length,selected:select.value});
    return;
  }
  if(data.type==='voice-config'){
    const inference=data.inference||{};
    const defaults={
      lengthScale:Number(inference.length_scale??1),
      noiseScale:Number(inference.noise_scale??.667),
      noiseW:Number(inference.noise_w??.8)
    };
    voiceDefaults.set(data.voiceId,defaults);
    if(data.voiceId===$('lab-voice').value){
      $('model-defaults').textContent='Valores originales: length_scale '+defaults.lengthScale+
        ' · noise_scale '+defaults.noiseScale+' · noise_w '+defaults.noiseW+
        (data.sampleRate?' · '+data.sampleRate+' Hz':'');
      if($('use-model-defaults').checked)setSliderProsody(defaults);
      updateDefaultsState();
    }
    log('voice-config',{voiceId:data.voiceId,defaults,sampleRate:data.sampleRate??null});
    return;
  }
  if(data.type==='engine-log'){log('engine-log',{message:data.message});return}
  if(data.type==='download-progress'&&currentJob){
    const p=data.progress||{};
    if(p.total&&Number.isFinite(p.loaded)){
      $('lab-progress').value=Math.round(p.loaded*100/p.total);
      $('lab-status').textContent='Descargando recursos de voz… '+Math.round(p.loaded*100/p.total)+'%';
    }
    return;
  }
  if(!currentJob||data.jobId!==currentJob.id)return;
  if(data.type==='chunk-start'){
    $('lab-status').textContent='Generando fragmento '+data.index+' de '+data.total+'…';
    $('lab-progress').value=Math.round(((data.index-1)/data.total)*100);
    return;
  }
  if(data.type==='chunk-complete'){
    const withPause=await appendSilence(data.wav,data.pauseAfterMs||0);
    currentJob.parts[data.index-1]=withPause;
    currentJob.inferenceMs+=data.inferenceMs;
    currentJob.completed++;
    $('lab-progress').value=Math.round(currentJob.completed/currentJob.total*100);
    log('chunk-complete',{index:data.index,total:data.total,inferenceMs:data.inferenceMs,pauseAfterMs:data.pauseAfterMs});
    return;
  }
  if(data.type==='chunk-error'){
    currentJob.failedChunk={
      index:data.index,
      total:data.total,
      chars:data.chars,
      boundary:data.boundary??null,
      error:data.error
    };
    $('lab-status').textContent='Error en el fragmento '+data.index+' de '+data.total+'.';
    log('chunk-error',{
      jobId:currentJob.id,
      index:data.index,total:data.total,chars:data.chars,error:data.error
    });
    return;
  }
  if(data.type==='worker-error'){
    const failure={
      at:new Date().toISOString(),
      jobId:currentJob.id,
      voiceId:currentJob.voiceId,
      textChars:currentJob.textChars,
      prosody:currentJob.prosody,
      prosodyMode:currentJob.prosodyMode,
      pauses:currentJob.pauses,
      completedChunks:currentJob.completed,
      totalChunks:currentJob.total,
      failedChunk:currentJob.failedChunk??null,
      error:data.error
    };
    run.failures.push(failure);
    const fragment=failure.failedChunk?.index;
    $('lab-status').textContent='Error Piper'+(fragment?' en fragmento '+fragment+'/'+failure.totalChunks:'')+
      ': '+(data.error?.message||data.error?.value||'desconocido')+
      '. Podés reintentar con la misma configuración.';
    $('generate-sample').disabled=false;
    log('worker-error',failure);
    currentJob=null;
    return;
  }
  if(data.type==='synth-complete'){
    const blob=await mergeWavs(currentJob.parts.filter(Boolean));
    const audioSeconds=await wavDuration(blob);
    const sample={
      id:currentJob.id,
      number:run.samples.length+1,
      at:new Date().toISOString(),
      voiceId:currentJob.voiceId,
      textChars:currentJob.textChars,
      prosody:currentJob.prosody,
      prosodyMode:currentJob.prosodyMode,
      pauses:currentJob.pauses,
      chunks:currentJob.total,
      inferenceMs:currentJob.inferenceMs,
      audioSeconds,
      wavBytes:blob.size,
      realtimeFactor:Number((currentJob.inferenceMs/1000/audioSeconds).toFixed(3))
    };
    run.samples.push(sample);
    createResultCard(sample,blob);
    $('lab-progress').value=100;
    $('lab-status').textContent='Muestra '+sample.number+' lista · '+audioSeconds.toFixed(1)+' s · '+bytes(blob.size);
    log('sample-complete',sample);
    $('generate-sample').disabled=false;
    currentJob=null;
  }
}

$('load-voices').onclick=()=>{
  $('load-voices').disabled=true;
  $('lab-status').textContent='Cargando catálogo de voces…';
  getWorker().postMessage({type:'voices'});
};
$('generate-sample').onclick=()=>{
  const voiceId=$('lab-voice').value;
  const text=$('lab-text').value.trim();
  if(!voiceId||!text)return;
  const prosodyOverride=readProsodyOverride();
  const prosody=effectiveProsody();
  const prosodyMode=prosodyOverride===null?'model-defaults':'override';
  const pauses=readPauses();
  const chunks=buildChunks(text,pauses);
  currentJob={
    id:'lab-'+Date.now(),
    voiceId,textChars:text.length,prosody,prosodyOverride,prosodyMode,pauses,
    total:chunks.length,completed:0,inferenceMs:0,parts:new Array(chunks.length)
  };
  $('generate-sample').disabled=true;
  $('lab-progress').value=0;
  $('lab-status').textContent='Inicializando '+voiceId+'…';
  log('sample-start',{voiceId,textChars:text.length,prosody,prosodyMode,pauses,chunks:chunks.length});
  getWorker().postMessage({type:'synth',jobId:currentJob.id,voiceId,chunks,prosody:prosodyOverride});
};
$('clear-samples').onclick=()=>{
  for(const url of sampleUrls.values())URL.revokeObjectURL(url);
  sampleUrls.clear();
  run.samples=[];
  $('lab-results').innerHTML='<p class="muted">Todavía no hay muestras.</p>';
  log('samples-cleared');
};
$('export-lab').onclick=()=>{
  run.finishedAt=new Date().toISOString();
  download('piper-lab-'+Date.now()+'.json',JSON.stringify(run,null,2));
};
$('reset-piper').onclick=()=>applyProsody('original');
$('use-model-defaults').addEventListener('change',updateDefaultsState);
$('reset-pauses').onclick=applyNaturalPauses;
document.querySelectorAll('[data-preset]').forEach(btn=>btn.onclick=()=>applyProsody(btn.dataset.preset));
[
  'period-pause','question-pause','exclamation-pause','paragraph-pause'
].forEach(id=>$(id).addEventListener('input',updateOutputs));
['length-scale','noise-scale','noise-w'].forEach(id=>$(id).addEventListener('input',()=>{
  $('use-model-defaults').checked=false;
  updateDefaultsState();
}));
$('lab-voice').addEventListener('change',()=>{
  if($('use-model-defaults').checked)$('model-defaults').textContent='Cargando valores originales…';
  updateOutputs();
  requestVoiceConfig();
});
$('lab-rate').addEventListener('change',()=>{
  document.querySelectorAll('#lab-results audio').forEach(a=>a.playbackRate=Number($('lab-rate').value));
});

applyNaturalPauses();
$('use-model-defaults').checked=true;
updateDefaultsState();
log('lab-ready',run.diagnostics);
