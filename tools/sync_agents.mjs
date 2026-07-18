import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { AGENTS, AGENT_LIST } from '../src/agentCatalog.js';

const API = 'https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US';
const response = await fetch(API);
if(!response.ok) throw new Error(`agent metadata request failed: ${response.status}`);
const payload = await response.json();
const official = new Map(payload.data.map(a => [a.displayName, a]));

if(AGENT_LIST.length !== 29) throw new Error(`expected 29 agents, found ${AGENT_LIST.length}`);

async function request(url){
  let error;
  for(let attempt=0; attempt<2; attempt++){
    try {
      const res = await fetch(url, { signal:AbortSignal.timeout(20000) });
      if(!res.ok) throw new Error(`asset request failed ${res.status}: ${url}`);
      return res;
    } catch(err){ error = err; }
  }
  throw error;
}

async function download(url, path){
  if(!process.argv.includes('--force')){
    try { if((await stat(path)).size > 100) return; } catch {}
  }
  const res = await request(url);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

async function ready(path){
  if(process.argv.includes('--force')) return false;
  try { return (await stat(path)).size > 100; } catch { return false; }
}

async function syncAgent(id){
  const def = AGENTS[id];
  const source = official.get(def.name);
  if(!source) throw new Error(`official metadata missing for ${def.name}`);
  const dir = new URL(`../assets/agents/${id}/`, import.meta.url);
  await mkdir(dir, { recursive:true });

  const tmpPortrait = new URL('portrait-source.png', dir);
  const portrait = new URL('portrait.webp', dir);
  if(!(await ready(portrait))){
    await download(source.fullPortraitV2 || source.fullPortrait || source.displayIcon, tmpPortrait);
    const converted = spawnSync('magick', [tmpPortrait.pathname, '-resize', '512x512>', '-quality', '82', portrait.pathname], { encoding:'utf8' });
    if(converted.status !== 0) throw new Error(`portrait conversion failed for ${def.name}: ${converted.stderr}`);
    await rm(tmpPortrait);
  }

  const sourceBySlot = new Map(source.abilities.map(a => [a.slot, a]));
  const slots = { c:'Grenade', q:'Ability1', e:'Ability2', x:'Ultimate' };
  for(const [key, apiSlot] of Object.entries(slots)){
    const ability = sourceBySlot.get(apiSlot);
    if(!ability?.displayIcon) throw new Error(`${def.name} is missing ${apiSlot} icon`);
    await download(ability.displayIcon, new URL(`${key}.png`, dir));
  }
}

const queue = [...AGENT_LIST];
await Promise.all(Array.from({ length:4 }, async () => {
  while(queue.length) await syncAgent(queue.shift());
}));

console.log(`Synced ${AGENT_LIST.length} official portraits and ${AGENT_LIST.length * 4} ability icons.`);
