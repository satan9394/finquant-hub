export interface SSEEvent<T extends object = Record<string, unknown>> {
  event: string;
  data: T;
}

export interface ParsedSSEChunk<T extends object = Record<string, unknown>> {
  events: SSEEvent<T>[];
  remainder: string;
}

// ponytail: All current endpoints send JSON objects, so one small parser is
// enough; keep the protocol edge here instead of adding another dependency.
export function parseSSEChunk<T extends object = Record<string, unknown>>(
  buffer: string,
  flush = false,
): ParsedSSEChunk<T> {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const remainder = flush ? '' : blocks.pop() ?? '';
  const completeBlocks = flush ? blocks.filter((block) => block.trim()) : blocks;
  const events: SSEEvent<T>[] = [];

  for (const block of completeBlocks) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) {
        const value = line.slice(5);
        dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
      }
    }
    if (dataLines.length === 0) continue;
    const data = JSON.parse(dataLines.join('\n')) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`SSE ${event} 事件数据必须是对象`);
    }
    events.push({ event, data: data as T });
  }
  return { events, remainder };
}

export async function readSSE<T extends object = Record<string, unknown>>(
  body: ReadableStream<Uint8Array> | null,
  onEvent: (event: SSEEvent<T>) => void | Promise<void>,
  missingBodyMessage = '服务未返回事件流',
): Promise<void> {
  if (!body) throw new Error(missingBodyMessage);

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;

  const dispatch = async (events: SSEEvent<T>[]) => {
    for (const event of events) await onEvent(event);
  };

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const parsed = parseSSEChunk<T>(buffer);
      buffer = parsed.remainder;
      await dispatch(parsed.events);
    }

    buffer += decoder.decode();
    if (buffer.trim()) await dispatch(parseSSEChunk<T>(buffer, true).events);
    completed = true;
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
