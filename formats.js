import {EPUB} from './vendor/foliate-js/epub.js';
import {MOBI} from './vendor/foliate-js/mobi.js';
import {unzlibSync} from './vendor/foliate-js/vendor/fflate.js';
import {configure,ZipReader,BlobReader} from './vendor/foliate-js/vendor/zip.js';
const MiB=1024*1024;
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class BookError extends Error{}
export function decodeText(bytes,forced){
 let encoding=forced;
 if(!encoding){
  if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';
  else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';
  else {try {new TextDecoder('utf-8',{fatal:true}).decode(bytes);encoding='utf-8';} catch {encoding='gb18030';}}
 }
 let content=new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 if(content.includes('\0'))throw new BookError('TXT 包含二进制内容，或编码不正确。请在书架的书籍菜单中选择正确编码。');
 if(!content.trim())throw new BookError('这本 TXT 没有可阅读的文字。');
 return {content,encoding};
}
function txtBook(bytes,name,forced){
 if(bytes.length>20*MiB)throw new BookError('TXT 超过 20 MB，请先拆分为较小的文件。');
 const {content,encoding}=decodeText(bytes,forced);const parts=[];let lines=[];let title='开篇';let length=0;
 const flush=()=>{if(lines.length){parts.push({title,text:lines.join('\n')});lines=[];length=0;}};
 for(const line of content.split('\n')){
  const h=line.trim();
  if(/^(第[零〇一二三四五六七八九十百千万两\d]{1,12}[章节卷部回篇].{0,45}|[序前后终尾]言|序章|楔子|尾声|Chapter\s+\d+.{0,45})$/i.test(h)){flush();title=h;}
  // Split very long chapters to keep layout responsive, without losing text.
  for(let start=0;start<line.length||start===0;start+=24000){const chunk=line.slice(start,start+24000);lines.push(chunk);length+=chunk.length;if(length>28000){flush();title=h.length<55?h:title+' · 续';}}
 }
 flush();if(parts.length>8000)throw new BookError('TXT 章节过多，暂不支持。');
 const urls=new Map();
 const html=i=>`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><h1>${escape(parts[i].title)}</h1>${parts[i].text.split('\n').map(l=>l.trim()?`<p>${escape(l)}</p>`:'').join('')}</body></html>`;
 const book={metadata:{title:name.replace(/\.[^.]+$/,''),language:'zh-CN'},encoding,sections:parts.map((p,i)=>({id:String(i),size:p.text.length*2,load:()=>{if(!urls.has(i))urls.set(i,URL.createObjectURL(new Blob([html(i)],{type:'text/html'})));return urls.get(i);},createDocument:async()=>new DOMParser().parseFromString(html(i),'text/html')})),toc:parts.map((p,i)=>({label:p.title,href:String(i)})),splitTOCHref:href=>[String(href),null],getTOCFragment:doc=>doc.documentElement,resolveHref:href=>({index:Number(href)}),destroy:()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();}};
 return book;
}
async function epubBook(file){
 configure({useWebWorkers:false});const zip=new ZipReader(new BlobReader(file));const entries=await zip.getEntries();
 if(entries.length>8000)throw new BookError('EPUB 文件条目过多，已停止导入。');
 let total=0;const names=new Set();
 for(const e of entries){
  if(e.filename.includes('\\')||e.filename.startsWith('/')||e.filename.split('/').includes('..')||/^[a-z]:/i.test(e.filename)||names.has(e.filename))throw new BookError('EPUB 包含不安全或重复路径，已停止导入。');
  names.add(e.filename);total+=e.uncompressedSize;
  if(e.encrypted)throw new BookError('此 EPUB 已加密或带有 DRM。请使用合法取得的无 DRM 版本。');
  if(e.uncompressedSize>16*MiB||total>128*MiB||e.uncompressedSize>MiB&&e.uncompressedSize/Math.max(1,e.compressedSize)>200)throw new BookError('EPUB 解压体积或压缩比超出安全限制。');
 }
 const map=new Map(entries.map(e=>[e.filename,e]));
 const read=async name=>{
  const entry=map.get(name);if(!entry)return null;
  let count=0;const chunks=[];
  await entry.getData(new WritableStream({write(chunk){count+=chunk.length;if(count>16*MiB||count>entry.uncompressedSize)throw new BookError('EPUB 实际解压体积超出限制。');chunks.push(chunk);}}),{checkSignature:true});
  return new Blob(chunks);
 };
 const enc=await read('META-INF/encryption.xml');
 if(enc){const doc=new DOMParser().parseFromString(await enc.text(),'application/xml');for(const el of doc.getElementsByTagNameNS('*','EncryptionMethod')){if(!['http://www.idpf.org/2008/embedding','http://ns.adobe.com/pdf/enc#RC'].includes(el.getAttribute('Algorithm')))throw new BookError('此 EPUB 带有 DRM 或不支持的加密。请使用无 DRM 版本。');}}
 const book=await new EPUB({loadText:async n=>(await read(n))?.text()??null,loadBlob:async(n,type)=>{const b=await read(n);return b?new Blob([b],{type}):null;},getSize:n=>map.get(n)?.uncompressedSize??0}).init();
 const destroy=book.destroy?.bind(book);book.destroy=()=>{destroy?.();zip.close();};return book;
}
function checkMobi(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);const str=(s,n)=>new TextDecoder().decode(bytes.subarray(s,s+n));
 if(bytes.length<86||str(60,8)!=='BOOKMOBI')throw new BookError('不是有效的 MOBI 文件，或文件已经损坏。');
 const n=v.getUint16(76);if(n<2||78+n*8>bytes.length||n>20000)throw new BookError('MOBI 记录表损坏或超出限制。');
 let prev=78+n*8;
 for(let i=0;i<n;i++){
  const offset=v.getUint32(78+i*8);if(offset<prev||offset>=bytes.length)throw new BookError('MOBI 记录偏移损坏。');prev=offset;
  if(offset+280<=bytes.length&&str(offset+16,4)==='MOBI'){
   if(v.getUint16(offset+12)!==0)throw new BookError('此 MOBI 带有 DRM 加密，纸间无法阅读。请使用合法取得的无 DRM 版本。');
   if(![1,2,17480].includes(v.getUint16(offset)))throw new BookError('此 MOBI 压缩变体暂不支持。');
   if(v.getUint32(offset+4)>64*MiB)throw new BookError('MOBI 解压文字体积超出限制。');
   if(![1252,65001].includes(v.getUint32(offset+28)))throw new BookError('此 MOBI 字符编码变体暂不支持。');
   if(v.getUint32(offset+36)>8)throw new BookError('此 MOBI 版本暂不支持。');
  }
 }
}
function sanitizeDocument(doc){
 doc.querySelectorAll('script,iframe,frame,frameset,object,embed,form,input,button,textarea,select,base,meta[http-equiv],link[rel="import"],audio,video').forEach(x=>x.remove());
 for(const el of doc.querySelectorAll('*'))for(const attr of [...el.attributes]){
  if(/^on/i.test(attr.name)||['srcdoc','formaction','action','ping','srcset'].includes(attr.name.toLowerCase()))el.removeAttribute(attr.name);
  else if(['href','src','xlink:href','poster'].includes(attr.name.toLowerCase())&&/^\s*(javascript:|vbscript:|file:|https?:|\/\/|data:text\/html)/i.test(attr.value))el.removeAttribute(attr.name);
 }
 const head=doc.head||doc.querySelector('head');if(head){const csp=doc.createElement('meta');csp.setAttribute('http-equiv','Content-Security-Policy');csp.setAttribute('content',"default-src 'none'; script-src 'none'; style-src 'unsafe-inline' blob:; img-src blob: data:; font-src blob: data:; connect-src 'none'; base-uri 'none'; form-action 'none'");head.prepend(csp);}
 return doc;
}
function protectBook(book){
 const urls=new Map();
 for(const s of book.sections){if(!s.load)continue;const original=s.load.bind(s);const unload=s.unload?.bind(s);
  s.load=async()=>{if(urls.has(s))return urls.get(s);const src=await original();if(!src?.startsWith('blob:'))throw new BookError('书籍章节地址无效。');const res=await fetch(src);const blob=await res.blob();if(blob.size>16*MiB)throw new BookError('章节过大，无法安全打开。');const type=blob.type==='application/xhtml+xml'?'application/xhtml+xml':'text/html';const doc=new DOMParser().parseFromString(await blob.text(),type);sanitizeDocument(doc);const safe=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)],{type}));urls.set(s,safe);return safe;};
  s.unload=()=>{URL.revokeObjectURL(urls.get(s));urls.delete(s);unload?.();};
 }
 const destroy=book.destroy?.bind(book);book.destroy=()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();destroy?.();};
 return book;
}
export async function parseBook(file,{encoding}={}){
 if(!file.size||file.size>100*MiB)throw new BookError('文件为空或超过 100 MB。');
 const ext=file.name.split('.').pop().toLowerCase();let book;
 try{
  if(ext==='txt')book=txtBook(new Uint8Array(await file.arrayBuffer()),file.name,encoding);
  else if(ext==='epub')book=await epubBook(file);
  else if(['mobi','azw3'].includes(ext)){checkMobi(new Uint8Array(await file.arrayBuffer()));book=await new MOBI({unzlib:unzlibSync}).open(file);}
  else throw new BookError('支持 TXT、EPUB、无 DRM 的 MOBI / AZW3 文件。');
  if(!book.sections?.length)throw new BookError('书籍中没有可阅读的章节。');
  return protectBook(book);
 }catch(e){if(e instanceof BookError)throw e;throw new BookError(ext==='mobi'||ext==='azw3'?'MOBI 文件损坏，或使用了暂不支持的变体。':'书籍结构损坏，无法打开。'+(e.message?'（'+e.message.slice(0,120)+'）':''));}
}
export const metadataText=x=>typeof x==='string'?x:Array.isArray(x)?x.map(metadataText).join('、'):x?.name?metadataText(x.name):x?metadataText(Object.values(x)[0]):'';
