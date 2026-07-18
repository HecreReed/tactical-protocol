import * as THREE from 'three';
import { G } from './state.js?v=30';
import { buildMap } from './map.js?v=30';
import { initFX, updateFX, pulseBarriers } from './effects.js?v=30';
import { initAudio } from './audio.js?v=30';
import { initHUD, showAgentSelect, updateHUD, renderMinimapStatic, showLockHint, setBuyOpen } from './hud.js?v=30';
import { initPlayerInput, updatePlayer, buildViewModel, updateObserver } from './player.js?v=30';
import { updateBots } from './bots.js?v=30';
import { startMatch, updateGame } from './game.js?v=30';
import { updateProjectiles, tickHealAndZones, updateDeployables } from './abilities.js?v=30';
import { warmUpFX } from './effects.js?v=30';

let started = false;
let sun = null;

function initThree(){
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // 阴影半频更新（性能优化，视觉几乎无差）
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb8c8);

  const camera = new THREE.PerspectiveCamera(G.settings.fov, innerWidth/innerHeight, .08, 400);
  camera.position.set(0, 1.6, 32);
  scene.add(camera);

  G.renderer = renderer;
  G.scene = scene;
  G.camera = camera;

  window.addEventListener('resize', ()=>{
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  G.hooks.applyGraphics = applyGraphics;
  G.hooks.rebuildViewModel = buildViewModel;
}

function buildLights(md){
  // 环境光：清冷阴影 + 暖色地面反射，营造 Valorant 式高对比
  const hemi = new THREE.HemisphereLight(md.sky.hemi[0], md.sky.hemi[1], 1.05);
  G.scene.add(hemi);

  // 主光源：强方向光，锐利阴影
  sun = new THREE.DirectionalLight(md.sky.sun, 2.2);
  sun.position.set(md.sky.sunPos[0], md.sky.sunPos[1], md.sky.sunPos[2]);
  sun.castShadow = true;
  sun.shadow.camera.left = -100; sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 380;
  sun.shadow.bias = -0.00045;
  sun.shadow.normalBias = 0.02;
  G.scene.add(sun);
  G.sun = sun;

  // 反向补光：勾出角色轮廓，减弱纯黑阴影
  const fill = new THREE.DirectionalLight(md.accent, 0.55);
  fill.position.set(-md.sky.sunPos[0]*.7, 35, -md.sky.sunPos[2]*.7);
  G.scene.add(fill);

  // 顶部漫射：模拟天空漫反射，柔化暗部
  const skyFill = new THREE.DirectionalLight(md.sky.mid, 0.35);
  skyFill.position.set(0, 60, 0);
  G.scene.add(skyFill);

  applyGraphics();
}

function applyGraphics(){
  const s = G.settings;
  if(sun){
    sun.castShadow = s.shadows !== 'off';
    const size = s.shadows === 'high' ? 1536 : (s.shadows==='low'?1024:0);
    if(size && sun.shadow.mapSize.x !== size){
      sun.shadow.mapSize.set(size, size);
      if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }
  G.renderer.setPixelRatio(s.quality==='high' ? Math.min(devicePixelRatio,1.75) : 1);
  G.renderer.toneMappingExposure = s.quality==='high' ? 1.15 : 1.05;
  if(G.camera && !G.player?.ads){
    G.camera.fov = s.fov;
    G.camera.updateProjectionMatrix();
  }
}

function initPointerLock(){
  const el = G.renderer.domElement;
  const request = ()=>{
    if(!started || G.buyOpen || G.menuOpen) return;
    if(G.match?.phase==='over') return;
    if(G.observer) return;
    // unadjustedMovement：绕过系统鼠标加速，消除转视角抖动（不支持时回退）
    try {
      const pr = el.requestPointerLock({ unadjustedMovement: true });
      if(pr && pr.catch) pr.catch(()=> el.requestPointerLock());
    } catch { el.requestPointerLock(); }
  };
  el.addEventListener('click', request);
  document.querySelector('#lockHint .enterBtn').addEventListener('click', request);
  document.addEventListener('pointerlockchange', ()=>{
    G.locked = document.pointerLockElement === el;
    if(started && !G.locked && !G.buyOpen && !G.menuOpen && G.match?.phase!=='over'){
      showLockHint(true);
    } else showLockHint(false);
  });
}

let last = performance.now(), frameNo = 0, timeOffset = 0;
function stepFrame(dt){
  G.dt=dt;
  frameNo++;
  if((frameNo&1)===0)G.renderer.shadowMap.needsUpdate=true;
  if(started){
    updateGame(dt);
    if(G.player)updatePlayer(dt);else if(G.observer)updateObserver(dt);
    updateBots(dt);updateProjectiles(dt);updateDeployables(dt);tickHealAndZones(dt);
    updateFX(dt);pulseBarriers();updateHUD();
  }
}

function loop(){
  requestAnimationFrame(loop);
  const nowMs = performance.now();
  let dt = (nowMs - last)/1000;
  last = nowMs;
  dt = Math.min(dt, .04);
  G.now = nowMs/1000 + timeOffset;
  stepFrame(dt);
  G.renderer.render(G.scene, G.camera);
}

window.advanceTime = ms => {
  const steps=Math.max(1,Math.round(ms/(1000/60)));
  timeOffset += steps/60;
  for(let i=0;i<steps;i++){G.now+=1/60;stepFrame(1/60);}
  G.renderer?.render(G.scene,G.camera);
};

window.render_game_to_text = () => {
  const player=G.player;
  const payload={
    coordinateSystem:'x east-west, y up, z north-south; positions are world meters',
    mode:G.match?.phase||'agent-select',map:G.map?.id||null,
    score:G.match?.score||null,round:G.match?.round||0,time:G.now,
    spike:G.match?.spike?{state:G.match.spike.state,site:G.match.spike.site,
      x:+G.match.spike.pos.x.toFixed(1),y:+G.match.spike.pos.y.toFixed(1),z:+G.match.spike.pos.z.toFixed(1),
      timeLeft:Math.max(0,+((G.match.spike.explodeAt||0)-G.now).toFixed(1))}:null,
    player:player?{agent:player.agent,alive:player.alive,hp:Math.round(player.hp),armor:player.armor,
      position:{x:+player.pos.x.toFixed(2),y:+player.pos.y.toFixed(2),z:+player.pos.z.toFixed(2)},
      velocity:{x:+player.vel.x.toFixed(2),y:+player.vel.y.toFixed(2),z:+player.vel.z.toFixed(2)},
      abilities:Object.fromEntries(Object.entries(player.ab).map(([key,value])=>[key,{name:value.def.name,charges:value.n,cooldown:key==='e'?Math.max(0,+(player.abCd.e-G.now).toFixed(2)):0}])),
      resources:player.resources}:null,
    controlMode:G.controlMode?{type:G.controlMode.unit?.scoutType||G.controlMode.unit?.type,until:G.controlMode.until}:null,
    entities:G.ents.filter(e=>e.alive).map(e=>({id:e.id,team:e.team,agent:e.agent,hp:Math.round(e.hp),
      x:+e.pos.x.toFixed(1),y:+e.pos.y.toFixed(1),z:+e.pos.z.toFixed(1),
      ai:e.ai?{state:e.ai.state,role:e.ai.teamRole,lane:e.ai.lane,
        goal:e.ai.goal?{x:+e.ai.goal.x.toFixed(1),y:+e.ai.goal.y.toFixed(1),z:+e.ai.goal.z.toFixed(1)}:null,
        pathIndex:e.ai.pathI,pathLength:e.ai.path.length,stuck:+(e.ai.stuckT||0).toFixed(2),
        contact:+(e.ai.contactMemory?.confidence||0).toFixed(2),targetId:e.ai.target?.id||null,
        channel:e.channel||null}:null})),
    utilities:G.utilities.items.map(u=>({id:u.id,type:u.type,team:u.team,hp:u.hp,active:u.active})),
  };
  return JSON.stringify(payload);
};

function boot(){
  initThree();
  initFX(G.scene);
  initHUD();
  initPlayerInput();
  initPointerLock();

  showAgentSelect((mapId, agentKey, observer)=>{
    initAudio();
    buildMap(G.scene, mapId);
    buildLights(G.map.data);
    renderMinimapStatic();
    warmUpFX();
    startMatch(agentKey, observer);
    if(!observer) buildViewModel();
    started = true;
    if(!observer) setBuyOpen(true);
    if(observer) G.hooks.hudMsg?.('空格 切换观战目标 · V 切换第一/第三人称');
  });

  loop();
}

boot();
