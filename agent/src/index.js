import dotenv from 'dotenv';
import { probeDevice, pullBackup } from './device.js';
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
const config = { apiUrl:String(process.env.PAYTIMEPRO_API_URL||'').replace(/\/$/,''), agentId:process.env.AGENT_ID||'office-main', secret:process.env.AGENT_SECRET||'', interval:Math.max(10,Number(process.env.POLL_INTERVAL_SECONDS)||15)*1000 };
if (!config.apiUrl || !config.secret) throw new Error('PAYTIMEPRO_API_URL and AGENT_SECRET are required.');
const headers = { authorization:`Bearer ${config.secret}`,'x-agent-id':config.agentId,'content-type':'application/json' };
async function api(path, options={}) { const response=await fetch(`${config.apiUrl}/api/scheduler${path}`,{...options,headers:{...headers,...options.headers}}); if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||`Cloud API returned ${response.status}`);} return response.status===204?null:response.json(); }
async function updateDeviceStatuses() { const {devices}=await api('/agent/devices'); for (const device of devices) { const status=await probeDevice({deviceIp:device.ip,devicePort:device.port}); await api(`/agent/devices/${device.id}/status`,{method:'POST',body:JSON.stringify(status)}); } }
async function cycle() {
  await api('/agent/heartbeat',{method:'POST',body:JSON.stringify({hostname:process.env.COMPUTERNAME||'unknown',version:'1.2.1'})});
  try { await updateDeviceStatuses(); } catch (error) { console.error(`${new Date().toISOString()} device status update failed: ${error.message}`); }
  const {job}=await api('/agent/jobs/next'); if(!job)return;
  try { const backup=await pullBackup({deviceIp:job.ip,devicePort:job.port}); await api('/agent/backups',{method:'POST',body:JSON.stringify({jobId:job.id,deviceId:job.deviceId,backup})}); console.log(`${new Date().toISOString()} synchronized ${job.name} (${job.ip})`); }
  catch(error){ await api(`/agent/jobs/${job.id}/fail`,{method:'POST',body:JSON.stringify({error:error.message})}).catch(()=>{}); throw error; }
}
let running=false; async function tick(){if(running)return;running=true;try{await cycle();}catch(error){console.error(`${new Date().toISOString()} ${error.message}`);}finally{running=false;}}
console.log(`PayTimePro Sync Agent ${config.agentId} started`); tick(); setInterval(tick,config.interval);
