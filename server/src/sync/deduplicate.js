function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function userKey(user) {
  return JSON.stringify(stableValue(user));
}

function attendanceKey(record) {
  const parsedTimestamp = new Date(record?.timestamp);
  const timestamp = Number.isNaN(parsedTimestamp.getTime())
    ? String(record?.timestamp ?? '')
    : parsedTimestamp.toISOString();

  return JSON.stringify({
    userId: String(record?.userId ?? ''),
    timestamp
  });
}

function attendanceUserKey(record) {
  return String(record?.userId ?? '');
}

export function uniqueAttendanceRecords(incoming, existing = [], rangeMinutes = 5) {
  const rangeMilliseconds = rangeMinutes * 60 * 1000;
  const seen = new Set(existing.map(attendanceKey));
  const timestampsByUser = new Map();

  for (const record of existing) {
    const timestamp = new Date(record?.timestamp).getTime();
    if (Number.isNaN(timestamp)) continue;
    const userKey = attendanceUserKey(record);
    const timestamps = timestampsByUser.get(userKey) || [];
    timestamps.push(timestamp);
    timestampsByUser.set(userKey, timestamps);
  }

  return incoming.filter((record) => {
    const key = attendanceKey(record);
    if (seen.has(key)) return false;
    const timestamp = new Date(record?.timestamp).getTime();
    const userKey = attendanceUserKey(record);
    const timestamps = timestampsByUser.get(userKey) || [];
    if (!Number.isNaN(timestamp) && timestamps.some((previous) => Math.abs(timestamp - previous) <= rangeMilliseconds)) return false;
    seen.add(key);
    if (!Number.isNaN(timestamp)) {
      timestamps.push(timestamp);
      timestampsByUser.set(userKey, timestamps);
    }
    return true;
  });
}

function uniqueRecords(incoming, existing, keyFor) {
  const seen = new Set(existing.map(keyFor));
  return incoming.filter((record) => {
    const key = keyFor(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function removePreviouslySynced(backup, previousBackups) {
  const previousUsers = previousBackups.flatMap((item) => item.users || []);
  const previousAttendance = previousBackups.flatMap((item) => item.attendance || []);

  return {
    ...backup,
    users: uniqueRecords(backup.users, previousUsers, userKey),
    attendance: uniqueAttendanceRecords(backup.attendance, previousAttendance)
  };
}
