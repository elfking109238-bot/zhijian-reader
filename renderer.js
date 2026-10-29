import './vendor/foliate-js/view.js';
import {parseBook,metadataText} from './formats.js';
import {WheelGesture} from './wheel.mjs';
const $=id=>document.getElementById(id);
const icons={books:'M3 4h6v16H3z M9 5h5v15H9 M15 5l4-1 4 15-4 1z',clock:'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',bookmark:'M6 3h12v18l-6-4-6 4z',bookmarks:'M8 7h12v15l-6-4-6 4z M4 18V3h12',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',back:'M15 5l-7 7 7 7',list:'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',focus:'M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5',arrow:'M5 12h14 M13 6l6 6-6 6'};
function icon(name){const el=document.createElementNS('http://www.w3.org/2000/svg','svg');el.setAttribute('viewBox','0 0 24 24');const p=document.createElementNS(el.namespaceURI,'path');p.setAttribute('d',icons[name]||icons.books);el.append(p);return el;}
document.querySelectorAll('[data-icon]').forEach(el=>el.append(icon(el.dataset.icon)));
let library=[],settings={},filter='all',view=null,current=null,location=null,loading=false,toastTimer,saveTimer,restoreID;
let saveChain=Promise.resolve();
const wheelGesture=new WheelGesture();let wheelBusy=false,wheelEpoch=0;
function resetWheel(){wheelGesture.reset();wheelBusy=false;wheelEpoch++;}
function handleReadingWheel(event){
 if(!view||loading||settings.flow!=='paginated'||$('reader').hidden||$('messageDialog').open)return;
 if(['tocPanel','bookmarksPanel','settingsPanel'].some(id=>!$(id).hidden))return;
 const target=event.target?.nodeType===1?event.target:event.target?.parentElement;
 if(target?.closest('input,select,textarea,button,[contenteditable="true"]'))return;
 // Book-internal scroll boxes retain their own scrolling behavior.
 for(let el=target;el&&el!==el.ownerDocument.body;el=el.parentElement){
  const style=el.ownerDocument.defaultView.getComputedStyle(el);
  if(/auto|scroll/.test(style.overflowY)&&el.scrollHeight>el.clientHeight+2)return;
 }
 const direction=wheelGesture.consume(event);
 if(direction===null)return;
 event.preventDefault();
 if(!direction||wheelBusy)return;
 const reader=view,epoch=wheelEpoch;wheelBusy=true;
 Promise.resolve().then(()=>direction>0?reader.next():reader.prev()).catch(e=>toast('翻页失败：'+e.message)).finally(()=>{if(epoch===wheelEpoch)wheelBusy=false;});
}
const palettes=['#627b70','#b59d79','#53677d','#9d7970','#7b8767','#8c808f'];
function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
function busy(s){$('busyText').textContent=s||'';$('busy').hidden=!s;}
function dialog(title,body,actions=[{label:'知道了'}]){
 $('dialogTitle').textContent=title;$('dialogBody').replaceChildren();if(typeof body==='string')$('dialogBody').textContent=body;else $('dialogBody').append(body);
 $('dialogActions').replaceChildren();for(const [i,a]of actions.entries()){const b=document.createElement('button');b.textContent=a.label;if(i===actions.length-1)b.className='primary';b.onclick=()=>{$('messageDialog').close();a.action?.();};$('dialogActions').append(b);}$('messageDialog').showModal();
}
function coverFor(book,small=false){
 const cover=document.createElement('div');cover.className='cover';
 if(book.cover){const img=new Image();img.src=book.cover;img.alt='';cover.append(img);}
 else{cover.classList.add('generated');const index=parseInt(book.id?.slice(0,4)||'0',16)%palettes.length;cover.style.background=palettes[index];for(const [cls,txt]of [['cover-kicker','ZHIJIAN · READING'],['cover-title',book.title.slice(0,12)],['cover-author',book.author==='未知作者'?'纸间藏书':book.author.slice(0,12)]]){const e=document.createElement('span');e.className=cls;e.textContent=txt;cover.append(e);}const orbit=document.createElement('div');orbit.className='cover-orbit';cover.append(orbit);}
 if(small){cover.classList.add('continue-cover');cover.querySelector('.cover-kicker')?.remove();cover.querySelector('.cover-author')?.remove();const title=cover.querySelector('.cover-title');if(title){title.style.fontSize='11px';title.style.letterSpacing='2px';}cover.style.padding='10px';}
 return cover;
}
function renderShelf(){
 $('bookCount').textContent=library.length;$('shelfTitle').textContent={all:'我的书架',recent:'最近阅读',bookmarked:'有书签的书'}[filter];
 const q=$('search').value.trim().toLowerCase();let list=library.filter(b=>(filter!=='recent'||b.lastRead)&&(filter!=='bookmarked'||b.bookmarks?.length)&&(!q||(b.title+' '+b.author).toLowerCase().includes(q)));
 list.sort((a,b)=>$('sort').value==='title'?a.title.localeCompare(b.title,'zh-CN'):$('sort').value==='read'?(b.lastRead||0)-(a.lastRead||0):b.added-a.added);
 $('grid').replaceChildren();$('resultCount').textContent=`${list.length} 本书`;$('empty').hidden=!!list.length;
 $('empty').querySelector('h2').textContent=q?'没有找到这本书':filter==='recent'?'打开一本书，开始你的阅读旅程。':filter==='bookmarked'?'把喜欢的那一页留住。':'下一段故事，从这里开始。';
 $('sampleButton').hidden=library.length>0;$('empty').querySelector('p').textContent=q?'试试其他书名或作者':filter==='bookmarked'?'阅读时，点击右上角书签即可添加':'将书籍拖到窗口，或点击「导入书籍」';
 for(const b of list){const card=document.createElement('article');card.className='book-card';const open=document.createElement('button');open.className='book-open';open.setAttribute('aria-label',`阅读 ${b.title}`);open.append(coverFor(b));const name=document.createElement('div');name.className='book-name';name.textContent=b.title;name.title=b.title;const author=document.createElement('div');author.className='book-author';author.textContent=b.author;const detail=document.createElement('div');detail.className='book-detail';const badge=document.createElement('span');badge.className='format-badge';badge.textContent=b.format;const progress=document.createElement('span');progress.textContent=b.lastRead?`已读 ${Math.round(b.progress*100)}%`:'未读';detail.append(badge,progress);open.append(name,author,detail);open.onclick=()=>openBook(b);const menu=document.createElement('button');menu.className='book-menu';menu.textContent='⋯';menu.setAttribute('aria-label',`${b.title} 的书籍菜单`);menu.onclick=()=>bookMenu(b);card.append(open,menu);$('grid').append(card);}
 const latest=library.filter(b=>b.lastRead).sort((a,b)=>b.lastRead-a.lastRead)[0];$('continueSection').hidden=!latest||filter!=='all'||!!q;
 if(latest){const c=$('continueCard');c.replaceChildren(coverFor(latest,true));const info=document.createElement('div');info.className='continue-info';const title=document.createElement('strong');title.textContent=latest.title;const author=document.createElement('small');author.textContent=latest.author;const bar=document.createElement('div');bar.className='continue-progress';const fill=document.createElement('div');fill.style.width=(latest.progress*100)+'%';bar.append(fill);const meta=document.createElement('span');meta.className='continue-meta';meta.textContent=`已读 ${Math.round(latest.progress*100)}% · 接着上次的故事`;info.append(title,author,bar,meta);const cta=document.createElement('span');cta.className='continue-cta';cta.append('继续阅读',icon('arrow'));c.append(info,cta);c.onclick=()=>openBook(latest);}
}
async function getMetadata(book,file){
 let cover=null;try{const b=await book.getCover?.();if(b&&b.size<2*1024*1024&&/^image\/(png|jpeg|webp|gif)$/.test(b.type))cover=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(b);});}catch{}
 return {title:metadataText(book.metadata?.title)||file.name.replace(/\.[^.]+$/,''),author:metadataText(book.metadata?.author)||'未知作者',cover,encoding:book.encoding};
}
async function importFiles(files){
 if(loading)return;loading=true;let imported=0,dupes=0;const failures=[];
 try{for(const file of files){busy(`正在导入 · ${file.name}`);let book;try{book=await parseBook(file);const readable=book.sections.find(s=>s.load&&s.linear!=='no');await readable.load();const metadata=await getMetadata(book,file);const r=await window.paper.import({name:file.name,bytes:new Uint8Array(await file.arrayBuffer()),metadata});if(r.duplicate)dupes++;else{library.push(r.book);imported++;}}catch(e){failures.push(`${file.name}\n${e.message}`);}finally{book?.destroy?.();}}renderShelf();}
 finally{busy(null);loading=false;$('fileInput').value='';}
 if(failures.length)dialog('部分书籍未能导入',`${imported} 本已加入书架${dupes?`，${dupes} 本重复书籍已跳过`:''}。\n\n`+failures.join('\n\n'));else toast(`${imported?`已导入 ${imported} 本书`:''}${imported&&dupes?' · ':''}${dupes?`${dupes} 本书已在书架中`:''}`||'没有选择书籍');
}
function closePanels(){resetWheel();for(const id of ['tocPanel','bookmarksPanel','settingsPanel'])$(id).hidden=true;}
function togglePanel(id){const hidden=$(id).hidden;closePanels();$(id).hidden=!hidden;}
function getCSS(){const style=getComputedStyle(document.body);const bg=style.getPropertyValue('--reader-bg').trim();const fg=style.getPropertyValue('--reader-fg').trim();const font=settings.font==='sans'?'"Microsoft YaHei",sans-serif':'"SimSun","Songti SC",serif';return `html,body { background:${bg}!important;color:${fg}!important;font-family:${font}!important;font-size:${settings.size}px!important; } body {padding:0!important;} p,li,blockquote,dd {line-height:${settings.line}!important;font-family:inherit!important;font-size:1em!important;text-align:justify;letter-spacing:.025em;overflow-wrap:break-word;} p {margin:.6em 0 1em!important;} h1,h2,h3,h4,h5,h6 {font-family:inherit!important;font-weight:normal!important;line-height:1.6!important;color:inherit!important;} h1{font-size:1.6em!important;margin:1.1em 0 1.5em!important;text-align:center;} h2{font-size:1.35em!important} img,svg{max-width:100%!important;max-height:75vh!important;object-fit:contain;} a{color:inherit!important;} pre{white-space:pre-wrap!important;} *{animation:none!important;transition:none!important;}`;}
function applySettings(persist=true){resetWheel();document.querySelector('.key-hint').textContent=settings.flow==='scrolled'?'上下滚动':'滚轮 / ← → 翻页';document.body.dataset.theme=settings.theme;$('fontSize').value=settings.size;$('lineHeight').value=settings.line;$('sizeValue').textContent=settings.size;$('lineValue').textContent=Number(settings.line).toFixed(1);for(const key of ['theme','font','flow'])document.querySelectorAll(`[data-${key}]`).forEach(el=>el.classList.toggle('selected',el.dataset[key]===settings[key]));if(view){view.renderer.setAttribute('flow',settings.flow);view.renderer.setStyles?.(getCSS());}if(persist)window.paper.settings(settings).catch(e=>toast('设置保存失败：'+e.message));}
function saveProgress(){if(!current||!location)return Promise.resolve();const b=current,l={cfi:location.cfi,fraction:location.fraction||0,encoding:b.encoding};b.cfi=l.cfi;b.progress=l.fraction;b.lastRead=Date.now();saveChain=saveChain.catch(()=>{}).then(()=>window.paper.progress(b.id,l)).catch(e=>toast('进度保存失败：'+e.message));return saveChain;}
async function openBook(b,encoding){
 if(loading)return;loading=true;busy('正在打开 · '+b.title);let parsed;
 try{
  if(view){await saveProgress();view.close();view.remove();view=null;}
  const bytes=await window.paper.read(b.id);parsed=await parseBook(new File([bytes],b.name),{encoding:encoding||b.encoding||undefined});
  current=b;location=null;view=document.createElement('foliate-view');$('viewHost').replaceChildren(view);$('reader').hidden=false;$('library').hidden=true;closePanels();
  $('readerTitle').textContent=b.title;$('readerAuthor').textContent=b.author;
  await view.open(parsed);view.renderer.setAttribute('max-column-count','1');view.renderer.setAttribute('max-inline-size','720px');view.renderer.setAttribute('margin','28px');view.renderer.setAttribute('gap','5%');
  view.addEventListener('external-link',e=>{e.preventDefault();toast('离线阅读模式：外部链接未打开');});
  view.addEventListener('relocate',e=>{location=e.detail;$('progress').value=location.fraction||0;$('percent').textContent=Math.round((location.fraction||0)*100)+'%';$('chapterLabel').textContent=location.tocItem?.label||b.title;updateBookmark();document.querySelectorAll('.toc-entry[data-href]').forEach(el=>el.classList.toggle('current',el.dataset.href===location.tocItem?.href));clearTimeout(saveTimer);saveTimer=setTimeout(saveProgress,250);});
  view.addEventListener('load',e=>{e.detail.doc.addEventListener('keydown',handleKey);e.detail.doc.addEventListener('wheel',handleReadingWheel,{capture:true,passive:false});});
  renderTOC(parsed);applySettings(false);await view.init({lastLocation:encoding?null:b.cfi});await saveProgress();renderShelf();
 }catch(e){parsed?.destroy?.();if(view){view.close();view.remove();view=null;}current=null;$('reader').hidden=true;$('library').hidden=false;dialog('暂时无法打开',e.message);}
 finally{loading=false;busy(null);}
}
async function backToShelf(){if(loading)return;clearTimeout(saveTimer);await saveProgress();await window.paper.close();view?.close();view?.remove();view=null;current=null;location=null;$('reader').hidden=true;$('library').hidden=false;$('reader').classList.remove('focus');closePanels();renderShelf();}
function renderTOC(book){$('tocList').replaceChildren();function add(items,depth=0){for(const item of items||[]){const button=document.createElement('button');button.className='toc-entry';button.style.paddingLeft=(12+depth*14)+'px';button.textContent=item.label||'未命名章节';if(item.href!=null){button.dataset.href=String(item.href);button.onclick=async()=>{await view.goTo(item.href);closePanels();};}$('tocList').append(button);add(item.subitems,depth+1);}}add(book.toc);if(!$('tocList').children.length){book.sections.forEach((s,i)=>{if(s.linear==='no')return;const b=document.createElement('button');b.className='toc-entry';b.textContent=`第 ${i+1} 节`;b.onclick=()=>{view.goTo(i);closePanels();};$('tocList').append(b);});}}
function updateBookmark(){const exists=current?.bookmarks?.some(x=>x.cfi===location?.cfi);$('bookmarkButton').classList.toggle('selected',!!exists);$('bookmarkButton').setAttribute('aria-label',exists?'移除此页书签':'添加书签');}
async function toggleBookmark(){if(!current||!location)return;const arr=current.bookmarks||=[];const i=arr.findIndex(x=>x.cfi===location.cfi);if(i>=0)arr.splice(i,1);else arr.push({cfi:location.cfi,label:location.tocItem?.label||$('chapterLabel').textContent,fraction:location.fraction||0,date:Date.now()});try{await window.paper.bookmarks(current.id,arr);updateBookmark();renderBookmarks();toast(i>=0?'已移除此页书签':'这一页，替你记住了。');}catch(e){toast('书签保存失败：'+e.message);}}
function renderBookmarks(){const list=$('bookmarksList');list.replaceChildren();if(!current?.bookmarks?.length){const p=document.createElement('p');p.className='settings-note';p.textContent='还没有书签。点击顶部的书签图标，留住喜欢的这一页。';list.append(p);}for(const mark of current?.bookmarks||[]){const row=document.createElement('div');row.className='bookmark-row';const b=document.createElement('button');b.className='toc-entry';b.textContent=`${mark.label} · ${Math.round(mark.fraction*100)}%`;b.onclick=()=>{view.goTo(mark.cfi);closePanels();};const remove=document.createElement('button');remove.className='bookmark-remove';remove.textContent='×';remove.setAttribute('aria-label','移除书签');remove.onclick=async()=>{current.bookmarks=current.bookmarks.filter(m=>m!==mark);await window.paper.bookmarks(current.id,current.bookmarks);renderBookmarks();updateBookmark();};row.append(b,remove);list.append(row);}}
function bookMenu(b){const body=document.createElement('div');body.textContent=`${b.title}\n${b.author} · ${b.format}\n导入后保存在本地，移出书架不会改动你的原文件。`;const actions=[{label:'取消'},{label:'移出书架',action:()=>dialog('移出这本书？','会删除书库中的副本和阅读记录。你原来导入的文件完整保留。',[{label:'保留'},{label:'确认移出',action:async()=>{await window.paper.remove(b.id);library=library.filter(x=>x.id!==b.id);renderShelf();toast('已移出书架');}}])}];if(b.format==='TXT'){const select=document.createElement('select');select.className='dialog-select';for(const [v,l]of [['utf-8','UTF-8'],['gb18030','简体中文 GB18030 / GBK'],['big5','繁体中文 Big5'],['utf-16le','UTF-16 LE'],['utf-16be','UTF-16 BE']]){const o=document.createElement('option');o.value=v;o.textContent=l;select.append(o);}select.value=b.encoding||'utf-8';body.append(select);actions.push({label:'按此编码阅读',action:()=>{b.encoding=select.value;openBook(b,select.value);}});}dialog('书籍信息',body,actions);}
function handleKey(e){if(/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName))return;if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault();if(!view)$('search').focus();return;}if(!view)return;if(e.key==='Escape'){e.preventDefault();if(!['tocPanel','bookmarksPanel','settingsPanel'].every(id=>$(id).hidden))closePanels();else if($('reader').classList.contains('focus'))$('reader').classList.remove('focus');else backToShelf();}if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();view.next();}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();view.prev();}if(e.key.toLowerCase()==='f')$('reader').classList.toggle('focus');}
$('importButton').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>importFiles([...e.target.files]);$('search').oninput=renderShelf;$('sort').onchange=renderShelf;
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderShelf();});
$('back').onclick=backToShelf;$('prev').onclick=()=>view?.prev();$('next').onclick=()=>view?.next();$('tocButton').onclick=()=>togglePanel('tocPanel');$('bookmarkButton').onclick=toggleBookmark;$('bookmarksButton').onclick=()=>{renderBookmarks();togglePanel('bookmarksPanel');};$('settingsButton').onclick=()=>togglePanel('settingsPanel');$('focusButton').onclick=()=>$('reader').classList.toggle('focus');document.querySelectorAll('.close-panel').forEach(b=>b.onclick=closePanels);
$('progress').oninput=e=>view?.goToFraction(Number(e.target.value));
for(const key of ['theme','font','flow'])document.querySelectorAll(`[data-${key}]`).forEach(b=>b.onclick=()=>{settings[key]=b.dataset[key];applySettings();});
$('fontSize').oninput=e=>{settings.size=Number(e.target.value);applySettings();};$('lineHeight').oninput=e=>{settings.line=Number(e.target.value);applySettings();};
document.addEventListener('keydown',handleKey);window.addEventListener('blur',()=>saveProgress());
document.querySelector('.reading-stage').addEventListener('wheel',handleReadingWheel,{capture:true,passive:false});
window.paper.onFlush(()=>saveProgress());
let dragDepth=0;document.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;$('dropOverlay').hidden=false;}});document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('dragleave',e=>{e.preventDefault();dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('dropOverlay').hidden=true;});document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('dropOverlay').hidden=true;importFiles([...e.dataTransfer.files]);});
$('aboutButton').onclick=()=>dialog('在纸间，慢慢读',`支持 TXT、EPUB、无 DRM 的 MOBI / AZW3。\n导入：点击按钮，或将文件拖到窗口。\n阅读：滚轮向下下一页，向上上一页；← → / PageUp PageDown 也可翻页。F 专注，Esc 返回。连续滚动手势只翻一页，停顿后再滚可继续，反向可回翻。\nTXT 自动识别 UTF-8、UTF-16 BOM、GB18030；乱码时可在书籍菜单手动选择编码。\n设置和书签会自动保存；关闭应用后，再次启动可回到上次阅读位置。\n原文件保留。书籍副本、进度和书签都位于程序旁的「纸间数据」目录。迁移或备份时请连同此目录一起复制。\n\n本应用不联网、不上传书籍，不执行书内脚本。单本上限 100 MB；TXT 上限 20 MB；EPUB 解压总量上限 128 MB、单条目 16 MB。不支持 DRM、KFX 和扫描 PDF。\n原创示例仅用于试读，可自由移出书架。`);
$('sampleButton').onclick=async()=>{const files=[];for(const [n,label] of [['shanhai.epub','山海来信.epub'],['slow.txt','慢读时光.txt'],['stars.mobi','星河手记.mobi']])files.push(new File([await(await fetch('samples/'+n)).blob()],label));await importFiles(files);};
async function init(){const state=await window.paper.load();library=state.books;settings=state.settings;restoreID=state.lastBook;applySettings(false);renderShelf();if(state.recoveryWarning)dialog('书库索引需要恢复','已保留损坏索引的恢复副本，原书文件未改动。请重新导入书籍。');if(restoreID){const b=library.find(b=>b.id===restoreID);if(b)await openBook(b);}}
init().catch(e=>dialog('启动遇到了问题',e.message));
