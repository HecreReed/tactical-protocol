import { G } from './state.js?v=28';
import { clamp } from './utils.js?v=28';

let ctx = null, master = null;

export function initAudio(){
  if(ctx) return;
  ctx = new (window.AudioContext||window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = G.settings.volume;
  master.connect(ctx.destination);
}
export function setVolume(v){ if(master) master.gain.value = v; }
const now = ()=> ctx ? ctx.currentTime : 0;

function noiseBuf(dur=0.5){
  const n = Math.floor(ctx.sampleRate*dur);
  const buf = ctx.createBuffer(1,n,ctx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
  return buf;
}
let _noise;
function playNoise({dur=0.2, vol=0.3, hp=0, lp=8000, decay=0.15, delay=0}){
  if(!ctx) return;
  if(!_noise) _noise = noiseBuf(1);
  const src = ctx.createBufferSource(); src.buffer=_noise; src.loop=true;
  const g = ctx.createGain();
  const t = now()+delay;
  g.gain.setValueAtTime(vol,t);
  g.gain.exponentialRampToValueAtTime(0.001, t+decay);
  let node = src;
  if(lp<20000){ const f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=lp; node.connect(f); node=f; }
  if(hp>0){ const f=ctx.createBiquadFilter(); f.type='highpass'; f.frequency.value=hp; node.connect(f); node=f; }
  node.connect(g); g.connect(master);
  src.start(t); src.stop(t+dur+delay+0.05);
}
function playTone({f=440, f2=null, type='sine', vol=0.2, dur=0.15, delay=0}){
  if(!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  const t = now()+delay;
  o.type=type; o.frequency.setValueAtTime(f,t);
  if(f2) o.frequency.exponentialRampToValueAtTime(Math.max(1,f2), t+dur);
  g.gain.setValueAtTime(vol,t);
  g.gain.exponentialRampToValueAtTime(0.001, t+dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t+dur+0.05);
}

const distVol = d => clamp(1/(1+d*0.09), 0.03, 1);

export const sfx = {
  shot(cat, d=0){
    const v = distVol(d);
    switch(cat){
      case 'pistol': playNoise({vol:.32*v,lp:3800,decay:.09}); playTone({f:190,f2:60,type:'triangle',vol:.2*v,dur:.07}); break;
      case 'smg':    playNoise({vol:.26*v,lp:4200,decay:.06}); playTone({f:220,f2:80,type:'square',vol:.1*v,dur:.05}); break;
      case 'rifle':  playNoise({vol:.38*v,lp:3200,decay:.11}); playTone({f:150,f2:48,type:'sawtooth',vol:.22*v,dur:.09}); break;
      case 'sniper': playNoise({vol:.5*v,lp:2200,decay:.3}); playTone({f:100,f2:30,type:'sawtooth',vol:.3*v,dur:.25}); break;
      case 'heavy':  playNoise({vol:.3*v,lp:2800,decay:.09}); playTone({f:130,f2:55,type:'square',vol:.16*v,dur:.07}); break;
      case 'shotgun':playNoise({vol:.5*v,lp:2500,decay:.18}); playTone({f:90,f2:35,type:'sawtooth',vol:.28*v,dur:.14}); break;
      case 'melee':  playNoise({vol:.12*v,hp:2000,decay:.06}); break;
      case 'ult':    playTone({f:900,f2:300,type:'sawtooth',vol:.14*v,dur:.1}); playNoise({vol:.1*v,hp:1500,decay:.08}); break;
    }
  },
  reload(){ playTone({f:800,f2:500,type:'square',vol:.06,dur:.05}); playTone({f:500,f2:900,type:'square',vol:.06,dur:.05,delay:.25}); },
  dryfire(){ playTone({f:1200,type:'square',vol:.05,dur:.03}); },
  equip(){ playNoise({vol:.06,hp:1000,decay:.05}); },
  step(d=0,walk=false){ const v=distVol(d)*(walk?0.25:1); playNoise({vol:.045*v,hp:300,lp:900,decay:.05}); },
  hit(){ playTone({f:1300,type:'square',vol:.09,dur:.04}); },
  headshot(){ playTone({f:1900,f2:2400,type:'square',vol:.11,dur:.07}); },
  kill(){ playTone({f:520,f2:780,type:'sine',vol:.12,dur:.12}); playTone({f:780,f2:1040,type:'sine',vol:.1,dur:.12,delay:.08}); },
  hurt(){ playNoise({vol:.18,lp:900,decay:.12}); playTone({f:180,f2:90,type:'sawtooth',vol:.1,dur:.1}); },
  impact(d=0){ playNoise({vol:.05*distVol(d),hp:1800,decay:.03}); },
  spikeBeep(fast){ playTone({f:fast?1120:980,type:'square',vol:.09,dur:.07}); },
  plantTick(){ playTone({f:700,type:'square',vol:.04,dur:.03}); },
  planted(){ playTone({f:600,f2:900,vol:.14,dur:.2}); playTone({f:900,f2:1200,vol:.12,dur:.25,delay:.15}); },
  defused(){ playTone({f:900,f2:1400,vol:.14,dur:.3}); },
  explosion(d=0){ const v=distVol(d*0.4);
    playNoise({vol:.7*v,lp:1200,decay:.9,dur:1.2}); playTone({f:60,f2:24,type:'sine',vol:.5*v,dur:1}); },
  roundStart(){ playTone({f:520,vol:.1,dur:.1}); playTone({f:660,vol:.1,dur:.14,delay:.12}); },
  roundWin(){ [523,659,784,1046].forEach((f,i)=>playTone({f,vol:.12,dur:.18,delay:i*.11})); },
  roundLose(){ [392,330,262].forEach((f,i)=>playTone({f,vol:.12,dur:.22,delay:i*.13,type:'triangle'})); },
  buy(){ playTone({f:1000,f2:1400,vol:.08,dur:.08}); },
  deny(){ playTone({f:220,type:'square',vol:.07,dur:.09}); },
  ultReady(){ [660,880,1100].forEach((f,i)=>playTone({f,vol:.1,dur:.14,delay:i*.09})); },
  ability(){ playTone({f:700,f2:1100,type:'sine',vol:.1,dur:.15}); },
  smokePop(d=0){ playNoise({vol:.2*distVol(d),lp:800,decay:.3}); },
  molly(d=0){ playNoise({vol:.22*distVol(d),lp:1500,decay:.5,dur:.6}); },
  wall(d=0){ playTone({f:200,f2:400,type:'triangle',vol:.14*distVol(d),dur:.3}); },
  heal(){ playTone({f:880,f2:1320,vol:.08,dur:.3}); },
  dash(){ playNoise({vol:.15,hp:600,lp:3000,decay:.2}); },
  beamCharge(d=0){ playTone({f:300,f2:1200,type:'sawtooth',vol:.12*distVol(d),dur:1.2}); },
  beamFire(d=0){ playNoise({vol:.5*distVol(d*0.5),lp:2000,decay:1.2,dur:1.5}); playTone({f:150,f2:50,type:'sawtooth',vol:.3*distVol(d*0.5),dur:1.4}); },
  flashPop(d=0){ playTone({f:2400,f2:3200,type:'sine',vol:.22*distVol(d),dur:.35}); playNoise({vol:.18*distVol(d),hp:3000,decay:.12}); },
  blinded(){ playTone({f:3000,type:'sine',vol:.16,dur:1.4}); },
  teleport(d=0){ playNoise({vol:.2*distVol(d),hp:400,lp:2500,decay:.3}); playTone({f:600,f2:150,type:'sine',vol:.12*distVol(d),dur:.3}); },
  reveal(){ playTone({f:1200,f2:1600,type:'sine',vol:.1,dur:.25}); playTone({f:1600,f2:2000,type:'sine',vol:.08,dur:.2,delay:.15}); },
  revealed(){ playTone({f:500,f2:350,type:'square',vol:.08,dur:.2}); },
  barrier(){ playNoise({vol:.25,lp:1500,hp:200,decay:.5,dur:.6}); playTone({f:800,f2:200,type:'sine',vol:.12,dur:.5}); },
  nade(d=0){ const v=distVol(d*.6); playNoise({vol:.4*v,lp:1500,decay:.4,dur:.5}); playTone({f:80,f2:30,type:'sine',vol:.25*v,dur:.4}); },
  stun(d=0){ const v=distVol(d*.6); playNoise({vol:.3*v,lp:600,decay:.5,dur:.6}); playTone({f:55,f2:28,type:'sine',vol:.3*v,dur:.55}); },
  suppress(d=0){ const v=distVol(d); playTone({f:1600,f2:200,type:'sawtooth',vol:.12*v,dur:.5}); playTone({f:400,f2:120,type:'square',vol:.08*v,dur:.4,delay:.1}); },
};
