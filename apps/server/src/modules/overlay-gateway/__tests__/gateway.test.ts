import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { OverlayGateway } from "../gateway.js";
import { TokenStore } from "../token-store.js";

const JWT_SECRET = "test-secret";
const OWNER_A = "owner-a";
const OWNER_B = "owner-b";

let httpServer: HttpServer;
let gateway: OverlayGateway;
let tokenStore: TokenStore;
let port: number;
const clients: ClientSocket[] = [];

function verifyDashboardToken(token: string): { id: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string };
  } catch {
    return null;
  }
}

beforeEach(async () => {
  tokenStore = new TokenStore();
  httpServer = createServer();
  gateway = new OverlayGateway(httpServer, tokenStore, verifyDashboardToken);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const c of clients) c.close();
  clients.length = 0;
  await gateway.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connectOverlayClient(token?: string): ClientSocket {
  const client = ioClient(`http://127.0.0.1:${port}/overlay`, {
    path: "/socket.io",
    query: token !== undefined ? { token } : {},
    reconnectionDelay: 20,
    reconnectionDelayMax: 50,
  });
  clients.push(client);
  return client;
}

function connectDashboardClient(cookieToken?: string): ClientSocket {
  const client = ioClient(`http://127.0.0.1:${port}/dashboard`, {
    path: "/socket.io",
    extraHeaders: cookieToken ? { cookie: `token=${cookieToken}` } : {},
    reconnectionDelay: 20,
    reconnectionDelayMax: 50,
  });
  clients.push(client);
  return client;
}

describe("OverlayGateway", () => {
  it("từ chối kết nối overlay với token không hợp lệ", async () => {
    const client = connectOverlayClient("token-sai");
    const error = await new Promise<Error>((resolve) => client.on("connect_error", resolve));
    expect(error.message).toContain("Unauthorized");
  });

  it("chấp nhận kết nối overlay với token hợp lệ", async () => {
    const token = tokenStore.issue(OWNER_A);
    const client = connectOverlayClient(token);
    await new Promise<void>((resolve) => client.on("connect", () => resolve()));
    expect(client.connected).toBe(true);
  });

  it("từ chối kết nối dashboard không có cookie JWT hợp lệ", async () => {
    const client = connectDashboardClient();
    const error = await new Promise<Error>((resolve) => client.on("connect_error", resolve));
    expect(error.message).toContain("Unauthorized");
  });

  it("chấp nhận kết nối dashboard với JWT cookie hợp lệ", async () => {
    const token = jwt.sign({ id: OWNER_A, email: "a@test.com", role: "user" }, JWT_SECRET);
    const client = connectDashboardClient(token);
    await new Promise<void>((resolve) => client.on("connect", () => resolve()));
    expect(client.connected).toBe(true);
  });

  it("Fake Gift Event -> backend -> WebSocket -> client nhận đúng gift event (đúng chuỗi verification M08)", async () => {
    const token = tokenStore.issue(OWNER_A);
    const client = connectOverlayClient(token);
    await new Promise<void>((resolve) => client.on("connect", () => resolve()));

    const received = new Promise<unknown>((resolve) => client.on("message", resolve));

    const fakeGiftEvent = {
      schemaVersion: 1,
      id: "event-1",
      timestamp: new Date().toISOString(),
      streamId: "stream-1",
      type: "gift",
      user: { id: "u1", username: "gifter" },
      payload: { giftId: "1", giftName: "Rose", count: 1, isStreakEnd: true },
    };
    gateway.broadcast(OWNER_A, "liveEvent", fakeGiftEvent);

    const message = await received;
    expect(message).toMatchObject({ sequence: 1, type: "liveEvent", data: fakeGiftEvent });
  });

  it("CÁCH LY MULTI-TENANT: broadcast cho owner A không lộ sang client của owner B", async () => {
    const tokenA = tokenStore.issue(OWNER_A);
    const tokenB = tokenStore.issue(OWNER_B);
    const clientA = connectOverlayClient(tokenA);
    const clientB = connectOverlayClient(tokenB);
    await Promise.all([
      new Promise<void>((resolve) => clientA.on("connect", () => resolve())),
      new Promise<void>((resolve) => clientB.on("connect", () => resolve())),
    ]);

    const messagesB: unknown[] = [];
    clientB.on("message", (m: unknown) => messagesB.push(m));

    const receivedA = new Promise<unknown>((resolve) => clientA.on("message", resolve));
    gateway.broadcast(OWNER_A, "liveEvent", { secret: "chỉ owner A được thấy" });

    await receivedA;
    // Chờ thêm 1 nhịp để chắc chắn nếu có rò rỉ thì clientB cũng đã kịp nhận.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(messagesB).toHaveLength(0);
  });

  it("sequence tăng dần qua nhiều lần broadcast, tính riêng theo từng owner", async () => {
    const tokenA = tokenStore.issue(OWNER_A);
    const clientA = connectOverlayClient(tokenA);
    await new Promise<void>((resolve) => clientA.on("connect", () => resolve()));

    const messages: { sequence: number }[] = [];
    clientA.on("message", (m: { sequence: number }) => messages.push(m));

    gateway.broadcast(OWNER_A, "liveEvent", { a: 1 });
    gateway.broadcast(OWNER_B, "liveEvent", { a: 999 }); // owner khác — không được tính vào sequence của A
    gateway.broadcast(OWNER_A, "liveEvent", { a: 2 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(messages.map((m) => m.sequence)).toEqual([1, 2]);
  });

  it("reconnect: client ngắt kết nối rồi tự kết nối lại vẫn nhận được message mới", async () => {
    const token = tokenStore.issue(OWNER_A);
    const client = connectOverlayClient(token);
    await new Promise<void>((resolve) => client.on("connect", () => resolve()));

    // Giả lập mất kết nối tạm thời từ phía client rồi tự reconnect (socket.io tự làm).
    client.disconnect();
    client.connect();
    await new Promise<void>((resolve) => client.on("connect", () => resolve()));

    const received = new Promise<unknown>((resolve) => client.on("message", resolve));
    gateway.broadcast(OWNER_A, "liveEvent", { after: "reconnect" });
    const message = await received;
    expect(message).toMatchObject({ data: { after: "reconnect" } });
  });
});
