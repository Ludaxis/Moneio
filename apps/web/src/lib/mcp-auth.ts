import crypto from 'crypto';

// MCP token signing and verification for secure workspace access

const SECRET = process.env.MCP_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || 'mcp-secret-key';

export function signMcpToken(data: {
  workspaceId: string;
  userId: string;
  expiresAt: number;
}): string {
  const payload = JSON.stringify(data);
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const token = Buffer.from(payload).toString('base64') + '.' + signature;
  return token;
}

export function verifyMcpToken(token: string): { workspaceId: string; userId: string } | null {
  try {
    const [payloadBase64, signature] = token.split('.');
    if (!payloadBase64 || !signature) return null;

    const payload = Buffer.from(payloadBase64, 'base64').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

    if (signature !== expectedSignature) return null;

    const data = JSON.parse(payload);
    if (data.expiresAt < Date.now()) return null;

    return { workspaceId: data.workspaceId, userId: data.userId };
  } catch {
    return null;
  }
}
