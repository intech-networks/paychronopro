import ZKLib from 'node-zklib';

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
    const info = await device.getInfo(); const usersResult = await device.getUsers(); const attendanceResult = await device.getAttendances();
    return { createdAt: new Date().toISOString(), device: { model: 'ZKTeco MB460', ip: config.deviceIp, port: config.devicePort, connectionType: device.connectionType, ...info }, users: (usersResult.data || []).map((user) => ({ uid:user.uid,userId:user.userId,name:user.name,role:user.role,cardNumber:user.cardno })), attendance: (attendanceResult.data || []).map((record) => ({ userId:record.deviceUserId,userSerialNumber:record.userSn,timestamp:record.recordTime instanceof Date ? record.recordTime.toISOString() : record.recordTime })) };
  } finally { if (connected) await device.disconnect().catch(() => {}); }
}
