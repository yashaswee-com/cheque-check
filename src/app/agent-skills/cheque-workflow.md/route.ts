import {
  AGENT_DISCOVERY_HEADERS,
  chequeWorkflowSkill,
} from '@/lib/agent-discovery'

export function GET() {
  return new Response(chequeWorkflowSkill(), {
    headers: {
      ...AGENT_DISCOVERY_HEADERS,
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  })
}
