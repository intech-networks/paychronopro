export default function BrandName({ siteName }) {
  const fallbackName = 'PayTimePro';
  const words = String(siteName || fallbackName).trim().split(/\s+/).filter(Boolean);
  const lead = words.shift() || fallbackName;
  const tail = words.join(' ');
  const joinTail = tail.toLowerCase() === 'pro';
  return <><span className="brand-name-lead">{lead}</span>{tail && <strong className="brand-name-tail">{joinTail ? tail : ` ${tail}`}</strong>}</>;
}
