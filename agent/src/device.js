import ZKLib from 'node-zklib';

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })
  ]).finally(() => clearTimeout(timer));
}

async function connectDevice(device) {
  try {
    await device.createSocket();
  } catch (tcpError) {
    try {
      if (!device.zklibUdp.socket) await device.zklibUdp.createSocket();
      await device.zklibUdp.connect();
      device.connectionType = 'udp';
    } catch {
      throw tcpError;
    }
  }
}

export async function probeDevice(deviceConfig) {
  const device = new ZKLib(deviceConfig.deviceIp, deviceConfig.devicePort, 10_000, 5_200);
  let connected = false;
  try {
    await connectDevice(device);
    connected = true;
    await device.getInfo();
    return { online: true, connectionType: device.connectionType };
  } catch (error) {
    return { online: false, error: error?.message || 'Unable to connect using the ZKTeco protocol.' };
  } finally {
    if (connected) await device.disconnect().catch(() => {});
  }
}

export async function pullBackup(config) {
  const device = new ZKLib(config.deviceIp, config.devicePort, 10_000, 5_200); let connected = false;
  try {
    await connectDevice(device); connected = true;
    const info = await withTimeout(device.getInfo(),10_000,'Timed out while reading device information.'); const usersResult = Number(info.userCounts)===0?{data:[]}:await withTimeout(device.getUsers(),20_000,'Timed out while reading device users.'); const attendanceResult = await withTimeout(device.getAttendances(),30_000,'Timed out while reading device attendance.');
    return { createdAt: new Date().toISOString(), device: { model: 'ZKTeco MB460', ip: config.deviceIp, port: config.devicePort, connectionType: device.connectionType, ...info }, users: (usersResult.data || []).map((user) => ({ uid:user.uid,userId:user.userId,name:user.name,role:user.role,cardNumber:user.cardno })), attendance: (attendanceResult.data || []).map((record) => ({ userId:record.deviceUserId,userSerialNumber:record.userSn,timestamp:record.recordTime instanceof Date ? record.recordTime.toISOString() : record.recordTime })) };
  } finally { if (connected) await withTimeout(device.disconnect(),2_000,'Device disconnect timed out.').catch(() => {}); }
}

export async function pushUser(config) {
  const employeeId = String(config.employeeId || '');
  const numericUid = Number(employeeId);
  const employeeName = String(config.employeeName || '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 24);
  if (!/^\d{1,9}$/.test(employeeId) || !Number.isInteger(numericUid) || numericUid < 1 || numericUid > 65535) {
    throw new Error('Employee ID must be a number from 1 to 65535 and no more than 9 digits.');
  }
  const device = new ZKLib(config.deviceIp, config.devicePort, 10_000, 5_200); let connected = false;
  try {
    await connectDevice(device); connected = true;
    const info = await withTimeout(device.getInfo(),10_000,'Timed out while reading device information before user push.');
    const usersResult = Number(info.userCounts)===0?{data:[]}:await withTimeout(device.getUsers(),20_000,'Timed out while checking existing device users.');
    const users = usersResult.data || [];
    const matchingUser = users.find((user) => String(user.userId) === employeeId);
    if (matchingUser) {
      if (Number(matchingUser.uid) !== numericUid || Number(matchingUser.role) !== 0) throw new Error('The employee ID already exists on the device with different UID or role values.');
      return { alreadyExists: true };
    }
    if (users.some((user) => Number(user.uid) === numericUid)) throw new Error('The numeric device UID is already assigned to another device user.');
    if (device.connectionType !== 'tcp') throw new Error('Pushing users requires a TCP connection to this device.');
    const payload = Buffer.alloc(72);
    payload.writeUInt16LE(numericUid, 0);
    payload.writeUInt8(0, 2);
    payload.write(employeeName, 11, 24, 'ascii');
    payload.write(employeeId, 48, 9, 'ascii');
    await device.disableDevice();
    try { await withTimeout(device.executeCmd(8,payload),10_000,'Timed out while writing the device user.'); } finally { await withTimeout(device.enableDevice(),5_000,'Timed out while enabling the device.').catch(() => {}); }
    const verification = await withTimeout(device.getUsers(),20_000,'Timed out while verifying the device user.');
    const saved = (verification.data || []).find((user) => String(user.userId) === employeeId && Number(user.uid) === numericUid && Number(user.role) === 0);
    if (!saved) throw new Error('The device did not return the user after the write command.');
    return { alreadyExists: false };
  } finally { if (connected) await withTimeout(device.disconnect(),2_000,'Device disconnect timed out.').catch(() => {}); }
}

export async function pullUsers(config) {
  let device = new ZKLib(config.deviceIp, config.devicePort, 10_000, 5_200); let connected = false;
  try {
    await connectDevice(device); connected = true;
    const info = await withTimeout(device.getInfo(), 10_000, 'Timed out while reading device information.');
    if (Number(info.userCounts) === 0) return [];
    let result;
    try {
      result = await withTimeout(device.getUsers(), 20_000, 'Timed out while reading the device user list over TCP.');
    } catch (tcpError) {
      await withTimeout(device.disconnect(), 2_000, 'TCP disconnect timed out.').catch(() => {}); connected = false;
      device = new ZKLib(config.deviceIp, config.devicePort, 10_000, 0);
      try {
        if (!device.zklibUdp.socket) await device.zklibUdp.createSocket();
        device.connectionType = 'udp'; connected = true;
        await device.zklibUdp.connect();
      } catch (udpConnectionError) {
        if (device.zklibUdp.socket) await withTimeout(device.zklibUdp.closeSocket(), 2_000, 'UDP socket cleanup timed out.').catch(() => {});
        connected = false;
        throw new Error(`TCP user read failed (${tcpError?.err?.message||tcpError?.message||'unknown'}); UDP connection failed (${udpConnectionError?.message||'unknown'}).`);
      }
      try { result = await withTimeout(device.getUsers(), 20_000, 'Timed out while reading the device user list over UDP.'); }
      catch (udpError) { throw new Error(`TCP user read failed (${tcpError?.err?.message||tcpError?.message||'unknown'}); UDP fallback failed (${udpError?.err?.message||udpError?.message||'unknown'}).`); }
    }
    return (result.data || []).map((user) => ({ employeeId:String(user.userId??''),uid:Number(user.uid),role:Number(user.role) }));
  } finally { if (connected) await withTimeout(device.disconnect(), 2_000, 'Device disconnect timed out.').catch(() => {}); }
}
