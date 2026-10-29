const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const find=m=>require.resolve(m);
const asar=require(find('@electron/asar')),ResEdit=require(find('resedit'));
(async()=>{
 const electronDist=process.env.ELECTRON_DIST||path.join(path.dirname(find('electron')),'dist');
 const release=path.join(root,'release','纸间-1.0.0-Windows-x64');
 await fs.mkdir(release,{recursive:true});await fs.cp(electronDist,release,{recursive:true});
 const staging=path.join(root,'build','app');await fs.mkdir(staging,{recursive:true});
 for(const file of ['main.cjs','preload.cjs','index.html','renderer.js','formats.js','styles.css','package.json','LICENSE','README.txt'])await fs.copyFile(path.join(root,file),path.join(staging,file));
 for(const d of ['samples','assets','third-party'])await fs.cp(path.join(root,d),path.join(staging,d),{recursive:true});
 const v=path.join(staging,'vendor','foliate-js');await fs.mkdir(path.join(v,'vendor'),{recursive:true});
 for(const f of await fs.readdir(path.join(root,'vendor','foliate-js'))){if(f.endsWith('.js')||f==='LICENSE')await fs.copyFile(path.join(root,'vendor','foliate-js',f),path.join(v,f));}
 for(const f of ['zip.js','fflate.js'])await fs.copyFile(path.join(root,'vendor','foliate-js','vendor',f),path.join(v,'vendor',f));
 await asar.createPackage(staging,path.join(release,'resources','app.asar'));
 const exe=ResEdit.NtExecutable.from(await fs.readFile(path.join(release,'electron.exe')),{ignoreCert:true});const res=ResEdit.NtExecutableResource.from(exe);
 const ico=ResEdit.Data.IconFile.from(await fs.readFile(path.join(root,'assets','icon.ico')));
 ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries,1,1033,ico.icons.map(i=>i.data));
 const vi=ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];if(vi){vi.setFileVersion(1,0,0,0,1033);vi.setProductVersion(1,0,0,0,1033);vi.setStringValues({lang:1033,codepage:1200},{CompanyName:'纸间',FileDescription:'纸间 · 本地电子书阅读器',ProductName:'纸间',InternalName:'Zhijian',OriginalFilename:'纸间.exe',LegalCopyright:'Copyright © 2026 纸间'});vi.outputToResourceEntries(res.entries);}
 res.outputResource(exe);await fs.writeFile(path.join(release,'纸间.exe'),Buffer.from(exe.generate()));await fs.unlink(path.join(release,'electron.exe'));
 await fs.copyFile(path.join(root,'README.txt'),path.join(release,'开始阅读.txt'));await fs.cp(path.join(root,'third-party'),path.join(release,'third-party'),{recursive:true});
 console.log(release);
})().catch(e=>{console.error(e);process.exitCode=1;});
