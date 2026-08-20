export function collapseNearbyTimeEntries(entries, rangeMinutes = 5) {
  const rangeMilliseconds = rangeMinutes * 60 * 1000;
  return entries.reduce((visible, entry) => {
    const timestamp = new Date(entry.timestamp).getTime();
    const lastVisibleTimestamp = visible.length
      ? new Date(visible[visible.length - 1].timestamp).getTime()
      : null;
    if (lastVisibleTimestamp === null || timestamp - lastVisibleTimestamp > rangeMilliseconds) visible.push(entry);
    return visible;
  }, []);
}
