import * as THREE from 'three';
import { G } from './state.js?v=19';
import { buildMap } from './map.js?v=19';
import { initFX, updateFX, pulseBarriers } from './effects.js?v=19';
import { initAudio } from './audio.js?v=19';
import { initHUD, showAgentSelect, updateHUD, renderMinimapStatic, showLockHint, setBuyOpen } from './hud.js?v=19';
import { initPlayerInput, updatePlayer, buildViewModel, updateObserver } from './player.js?v=19';
import { updateBots } from './bots.js?v=19';
import { startMatch, updateGame } from './game.js?v=19';
import { updateProjectiles, tickHealAndZones, updateDeployables } from './abilities.js?v=19';

let started = false;
let sun = null;

function initThree(){
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    const size = s.shadows === 'high' ? 2048 : (s.shadows==='low'?1024:0);
    if(size && sun.shadow.mapSize.x !== size){
      sun.shadow.mapSize.set(size, size);
      if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }
  G.renderer.setPixelRatio(s.quality==='high' ? Math.min(devicePixelRatio,2) : 1);
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

let last = performance.now();
function loop(){
  requestAnimationFrame(loop);
  const nowMs = performance.now();
  let dt = (nowMs - last)/1000;
  last = nowMs;
  dt = Math.min(dt, .04);
  G.dt = dt;
  G.now = nowMs/1000;

  if(started){
    updateGame(dt);
    if(G.player) updatePlayer(dt);
    else if(G.observer) updateObserver(dt);
    updateBots(dt);
    updateProjectiles(dt);
    updateDeployables(dt);
    tickHealAndZones(dt);
    updateFX(dt);
    pulseBarriers();
    updateHUD();
  }
  G.renderer.render(G.scene, G.camera);
}

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
    startMatch(agentKey, observer);
    if(!observer) buildViewModel();
    started = true;
    if(!observer) setBuyOpen(true);
    if(observer) G.hooks.hudMsg?.('空格 切换观战目标 · V 切换第一/第三人称');
  });

  loop();
}

boot();
