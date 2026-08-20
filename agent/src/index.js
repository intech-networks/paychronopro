import dotenv from 'dotenv';
import { probeDevice, pullBackup, pullUsers, pushUser } from './device.js';
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
const config = { apiUrl:String(process.env.PAYTIMEPRO_API_URL||'').replace(/\/$/,''), agentId:process.env.AGENT_ID||'office-main', secret:process.env.AGENT_SECRET||'', interval:Math.max(10,Number(process.env.POLL_INTERVAL_SECONDS)||15)*1000 };
if (!config.apiUrl || !config.secret) throw new Error('PAYTIMEPRO_API_URL and AGENT_SECRET are required.');
const headers = { authorization:`Bearer ${config.secret}`,'x-agent-id':config.agentId,'content-type':'application/json' };
function withTimeout(promise,milliseconds,message){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);})]).finally(()=>clearTimeout(timer));}
function errorMessage(error,fallback){return error?.message||error?.err?.message||error?.getError?.()?.err?.message||fallback;}
async function api(path, options={}) { const response=await fetch(`${config.apiUrl}/api/scheduler${path}`,{...options,headers:{...headers,...options.headers}}); if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||`Cloud API returned ${response.status}`);} return response.status===204?null:response.json(); }
async function updateDeviceStatuses() { const {devices}=await api('/agent/devices'); for (const device of devices) { const status=await probeDevice({deviceIp:device.ip,devicePort:device.port}); await api(`/agent/devices/${device.id}/status`,{method:'POST',body:JSON.stringify(status)}); } }
async function cycle() {
  await api('/agent/heartbeat',{method:'POST',body:JSON.stringify({hostname:process.env.COMPUTERNAME||'unknown',version:'1.5.0'})});
  const {check}=await api('/agent/user-checks/next');
  if(check){try{await new Promise((resolve)=>setTimeout(resolve,2000));const users=await withTimeout(pullUsers({deviceIp:check.ip,devicePort:check.port}),25_000,'Timed out while connecting to and reading users from the device.');await api(`/agent/user-checks/${check.id}/complete`,{method:'POST',body:JSON.stringify({users})});console.log(`${new Date().toISOString()} checked users on ${check.name}`);}catch(error){const message=errorMessage(error,'Unable to read users from the device.');await api(`/agent/user-checks/${check.id}/fail`,{method:'POST',body:JSON.stringify({error:message})}).catch(()=>{});throw new Error(message);}}
  try { await updateDeviceStatuses(); } catch (error) { console.error(`${new Date().toISOString()} device status update failed: ${error.message}`); }
  const {push}=await api('/agent/user-pushes/next');
  if(push){try{const result=await withTimeout(pushUser({deviceIp:push.ip,devicePort:push.port,employeeId:push.employeeId,employeeName:push.employeeName}),50_000,'Device user push timed out.');await api(`/agent/user-pushes/${push.id}/complete`,{method:'POST',body:JSON.stringify(result)});console.log(`${new Date().toISOString()} pushed employee ${push.employeeId} to ${push.name}`);}catch(error){const message=errorMessage(error,'Unable to push the user to the device.');await api(`/agent/user-pushes/${push.id}/fail`,{method:'POST',body:JSON.stringify({error:message})}).catch(()=>{});throw new Error(message);}}
  const {job}=await api('/agent/jobs/next'); if(!job)return;
  try { const backup=await withTimeout(pullBackup({deviceIp:job.ip,devicePort:job.port}),65_000,'Device backup timed out.'); await api('/agent/backups',{method:'POST',body:JSON.stringify({jobId:job.id,deviceId:job.deviceId,backup})}); console.log(`${new Date().toISOString()} synchronized ${job.name} (${job.ip})`); }
  catch(error){ const message=errorMessage(error,'Device synchronization failed.');await api(`/agent/jobs/${job.id}/fail`,{method:'POST',body:JSON.stringify({error:message})}).catch(()=>{}); throw new Error(message); }
}
let running=false; async function tick(){if(running)return;running=true;try{await cycle();}catch(error){console.error(`${new Date().toISOString()} ${error.message}`);}finally{running=false;}}
console.log(`PayTimePro Sync Agent ${config.agentId} started`); tick(); setInterval(tick,config.interval);
