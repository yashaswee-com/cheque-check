import {
  AGENT_DISCOVERY_HEADERS,
  chequeBounceSkill,
} from '@/lib/agent-discovery'

export function GET() {
  return new Response(chequeBounceSkill(), {
    headers: {
      ...AGENT_DISCOVERY_HEADERS,
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  })
}
