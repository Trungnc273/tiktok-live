export type { TTSProvider } from "./provider.js";
export { WindowsSapiProvider } from "./windows-sapi-provider.js";
export { LinuxEspeakProvider, type LinuxEspeakProviderOptions } from "./linux-espeak-provider.js";
export { MockTTSProvider, type MockProviderCall } from "./mock-provider.js";
export { renderTemplate, type RenderResult } from "./template.js";
export { buildTemplateVariables } from "./template-variables.js";
export { TTSQueue, type TTSQueueOptions } from "./tts-queue.js";
export { createTTSActionHandler, type TTSActionPayload } from "./tts-action-handler.js";
