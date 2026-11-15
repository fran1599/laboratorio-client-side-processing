import * as TTS from 'https://cdn.jsdelivr.net/npm/@jtsage/piper-tts-web@1.2.0/+esm';

let session = null;
let activeVoice = null;

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

async function ensureSession(voiceId){
  if(session && activeVoice===voiceId) return session;
  if(TTS.TtsSession && '_instance' in TTS.TtsSession) TTS.TtsSession._instance=null;
  session=null;
  activeVoice=voiceId;
  const fileReader=new TTS.CachedFileReader({
    progress:p=>self.postMessage({type:'download-progress',progress:p})
  });
  self.postMessage({type:'engine-state',state:'initializing',voiceId});
  session=await TTS.TtsSession.create({
    voiceId,
    fileReader,
    logger:message=>self.postMessage({type:'engine-log',message})
  });
  self.postMessage({type:'engine-state',state:'ready',voiceId});
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
          const current=await ensureSession(voiceId);
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

    const {jobId,voiceId,chunks=[]}=data;
    const current=await ensureSession(voiceId);
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
