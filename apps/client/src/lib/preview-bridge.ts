import { stream, type getServerBridge, type ViteDevServer } from 'almostnode'

type Bridge = ReturnType<typeof getServerBridge>
type BridgeServer = Parameters<Bridge['registerServer']>[0]
type RequestBody = Parameters<BridgeServer['handleRequest']>[3]
type ViteRequestBody = Parameters<ViteDevServer['handleRequest']>[3]

export function createBridgeServer(devServer: ViteDevServer): BridgeServer {
  return {
    address: () => ({
      address: '0.0.0.0',
      family: 'IPv4',
      port: devServer.getPort(),
    }),
    handleRequest: (method, url, headers, body) =>
      devServer.handleRequest(method, url, headers, normalizeRequestBody(body)),
    listening: true,
  }
}

function normalizeRequestBody(body: RequestBody): ViteRequestBody {
  if (body === undefined) {
    return undefined
  }

  return typeof body === 'string' ? stream.Buffer.from(body) : body
}
