import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const url=process.env.GAME_URL||'http://127.0.0.1:8080';
const output=new URL('../output/smoke/',import.meta.url);
await mkdir(output,{recursive:true});

const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});

function watchErrors(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  return errors;
}

async function openRoster(viewport,label){
  const page=await browser.newPage({viewport});
  const errors=watchErrors(page);
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.click('#toAgents');
  assert.equal(await page.locator('#agentSelect').evaluate(el=>el.scrollTop),0,`${label} roster starts at top`);
  await page.evaluate(async()=>{
    const roster=document.querySelector('#agentSelect');
    document.querySelectorAll('.agentCard img').forEach(img=>{img.loading='eager';});
    for(let y=0;y<roster.scrollHeight;y+=Math.max(240,roster.clientHeight*.7)){
      roster.scrollTop=y;
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    roster.scrollTop=roster.scrollHeight;
    await new Promise(resolve=>setTimeout(resolve,60));
    roster.scrollTop=0;
  });
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.agentCard img')).every(img=>img.complete&&img.naturalWidth>0));
  assert.equal(await page.locator('.agentCard').count(),29,`${label} roster count`);
  const layout=await page.evaluate(()=>{
    const cards=[...document.querySelectorAll('.agentCard')];
    const heading=document.querySelector('#agentSelect h1').getBoundingClientRect();
    const first=cards[0].getBoundingClientRect();
    const overlap=cards.some((card,index)=>{
      const a=card.getBoundingClientRect();
      return cards.slice(index+1).some(other=>{const b=other.getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});
    });
    return {innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,
      firstTop:first.top,headingBottom:heading.bottom,overlap,
      badImages:cards.filter(c=>{const img=c.querySelector('.portrait');return !img.complete||!img.naturalWidth;}).length,
      clippedNames:[...document.querySelectorAll('.agentCard b')].filter(el=>el.scrollWidth>el.clientWidth&&getComputedStyle(el).whiteSpace==='nowrap').length};
  });
  assert.equal(layout.scrollWidth,layout.clientWidth,`${label} horizontal overflow`);
  assert.equal(layout.overlap,false,`${label} card overlap`);
  assert.ok(layout.firstTop>=layout.headingBottom,`${label} cards overlap heading`);
  assert.equal(layout.badImages,0,`${label} broken portraits`);
  assert.equal(layout.clippedNames,0,`${label} clipped ability names`);
  await page.screenshot({path:new URL(`agents-${label}.png`,output).pathname,fullPage:false});
  return {page,errors};
}

function assertCanvasPixels(buffer){
  const png=PNG.sync.read(buffer);let sum=0,sum2=0,n=0;const buckets=new Set();
  for(let y=0;y<png.height;y+=8)for(let x=0;x<png.width;x+=8){
    const i=(y*png.width+x)*4,lum=(png.data[i]+png.data[i+1]+png.data[i+2])/3;
    sum+=lum;sum2+=lum*lum;n++;buckets.add(`${png.data[i]>>4},${png.data[i+1]>>4},${png.data[i+2]>>4}`);
  }
  const variance=sum2/n-(sum/n)**2;
  assert.ok(variance>120,'canvas has visual variance');
  assert.ok(buckets.size>30,'canvas is not a blank frame');
}

async function enterAgent(page,name){
  const card=page.locator('.agentCard').filter({has:page.getByRole('heading',{name,exact:true})});
  assert.equal(await card.count(),1,name);
  await card.click();
  await page.waitForSelector('canvas');
  await page.click('#buyClose');
  await page.evaluate(()=>window.advanceTime(31000));
  const state=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
  assert.equal(state.mode,'live',`${name} reached live phase`);
  return state;
}

try {
  const desktop=await openRoster({width:1280,height:800},'desktop');
  await enterAgent(desktop.page,'Jett');
  await desktop.page.keyboard.press('e');
  let state=JSON.parse(await desktop.page.evaluate(()=>window.render_game_to_text()));
  assert.equal(state.player.abilities.e.charges,1,'Tailwind prime keeps its charge');
  await desktop.page.keyboard.press('e');
  state=JSON.parse(await desktop.page.evaluate(()=>window.render_game_to_text()));
  assert.equal(state.player.abilities.e.charges,0,'Tailwind dash spends its charge');
  const cloudbursts=state.player.abilities.c.charges;
  await desktop.page.keyboard.press('c');
  await desktop.page.keyboard.press('Digit1');
  state=JSON.parse(await desktop.page.evaluate(()=>window.render_game_to_text()));
  assert.equal(state.player.abilities.c.charges,cloudbursts,'cancelled Cloudburst keeps its charge');
  const canvas=desktop.page.locator('#app canvas');
  assertCanvasPixels(await canvas.screenshot({path:new URL('gameplay-jett.png',output).pathname}));
  assert.deepEqual(desktop.errors,[],'desktop console errors');
  await desktop.page.close();

  const sova=await openRoster({width:1280,height:800},'sova');
  await enterAgent(sova.page,'Sova');
  await sova.page.keyboard.press('c');
  await sova.page.evaluate(()=>window.advanceTime(100));
  state=JSON.parse(await sova.page.evaluate(()=>window.render_game_to_text()));
  assert.equal(state.controlMode?.type,'sova','Owl Drone transfers control');
  await sova.page.evaluate(async()=>{const {G}=await import('./src/state.js?v=29');G.mouse.rmb=true;window.advanceTime(100);});
  state=JSON.parse(await sova.page.evaluate(()=>window.render_game_to_text()));
  assert.equal(state.controlMode,null,'Owl Drone returns control on alternate fire');
  assert.deepEqual(sova.errors,[],'Sova console errors');
  await sova.page.close();

  const phoenix=await openRoster({width:1280,height:800},'phoenix');
  state=await enterAgent(phoenix.page,'Phoenix');
  const anchor=state.player.position;
  await phoenix.page.evaluate(async()=>{const {G}=await import('./src/state.js?v=29');G.player.ult=6;});
  await phoenix.page.keyboard.press('x');
  await phoenix.page.evaluate(async()=>{
    const [{G},{applyDamage}]=await Promise.all([import('./src/state.js?v=29'),import('./src/combat.js?v=29')]);
    G.player.pos.x+=6;
    applyDamage(G.player,999,null,'smoke-test','b');
  });
  state=JSON.parse(await phoenix.page.evaluate(()=>window.render_game_to_text()));
  assert.equal(state.player.alive,true,'Run It Back prevents fatality');
  assert.equal(state.player.hp,100,'Run It Back restores health');
  assert.deepEqual(state.player.position,anchor,'Run It Back restores the anchor position');
  assert.deepEqual(phoenix.errors,[],'Phoenix console errors');
  await phoenix.page.close();

  const mobile=await openRoster({width:390,height:844},'mobile');
  assert.deepEqual(mobile.errors,[],'mobile console errors');
  await mobile.page.close();
  console.log('Browser smoke passed: desktop/mobile roster, Jett recasts, Sova control return, Phoenix fatality return, and canvas pixels.');
} finally {
  await browser.close();
}
