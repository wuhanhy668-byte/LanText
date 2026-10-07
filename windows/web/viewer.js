"use strict";
const el=id=>document.getElementById(id);
let generation=0, controller=null, pairCode="", revision="", wake=null;
const bytes=new Uint8Array(16); crypto.getRandomValues(bytes);
const clientID=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function state(message){el("status").textContent=message;}
async function keepAwake(){
 if(!window.isSecureContext || !navigator.wakeLock){el("wake").textContent="如需常亮：在 iPad「设置 → 显示与亮度 → 自动锁定」选择「永不」。局域网 HTTP 页面无法调用系统常亮权限。";return;}
 try{if(!wake && pairCode && !document.hidden){wake=await navigator.wakeLock.request("screen");wake.addEventListener("release",()=>{wake=null;});el("wake").textContent="已请求保持屏幕常亮。";}}catch{el("wake").textContent="未能保持常亮，请在 iPad 设置中将自动锁定设为「永不」。";}
}
function cancel(){generation++;if(controller)controller.abort();controller=null;}
async function sync(token){
 let retry=1000;
 while(token===generation && pairCode){
  if(document.hidden){await delay(500);continue;}
  const request=new AbortController();controller=request;
  const timeout=setTimeout(()=>request.abort(),30000);
  try{
   const response=await fetch("/v1/text"+(revision?"?since="+encodeURIComponent(revision):""),{headers:{"X-Pairing-Code":pairCode,"X-Client-ID":clientID},cache:"no-store",signal:request.signal});
   if(token!==generation)return;
   if(response.status===401){pairCode="";state("配对码错误或已更换，请重新输入");if(wake)await wake.release();return;}
   if(response.status===429){state("配对尝试过多，60 秒后重试");await delay(60000);continue;}
   if(!response.ok)throw new Error("connection");
   const snapshot=await response.json();if(token!==generation)return;
   el("text").textContent=snapshot.text;revision=snapshot.revision;retry=1000;state("已连接 · 实时同步");keepAwake();
  }catch{
   if(token!==generation)return;
   revision="";state("连接中断 · 正在自动重连");await delay(retry);retry=Math.min(retry*2,8000);
  }finally{clearTimeout(timeout);if(controller===request)controller=null;}
 }
}
el("pair").addEventListener("submit",event=>{event.preventDefault();cancel();pairCode=el("code").value;revision="";state("正在连接…");sync(generation);});
el("disconnect").addEventListener("click",()=>{cancel();pairCode="";el("code").value="";el("text").textContent="";state("已断开");if(wake)wake.release();});
function size(){el("text").style.fontSize=el("size").value+"px";el("sizeValue").value=el("size").value;try{localStorage.setItem("LanTextFontSize",el("size").value);}catch{}}
try{const saved=Number(localStorage.getItem("LanTextFontSize"));if(saved>=18&&saved<=160)el("size").value=saved;}catch{}size();el("size").addEventListener("input",size);
el("full").addEventListener("click",async()=>{document.body.classList.add("presentation");el("exit").hidden=false;try{if(document.body.requestFullscreen)await document.body.requestFullscreen();}catch{}keepAwake();});
function exit(){document.body.classList.remove("presentation");el("exit").hidden=true;}
el("exit").addEventListener("click",async()=>{if(document.fullscreenElement)await document.exitFullscreen();exit();});
document.addEventListener("fullscreenchange",()=>{if(!document.fullscreenElement)exit();});
document.addEventListener("visibilitychange",()=>{if(!document.hidden && pairCode){cancel();revision="";sync(generation);keepAwake();}});
keepAwake();
