import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const url=process.env.GAME_URL||'http://127.0.0.1:8080';
const output=new URL('../output/ai-sim/',import.meta.url);
const allMaps=[['yunque','云阙'],['chaomen','潮门'],['chilian','赤炼'],['jingcheng','镜城'],['longji','龙脊']];
const maps=process.env.SIM_MAP?allMaps.filter(([id])=>id===process.env.SIM_MAP):allMaps;
const activeStates=new Set(['advance','execute','fetch','retake','regroup','fallback','hunt','loot']);
await mkdir(output,{recursive:true});

function watchErrors(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  return errors;
}

function assertCanvasPixels(buffer,label){
  const png=PNG.sync.read(buffer);let sum=0,sum2=0,n=0;const buckets=new Set();
  for(let y=0;y<png.height;y+=8)for(let x=0;x<png.width;x+=8){
    const i=(y*png.width+x)*4,lum=(png.data[i]+png.data[i+1]+png.data[i+2])/3;
    sum+=lum;sum2+=lum*lum;n++;buckets.add(`${png.data[i]>>4},${png.data[i+1]>>4},${png.data[i+2]>>4}`);
  }
  assert.ok(sum2/n-(sum/n)**2>100,`${label} visual variance`);
  assert.ok(buckets.size>28,`${label} nonblank color range`);
}

const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
try{
  for(const [mapIndex,[id,name]] of maps.entries()){
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=watchErrors(page);
    await page.addInitScript(({seed})=>{
      let value=seed>>>0;
      Math.random=()=>{value=(value+0x6D2B79F5)>>>0;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
    },{seed:73019+mapIndex*997});
    await page.goto(url,{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('.mapCard').count(),16,'map card count');
    const card=page.locator('.mapCard').filter({has:page.getByRole('heading',{name,exact:true})});
    assert.equal(await card.count(),1,`${name} selection card`);
    await card.click();
    await page.locator('.obsBtn').click();
    await page.waitForSelector('#app canvas');
    await page.evaluate(()=>window.advanceTime(30500));
    let state=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
    assert.equal(state.map,id);
    assert.equal(state.mode,'live',`${id} enters live phase`);
    await page.evaluate(async()=>{
      const {G}=await import('./src/state.js?v=30');
      for(const ent of G.ents)ent.flashUntil=G.now+20;
    });

    const attackStates=new Set(),defenseStates=new Set();
    const motion=new Map(),failures=[],failureDetails=[];
    let planted=false,elapsed=0;
    for(let sample=0;sample<100;sample++){
      await page.evaluate(()=>window.advanceTime(500));
      state=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
      elapsed+=.5;
      for(const ent of state.entities){
        if(!ent.ai)continue;
        (ent.team==='ally'?attackStates:defenseStates).add(ent.ai.state);
        if(ent.ai.state==='retake'||ent.ai.state==='defuse')planted=true;
        if(!ent.ai.goal)continue;
        const horizontal=Math.hypot(ent.x-ent.ai.goal.x,ent.z-ent.ai.goal.z);
        const vertical=Math.abs(ent.y-ent.ai.goal.y);
        if(horizontal<1.1&&vertical>.8&&!ent.ai.targetId){
          failures.push(`${id} bot ${ent.id} accepted goal on wrong floor`);
          failureDetails.push({elapsed,reason:'wrong-floor',entity:ent});
        }
        const distance=Math.hypot(horizontal,vertical*1.5);
        const key=`${ent.ai.goal.x},${ent.ai.goal.y},${ent.ai.goal.z}`;
        const prev=motion.get(ent.id);
        const movingIntent=activeStates.has(ent.ai.state)&&distance>2.5&&!ent.ai.targetId&&!ent.ai.channel;
        let stalled=0;
        if(movingIntent&&prev&&prev.key===key){
          const moved=Math.hypot(ent.x-prev.x,ent.y-prev.y,ent.z-prev.z);
          const progressed=prev.distance-distance;
          stalled=moved>.35||progressed>.25?0:prev.stalled+.5;
          if(stalled>3.5){
            failures.push(`${id} bot ${ent.id} stalled in ${ent.ai.state} for ${stalled.toFixed(1)}s`);
            failureDetails.push({elapsed,reason:'stalled',entity:ent,previous:prev});
          }
        }
        motion.set(ent.id,{x:ent.x,y:ent.y,z:ent.z,distance,key,stalled});
      }
      if(state.mode==='end'&&elapsed>8)break;
    }

    if(failureDetails.length)await writeFile(new URL(`failures-${id}.json`,output),JSON.stringify(failureDetails,null,2));
    assert.deepEqual(failures,[],`${id} navigation progress`);
    assert.ok(attackStates.has('advance'),`${id} attackers advance`);
    assert.ok([...attackStates].some(s=>['stage','execute','plant','hold'].includes(s)),`${id} attackers coordinate an execute`);
    assert.ok(defenseStates.has('post')||defenseStates.has('hunt'),`${id} defenders establish posts`);
    if(planted)assert.ok(defenseStates.has('retake')||defenseStates.has('defuse'),`${id} defenders retake`);

    const canvas=page.locator('#app canvas');
    const gameplay=await canvas.screenshot({path:new URL(`gameplay-${id}.png`,output).pathname});
    assertCanvasPixels(gameplay,`${id} gameplay`);
    const overviewData=await page.evaluate(async()=>{
      const {G}=await import('./src/state.js?v=30');
      G.camera.position.set(0,48,52);G.camera.lookAt(0,0,0);G.renderer.render(G.scene,G.camera);
      return G.renderer.domElement.toDataURL('image/png').split(',')[1];
    });
    const overview=Buffer.from(overviewData,'base64');
    await writeFile(new URL(`overview-${id}.png`,output),overview);
    assertCanvasPixels(overview,`${id} overview`);

    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(100);
    const mobile=await page.screenshot({path:new URL(`mobile-${id}.png`,output).pathname});
    assertCanvasPixels(mobile,`${id} mobile`);

    if(id==='yunque'){
      const cleanup=await page.evaluate(async()=>{
        const [{G},{targetRing},{startRound}]=await Promise.all([
          import('./src/state.js?v=30'),import('./src/effects.js?v=30'),import('./src/game.js?v=30')]);
        targetRing(G.ents[0].pos,3,2600);
        const before=G.transientFX.length;
        startRound();
        return {before,after:G.transientFX.length,pending:G.abilityEvents.length};
      });
      assert.ok(cleanup.before>0,'browser creates a target ring');
      assert.equal(cleanup.after,0,'round reset clears target rings');
      assert.equal(cleanup.pending,0,'round reset clears ability events');
    }
    assert.deepEqual(errors,[],`${id} console errors`);
    console.log(`${id}: ${elapsed.toFixed(1)}s, attack=${[...attackStates].join(',')}, defense=${[...defenseStates].join(',')}`);
    await page.close();
  }
  console.log('AI simulation passed for five vertical maps.');
}finally{
  await browser.close();
}
