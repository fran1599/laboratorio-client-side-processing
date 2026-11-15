import * as TTS from 'https://cdn.jsdelivr.net/npm/@jtsage/piper-tts-web@1.2.0/+esm';

let session = null;
let activeSessionKey = null;

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

async function ensureSession(voiceId,prosody=null){
  const sessionKey=voiceId+'|'+JSON.stringify(prosody||{});
  if(session && activeSessionKey===sessionKey)return session;
  if(TTS.TtsSession && '_instance' in TTS.TtsSession)TTS.TtsSession._instance=null;
  session=null;
  activeSessionKey=sessionKey;

  const customLoader=async url=>{
    if(!prosody||!url.endsWith('.onnx.json'))return null;
    const response=await fetch(url);
    if(!response.ok)throw new Error('No se pudo cargar configuración de voz: '+response.status);
    const config=await response.json();
    config.inference=config.inference||{};
    if(Number.isFinite(prosody.lengthScale))config.inference.length_scale=prosody.lengthScale;
    if(Number.isFinite(prosody.noiseScale))config.inference.noise_scale=prosody.noiseScale;
    if(Number.isFinite(prosody.noiseW))config.inference.noise_w=prosody.noiseW;
    self.postMessage({
      type:'engine-log',
      message:'Applied prosody override: '+JSON.stringify(config.inference)
    });
    return new Blob([JSON.stringify(config)],{type:'application/json'});
  };

  const fileReader=new TTS.CachedFileReader({
    customLoader,
    progress:p=>self.postMessage({type:'download-progress',progress:p})
  });
  self.postMessage({type:'engine-state',state:'initializing',voiceId,prosody});
  session=await TTS.TtsSession.create({
    voiceId,
    fileReader,
    logger:message=>self.postMessage({type:'engine-log',message})
  });
  self.postMessage({type:'engine-state',state:'ready',voiceId,prosody});
  return session;
}
self.onmessage=async(event)=>{
  const data=event.data||{};
  try{
    if(data.type==='voices'){
      const voices=await TTS.voices();
      self.postMessage({type:'voices',voices});
      return;
    }

    if(data.type==='compare-voices'){
      const {jobId,voices=[],text=''}=data;
      for(let i=0;i<voices.length;i++){
        const voiceId=voices[i];
        self.postMessage({type:'compare-start',jobId,index:i+1,total:voices.length,voiceId});
        try{
          const current=await ensureSession(voiceId,null);
          const started=performance.now();
          const wav=await current.predict(text);
          self.postMessage({
            type:'compare-result',jobId,index:i+1,total:voices.length,voiceId,
            inferenceMs:Math.round(performance.now()-started),wav
          });
        }catch(error){
          self.postMessage({
            type:'compare-error',jobId,index:i+1,total:voices.length,voiceId,
            error:serializeError(error)
          });
        }
      }
      self.postMessage({type:'compare-complete',jobId});
      return;
    }

    if(data.type!=='synth') return;

    const {jobId,voiceId,chunks=[],prosody=null}=data;
    const current=await ensureSession(voiceId,prosody);
    for(let i=0;i<chunks.length;i++){
      const chunk=chunks[i];
      const text=typeof chunk==='string'?chunk:chunk.text;
      const pauseAfterMs=typeof chunk==='object'?(chunk.pauseAfterMs||0):0;
      const boundary=typeof chunk==='object'?(chunk.boundary||null):null;
      self.postMessage({
        type:'chunk-start',jobId,index:i+1,total:chunks.length,chars:text.length,pauseAfterMs,boundary
      });
      const started=performance.now();
      try{
        const wav=await current.predict(text);
        self.postMessage({
          type:'chunk-complete',jobId,index:i+1,total:chunks.length,
          chars:text.length,inferenceMs:Math.round(performance.now()-started),
          pauseAfterMs,boundary,wav
        });
      }catch(error){
        self.postMessage({
          type:'chunk-error',jobId,index:i+1,total:chunks.length,
          chars:text.length,pauseAfterMs,boundary,error:serializeError(error)
        });
        throw error;
      }
    }
    self.postMessage({type:'synth-complete',jobId});
  }catch(error){
    self.postMessage({
      type:'worker-error',jobId:data.jobId||null,error:serializeError(error)
    });
  }
};

self.postMessage({type:'worker-ready'});
