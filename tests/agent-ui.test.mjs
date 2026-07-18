import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AGENTS, AGENT_LIST } from '../src/agentCatalog.js';

const root = new URL('../', import.meta.url);
const source = async path => readFile(new URL(path,root),'utf8');

test('every official ability declares a bot intent and a runtime handler', async () => {
  const runtime=await source('src/abilities.js');
  const intents=new Set(['entry','cover','control','damage','escape','heal','info','setup','weapon','ultimate']);
  for(const [id,agent] of Object.entries(AGENTS)) for(const ability of Object.values(agent.ab)){
    assert.equal(intents.has(ability.intent),true,`${id}:${ability.name} intent`);
    assert.match(runtime,new RegExp(`case ['\"]${ability.type}['\"]`),`${id}:${ability.type}`);
  }
});

test('agent selection renders local official portraits and ability icons', async () => {
  const [hud,icons]=await Promise.all([source('src/hud.js'),source('src/icons.js')]);
  assert.match(hud,/a\.portrait/);
  assert.match(hud,/class="portrait"/);
  assert.match(hud,/els\.agentSelect\.scrollTop\s*=\s*0/);
  assert.match(icons,/<img/);
  assert.equal(AGENT_LIST.length,29);
});

test('bots use the data-driven official roster strategy', async () => {
  const bots=await source('src/bots.js');
  assert.match(bots,/import \{[^}]*AGENTS[^}]*\} from ['"]\.\/config\.js/);
  assert.match(bots,/function genericBotAbilities/);
  assert.match(bots,/ability\.intent/);
});

test('fictional agent names are gone from user-visible configuration', async () => {
  const visible=await Promise.all(['src/config.js','src/hud.js','index.html'].map(source));
  const forbidden=/风影|烈焰|天穹|暗幕|猎鹰|圣愈|雷奕|蛛影|岚切|青鸩|零式|影猎|魅影|灵愈|疾电|潮汐|噬梦|织锁|伯爵/;
  assert.doesNotMatch(visible.join('\n'),forbidden);
});

test('the deployed page declares a local favicon', async () => {
  const index=await source('index.html');
  assert.match(index,/<link[^>]+rel=["']icon["'][^>]+href=["']\.\/assets\//);
});

test('browser automation can inspect and deterministically advance the match', async () => {
  const main=await source('src/main.js');
  assert.match(main,/window\.render_game_to_text/);
  assert.match(main,/window\.advanceTime/);
  assert.match(main,/controlMode/);
  assert.match(main,/abilities/);
});
