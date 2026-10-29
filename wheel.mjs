// A continuous wheel / trackpad gesture produces at most one page turn.
// Re-arm after a quiet gap; a deliberate reversal starts a new gesture.
export class WheelGesture {
 constructor({threshold=48,quietGap=200,minInterval=160}={}){Object.assign(this,{threshold,quietGap,minInterval});this.reset();}
 reset(){this.direction=0;this.distance=0;this.latched=false;this.lastEvent=-Infinity;this.lastTurn=-Infinity;}
 consume(event,time=performance.now()){
  if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey){this.reset();return null;}
  const x=Number(event.deltaX)||0,y=Number(event.deltaY)||0;
  if(!Number.isFinite(y)||!y||Math.abs(x)>=Math.abs(y))return null;
  const scale=event.deltaMode===1?20:event.deltaMode===2?700:1;
  const delta=y*scale,dir=Math.sign(delta),gap=time-this.lastEvent;
  if(gap>this.quietGap||this.direction!==dir){this.direction=dir;this.distance=0;this.latched=false;}
  this.lastEvent=time;
  if(this.latched)return 0;
  this.distance+=Math.min(Math.abs(delta),this.threshold);
  if(this.distance<this.threshold||time-this.lastTurn<this.minInterval)return 0;
  this.distance=0;this.latched=true;this.lastTurn=time;
  return dir;
 }
}
