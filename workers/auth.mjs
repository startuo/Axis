const enc = new TextEncoder();
const encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const decode = (text) => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:100000}, key, 256);
  return `pbkdf2-sha256$100000$${encode(salt)}$${encode(hash)}`;
}
export async function verifyPassword(password, stored) {
  const parts = stored.split('$');
  if(parts.length !== 4 || parts[0] !== 'pbkdf2-sha256' || parts[1] !== '100000') return false;
  const actual = await hashPassword(password, decode(parts[2]));
  let difference = actual.length ^ stored.length;
  for(let i=0;i<actual.length;i++) difference |= actual.charCodeAt(i) ^ (stored.charCodeAt(i) || 0);
  return difference === 0;
}
async function signingKey(secret) {
  if(typeof secret !== 'string' || enc.encode(secret).length < 32 || /replace|example|change.?me/i.test(secret)) throw new Error('JWT_SECRET is not configured');
  return crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
}
export async function issueToken(id, secret, ttlSeconds = 86400 * 7) {
  const now = Math.floor(Date.now()/1000);
  const head = encode(enc.encode(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const body = encode(enc.encode(JSON.stringify({sub:id,iat:now,exp:now+ttlSeconds,iss:'axis-api',aud:'axis-web'})));
  const data = `${head}.${body}`;
  return `${data}.${encode(await crypto.subtle.sign('HMAC', await signingKey(secret), enc.encode(data)))}`;
}
export async function tokenSubject(token, secret) {
  const key = await signingKey(secret);
  try {
    const [head,body,sig,...extra] = token.split('.');
    if(extra.length || !sig || JSON.parse(new TextDecoder().decode(decode(head))).alg !== 'HS256') return null;
    if(!await crypto.subtle.verify('HMAC',key,decode(sig),enc.encode(`${head}.${body}`))) return null;
    const claims = JSON.parse(new TextDecoder().decode(decode(body)));
    return typeof claims.sub === 'string' && Number.isFinite(claims.exp) && claims.exp > Date.now()/1000 && claims.iss === 'axis-api' && claims.aud === 'axis-web' ? claims.sub : null;
  } catch { return null; }
}
export async function fingerprint(value) {
  return encode(await crypto.subtle.digest('SHA-256',enc.encode(value)));
}
