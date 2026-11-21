import {
  AGENT_DISCOVERY_HEADERS,
  agenticResourceManifest,
} from '@/lib/agent-discovery'

export function GET() {
  return Response.json(agenticResourceManifest(), {
    headers: AGENT_DISCOVERY_HEADERS,
  })
}
