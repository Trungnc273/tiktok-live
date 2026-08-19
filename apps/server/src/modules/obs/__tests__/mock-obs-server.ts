import { WebSocketServer, type WebSocket } from "ws";

/**
 * Mock OBS WebSocket v5 server (JSON encoding, không auth) — đủ để test
 * OBSService.connect()/setCurrentScene() mà không cần OBS Studio thật chạy
 * (docs/promp/PHASE_12.md: "Use mocked OBS server for automated tests").
 *
 * Chỉ implement đúng phần protocol cần cho test: Hello(0) -> Identify(1) ->
 * Identified(2) -> Request(6, SetCurrentProgramScene) -> RequestResponse(7).
 */
export class MockObsServer {
  private readonly wss: WebSocketServer;
  public receivedSceneNames: string[] = [];
  public failNextRequest = false;

  constructor(private readonly port: number) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (socket) => this.handleConnection(socket));
  }

  private handleConnection(socket: WebSocket): void {
    socket.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: "5.0.0", rpcVersion: 1 } }));

    socket.on("message", (raw) => {
      const msg = JSON.parse(raw.toString()) as { op: number; d: Record<string, unknown> };

      if (msg.op === 1) {
        socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        return;
      }

      if (msg.op === 6) {
        const { requestType, requestId, requestData } = msg.d as {
          requestType: string;
          requestId: string;
          requestData?: { sceneName?: string };
        };

        if (requestType === "SetCurrentProgramScene" && requestData?.sceneName) {
          this.receivedSceneNames.push(requestData.sceneName);
        }

        const success = !this.failNextRequest;
        this.failNextRequest = false;

        socket.send(
          JSON.stringify({
            op: 7,
            d: {
              requestType,
              requestId,
              requestStatus: success
                ? { result: true, code: 100 }
                : { result: false, code: 600, comment: "Mock lỗi giả lập" },
              responseData: {},
            },
          }),
        );
      }
    });
  }

  async close(): Promise<void> {
    for (const client of this.wss.clients) client.terminate();
    await new Promise<void>((resolve, reject) => this.wss.close((err) => (err ? reject(err) : resolve())));
  }

  get url(): string {
    return `ws://127.0.0.1:${this.port}`;
  }
}
