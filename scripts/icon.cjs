const fs=require('node:fs'),path=require('node:path');
const {createCanvas}=require('@napi-rs/canvas');
const c=createCanvas(256,256),x=c.getContext('2d');
x.fillStyle='#477766';x.beginPath();x.roundRect(8,8,240,240,53);x.fill();
x.strokeStyle='#f9f4e7';x.lineWidth=9;x.lineJoin='round';x.lineCap='round';
x.beginPath();x.moveTo(128,78);x.bezierCurveTo(101,61,77,62,55,70);x.lineTo(55,177);x.bezierCurveTo(80,169,102,174,128,188);x.bezierCurveTo(154,174,176,169,201,177);x.lineTo(201,70);x.bezierCurveTo(177,62,154,61,128,78);x.lineTo(128,188);x.stroke();
x.lineWidth=4;x.globalAlpha=.5;for(const y of [97,119,141]){x.beginPath();x.moveTo(75,y);x.quadraticCurveTo(92,y-3,109,y+5);x.stroke();x.beginPath();x.moveTo(147,y+5);x.quadraticCurveTo(166,y-3,182,y);x.stroke();}
fs.mkdirSync(path.join(__dirname,'..','assets'),{recursive:true});const png=c.toBuffer('image/png');fs.writeFileSync(path.join(__dirname,'..','assets','icon.png'),png);const hdr=Buffer.alloc(22);hdr.writeUInt16LE(1,2);hdr.writeUInt16LE(1,4);hdr.writeUInt16LE(1,10);hdr.writeUInt16LE(32,12);hdr.writeUInt32LE(png.length,14);hdr.writeUInt32LE(22,18);fs.writeFileSync(path.join(__dirname,'..','assets','icon.ico'),Buffer.concat([hdr,png]));
