import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { OverlayGateway } from "../gateway.js";
import { TokenStore } from "../token-store.js";

let httpServer: HttpServer;
let gateway: OverlayGateway;
let tokenStore: TokenStore;
let port: number;
const clients: ClientSocket[] = [];

beforeEach(async () => {
  tokenStore = new TokenStore();
  httpServer = createServer();
  gateway = new OverlayGateway(httpServer, tokenStore);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const c of clients) c.close();
  clients.length = 0;
  await gateway.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connectClient(token?: string): ClientSocket {
  const client = ioClient(`http://127.0.0.1:${port}/overlay`, {
    path: "/socket.io",
    query: token !== undefined ? { token } : {},
    reconnectionDelay: 20,
    reconnectionDelayMax: 50,
  });
  clients.push(client);
  return client;
}

describe("OverlayGateway", () => {
  it("từ chối kết nối với token không hợp lệ", async () => {
    const client = connectClient("token-sai");
    const error = await new Promise<Error>((resolve) => client.on("connect_error", resolve));
    expect(error.message).toContain("Unauthorized");
  });

  it("chấp nhận kết nối với token hợp lệ", async () => {
    const token = tokenStore.issue();
    const client = connectClient(token);
    await new Promise<void>((resolve) => client.on("connect", () => resolve()));
    expect(client.connected).toBe(true);
  });

  it("Fake Gift Event -> backend -> WebSocket -> client nhận đúng gift event (đúng chuỗi verification M08)", async () => {
    const token = tokenStore.issue();
    const client = connectClient(token);
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
    gateway.broadcast("liveEvent", fakeGiftEvent);

    const message = await received;
    expect(message).toMatchObject({ sequence: 1, type: "liveEvent", data: fakeGiftEvent });
  });

  it("sequence tăng dần qua nhiều lần broadcast", async () => {
    const token = tokenStore.issue();
    const client = connectClient(token);
    await new Promise<void>((resolve) => client.on("connect", () => resolve()));

    const messages: { sequence: number }[] = [];
    client.on("message", (m: { sequence: number }) => messages.push(m));

    gateway.broadcast("liveEvent", { a: 1 });
    gateway.broadcast("liveEvent", { a: 2 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(messages.map((m) => m.sequence)).toEqual([1, 2]);
  });

  it("reconnect: client ngắt kết nối rồi tự kết nối lại vẫn nhận được message mới", async () => {
    const token = tokenStore.issue();
    const client = connectClient(token);
    await new Promise<void>((resolve) => client.on("connect", () => resolve()));

    // Giả lập mất kết nối tạm thời từ phía client rồi tự reconnect (socket.io tự làm).
    client.disconnect();
    client.connect();
    await new Promise<void>((resolve) => client.on("connect", () => resolve()));

    const received = new Promise<unknown>((resolve) => client.on("message", resolve));
    gateway.broadcast("liveEvent", { after: "reconnect" });
    const message = await received;
    expect(message).toMatchObject({ data: { after: "reconnect" } });
  });
});
