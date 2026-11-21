import { AGENT_DISCOVERY_HEADERS, llmsText } from '@/lib/agent-discovery'

export async function GET() {
  return new Response(await llmsText(), {
    headers: {
      ...AGENT_DISCOVERY_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
