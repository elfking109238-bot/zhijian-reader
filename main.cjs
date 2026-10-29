const {app, BrowserWindow, ipcMain, protocol, session, Menu} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = __dirname;
const APP_URL = 'zhijian://app/index.html';
protocol.registerSchemesAsPrivileged([{scheme:'zhijian',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
app.setName('纸间');
app.setAppUserModelId('local.zhijian.reader');
// Portable: keep books beside the app. Tests can use an isolated writable directory.
const dataRoot = process.env.ZHIJIAN_TEST_DATA || path.join(path.dirname(app.isPackaged ? app.getPath('exe') : __filename), '纸间数据');
app.setPath('userData', path.join(dataRoot,'runtime'));
app.setPath('crashDumps', path.join(dataRoot,'runtime','crashes'));
const instanceLock=app.requestSingleInstanceLock();
if(!instanceLock)app.quit();
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
let win, state = {version:1,books:[],settings:{theme:'paper',size:21,line:1.9,font:'serif',flow:'paginated'},lastBook:null};
const validID = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
let writing = Promise.resolve();
async function persist(){
 const snapshot=JSON.stringify(state,null,2);
 writing=writing.catch(()=>{}).then(async()=>{const target=path.join(dataRoot,'library.json'); await fs.writeFile(target+'.tmp',snapshot); await fs.rename(target+'.tmp',target);});
 return writing;
}
function handle(name,fn){ipcMain.handle(name,async(e,...args)=>{
 if(!win || e.sender!==win.webContents || e.senderFrame!==win.webContents.mainFrame || e.senderFrame.url!==APP_URL) throw Error('无效请求');
 return fn(...args);
});}
const text=(x,max=300)=>String(x??'').slice(0,max);
app.whenReady().then(async()=>{
 await fs.mkdir(path.join(dataRoot,'books'),{recursive:true});
 try {const loaded=JSON.parse(await fs.readFile(path.join(dataRoot,'library.json'),'utf8')); if(loaded.version===1&&Array.isArray(loaded.books)) state={...state,...loaded};}
 catch(e){if(e.code!=='ENOENT'){await fs.copyFile(path.join(dataRoot,'library.json'),path.join(dataRoot,'library.recovery-'+Date.now()+'.json')).catch(()=>{}); state.recoveryWarning=true;}}
 const ses=session.defaultSession;
 ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
 ses.setPermissionCheckHandler(()=>false);
 ses.webRequest.onBeforeRequest((details,cb)=>cb({cancel:!['zhijian:','blob:','data:','devtools:'].includes(new URL(details.url).protocol)}));
 protocol.handle('zhijian',async req=>{
  try{
   const u=new URL(req.url); const decoded=decodeURIComponent(u.pathname);
   if(u.hostname!=='app'||decoded.includes('\\')||decoded.includes('\0'))return new Response('',{status:403});
   const rel=decoded.replace(/^\//,'');
   if(!/^(index\.html|styles\.css|renderer\.js|formats\.js|wheel\.mjs|vendor\/foliate-js\/[\w./-]+\.js|samples\/[\w.-]+)$/.test(rel)||rel.split('/').includes('..'))return new Response('',{status:403});
   const full=path.resolve(ROOT,rel);if(!full.startsWith(ROOT+path.sep))return new Response('',{status:403});
   const type=/\.m?js$/.test(rel)?'text/javascript':rel.endsWith('.css')?'text/css':rel.endsWith('.html')?'text/html':'application/octet-stream';
   return new Response(await fs.readFile(full),{headers:{'Content-Type':type,'Content-Security-Policy':"default-src 'self' blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' blob: data:; frame-src blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff'}});
  }catch{return new Response('',{status:404});}
 });
 handle('library:load',()=>({...state,dataRoot}));
 handle('book:read',async id=>{if(!validID(id)||!state.books.some(b=>b.id===id))throw Error('找不到书籍');return new Uint8Array(await fs.readFile(path.join(dataRoot,'books',id)));});
 handle('book:import',async payload=>{
  const {name,bytes,metadata}=payload||{};
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>100*1024*1024)throw Error('文件为空或超过 100 MB');
  const ext=path.extname(String(name)).toLowerCase();if(!['.txt','.epub','.mobi','.azw3'].includes(ext))throw Error('暂不支持此格式');
  const id=crypto.createHash('sha256').update(bytes).digest('hex');
  const existing=state.books.find(b=>b.id===id);if(existing)return {book:existing,duplicate:true};
  const cover=typeof metadata?.cover==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,/.test(metadata.cover)&&metadata.cover.length<3*1024*1024?metadata.cover:null;
  const book={id,name:text(name),format:ext.slice(1).toUpperCase(),title:text(metadata?.title)||text(name),author:text(metadata?.author)||'未知作者',cover,encoding:text(metadata?.encoding,30),added:Date.now(),lastRead:0,progress:0,cfi:null,bookmarks:[]};
  await fs.writeFile(path.join(dataRoot,'books',id),bytes,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
  state.books.push(book);await persist();return {book,duplicate:false};
 });
 handle('book:progress',async(id,location)=>{
  const b=state.books.find(b=>b.id===id);if(!b)throw Error('找不到书籍');
  if(typeof location.cfi==='string'&&location.cfi.length<10000)b.cfi=location.cfi;
  if(Number.isFinite(location.fraction))b.progress=Math.min(1,Math.max(0,location.fraction));
  if(['utf-8','utf-16le','utf-16be','gb18030','big5'].includes(location.encoding))b.encoding=location.encoding;
  b.lastRead=Date.now();state.lastBook=id;await persist();return true;
 });
 handle('book:bookmarks',async(id,items)=>{
  const b=state.books.find(b=>b.id===id);if(!b||!Array.isArray(items)||items.length>2000)throw Error('无法保存书签');
  b.bookmarks=items.filter(x=>typeof x.cfi==='string'&&x.cfi.length<10000).map(x=>({cfi:x.cfi,label:text(x.label),fraction:Math.max(0,Math.min(1,Number(x.fraction)||0)),date:Number(x.date)||Date.now()}));await persist();return b.bookmarks;
 });
 handle('settings:save',async s=>{
  state.settings={theme:['paper','light','dark'].includes(s.theme)?s.theme:'paper',size:Math.min(36,Math.max(14,Number(s.size)||21)),line:Math.min(2.6,Math.max(1.3,Number(s.line)||1.9)),font:['serif','sans'].includes(s.font)?s.font:'serif',flow:s.flow==='scrolled'?'scrolled':'paginated'};await persist();return state.settings;
 });
 handle('book:remove',async id=>{if(!validID(id))throw Error('无效书籍');state.books=state.books.filter(b=>b.id!==id);if(state.lastBook===id)state.lastBook=null;await persist();await fs.unlink(path.join(dataRoot,'books',id)).catch(()=>{});return true;});
 handle('reader:close',async()=>{state.lastBook=null;await persist();return true;});
 Menu.setApplicationMenu(null);
 win=new BrowserWindow({width:1280,height:880,minWidth:900,minHeight:650,show:false,title:'纸间 · 让阅读慢下来',icon:path.join(ROOT,'assets','icon.png'),backgroundColor:'#f7f7f4',webPreferences:{preload:path.join(ROOT,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false,devTools:!!process.env.ZHIJIAN_TEST_DATA}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',e=>e.preventDefault());
 win.webContents.on('will-attach-webview',e=>e.preventDefault());
 let allowClose=false;
 handle('app:flushed',async()=>{await writing;allowClose=true;win.close();});
 win.on('close',e=>{if(!allowClose){e.preventDefault();win.webContents.send('app:flush');setTimeout(()=>{if(!win.isDestroyed()){allowClose=true;win.close();}},2500);}});
 win.once('ready-to-show',()=>{win.show();});
 await win.loadURL(APP_URL);
});
app.on('window-all-closed',()=>app.quit());
process.on('uncaughtException',e=>{console.error(e);});
