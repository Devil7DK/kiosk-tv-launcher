/** Loopback and the address ranges a home router hands out. */
export function isPrivateAddress(address: string | undefined): boolean {
  if (!address) return false;
  const ip = address.replace(/^::ffff:/, '');
  if (ip === '::1' || ip.startsWith('127.')) return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  const second = /^172\.(\d+)\./.exec(ip)?.[1];
  if (second && Number(second) >= 16 && Number(second) <= 31) return true;
  return /^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip);
}
