const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require('playwright');
const root=path.resolve(__dirname,'..'),data=path.join(root,'test-runs','wheel-'+Date.now()),out=path.join(root,'evidence');
fs.mkdirSync(data,{recursive:true});fs.mkdirSync(out,{recursive:true});
const results=[],errors=[];const pass=name=>{results.push({name,status:'PASS'});console.log('PASS',name);};let app,page;
async function state(){return page.locator('foliate-view').evaluate(v=>({cfi:v.lastLocation?.cfi,index:v.renderer.getContents()[0]?.index,page:v.renderer.page,pages:v.renderer.pages,start:v.renderer.start,calls:{...v.__wheelCalls}}));}
async function wrap(){await page.locator('foliate-view').evaluate(v=>{v.__wheelCalls={next:0,prev:0};for(const k of ['next','prev']){const fn=v[k].bind(v);v[k]=(...a)=>{v.__wheelCalls[k]++;return fn(...a);};}});}
async function goto(index,anchor=0){await page.locator('foliate-view').evaluate(async(v,{index,anchor})=>{await v.renderer.goTo({index,anchor});},{index,anchor});await page.waitForTimeout(260);}
async function wheel(y){await page.locator('#viewHost').hover();await page.mouse.wheel(0,y);await page.waitForTimeout(260);}
async function open(name){await page.getByRole('button',{name:'阅读 '+name,exact:true}).first().click();await page.waitForSelector('#busy',{state:'hidden'});await page.waitForTimeout(250);await wrap();}
async function back(){await page.locator('#back').click();await page.waitForSelector('#library',{state:'visible'});}
(async()=>{try{
 const env={...process.env,ZHIJIAN_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({executablePath:process.env.ELECTRON_PATH||require('electron'),args:[root],env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.locator('#sampleButton').click();await page.waitForSelector('#busy',{state:'hidden'});await open('星河手记');await goto(1);
 let before=await state();await page.locator('#viewHost').click();await wheel(120);let after=await state();assert.equal(after.page,before.page+1);assert.equal(after.calls.next,before.calls.next+1);pass('MOBI 正文 iframe 获得焦点后，真实鼠标滚轮向下下一页');
 before=after;await wheel(-120);after=await state();assert.equal(after.page,before.page-1);assert.equal(after.calls.prev,before.calls.prev+1);pass('真实鼠标滚轮向上上一页 / 方向反转');
 before=after;await page.locator('#viewHost').hover();for(let i=0;i<28;i++)await page.mouse.wheel(0,8);await page.waitForTimeout(260);after=await state();assert.equal(after.calls.next,before.calls.next+1);assert.equal(after.page,before.page+1);pass('连续触控板小增量与惯性，只翻一页');
 before=after;await wheel(120);await wheel(120);after=await state();assert.equal(after.calls.next,before.calls.next+2);assert.equal(after.page,before.page+2);pass('停顿后的连续独立滚轮动作可继续阅读');
 before=after;await page.locator('#viewHost').hover();await page.keyboard.down('Control');await page.mouse.wheel(0,600);await page.keyboard.up('Control');await page.waitForTimeout(260);after=await state();assert.deepEqual(after.calls,before.calls);pass('Ctrl + 真实滚轮不触发翻页');
 before=after;await page.locator('#viewHost').hover();await page.mouse.wheel(400,0);await page.waitForTimeout(260);after=await state();assert.deepEqual(after.calls,before.calls);pass('水平滚动手势不误翻页');
 await page.locator('#settingsButton').click();before=await state();await page.locator('#settingsPanel').hover();await page.mouse.wheel(0,500);await page.waitForTimeout(250);assert.deepEqual((await state()).calls,before.calls);await page.locator('#viewHost').hover();await page.mouse.wheel(0,120);await page.waitForTimeout(250);assert.deepEqual((await state()).calls,before.calls);pass('设置面板与面板打开时的阅读区滚轮均不误翻页');
 await page.locator('[data-flow=scrolled]').click();await page.locator('#settingsPanel .close-panel').click();await goto(1);before=await state();await wheel(420);after=await state();assert.ok(after.start>before.start,'native vertical scroll advanced');assert.deepEqual(after.calls,before.calls);pass('滚动阅读模式保留真实滚轮连续滚动，不调用翻页');
 await page.locator('#settingsButton').click();await page.locator('[data-flow=paginated]').click();await page.locator('#settingsPanel .close-panel').click();await goto(1,1);before=await state();await wheel(120);after=await state();assert.equal(after.index,2);pass('滚轮向下跨章节');
 await goto(2,0);await wheel(-120);after=await state();assert.equal(after.index,1);pass('滚轮向上回到上一章');
 await goto(0,0);before=await state();await wheel(-120);after=await state();assert.equal(after.index,0);assert.equal(after.cfi,before.cfi);const last=await page.locator('foliate-view').evaluate(v=>v.book.sections.length-1);await goto(last,1);before=await state();await wheel(120);after=await state();assert.equal(after.index,last);assert.equal(after.cfi,before.cfi);pass('全书首尾边界滚轮不越界');
 await back();
 const panelText=Array.from({length:160},(_,i)=>`第${i+1}章 测试目录${i+1}\n这是一段用于目录滚动与阅读测试的原创文字。`).join('\n\n');
 await page.locator('#fileInput').setInputFiles({name:'长目录测试.txt',mimeType:'text/plain',buffer:Buffer.from(panelText)});await page.waitForSelector('#busy',{state:'hidden'});await open('长目录测试');await page.locator('#tocButton').click();before=await state();const top=await page.locator('#tocPanel').evaluate(e=>e.scrollTop);await page.locator('#tocPanel').hover();await page.mouse.wheel(0,550);await page.waitForTimeout(250);assert.ok(await page.locator('#tocPanel').evaluate(e=>e.scrollTop)>top);assert.deepEqual((await state()).calls,before.calls);await page.locator('#tocPanel .close-panel').click();pass('长目录面板正常滚动，正文不翻页');
 await back();await open('山海来信');await goto(0);before=await state();await wheel(120);after=await state();assert.notEqual(after.cfi,before.cfi);await back();pass('EPUB 滚轮翻页与切换书籍后手势状态重置');
 await open('慢读时光');await goto(1);before=await state();await wheel(120);after=await state();assert.equal(after.page,before.page+1);await back();pass('TXT 中文长章节真实滚轮翻页');
 const payload=Array.from({length:15},(_,i)=>({name:`书架滚动样本${i+1}.txt`,mimeType:'text/plain',buffer:Buffer.from(`第一章 书架样本${i+1}\n这是用于书架滚动测试的原创文字。`)}));await page.locator('#fileInput').setInputFiles(payload);await page.waitForSelector('#busy',{state:'hidden'});await page.locator('#grid').hover();const shelfBefore=await page.evaluate(()=>window.scrollY);await page.mouse.wheel(0,500);await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>window.scrollY)>shelfBefore);pass('书架页面保持正常滚动');
 assert.equal(errors.length,0,errors.join('\n'));assert.equal(await app.evaluate(({app})=>app.getVersion()),'1.0.1');pass('成品版本 1.0.1，滚轮测试无未处理异常');
 await app.close();app=null;
}catch(e){results.push({name:'执行失败',status:'FAIL',detail:e.stack});console.error(e);if(page)await page.screenshot({path:path.join(out,'wheel-failure.png')}).catch(()=>{});if(app)await app.close().catch(()=>{});process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'wheel-test-results.json'),JSON.stringify({date:new Date().toISOString(),version:'1.0.1',results,errors},null,2));console.log(results.filter(x=>x.status==='PASS').length+' wheel checks passed');}})();
