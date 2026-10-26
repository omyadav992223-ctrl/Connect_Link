// =============================================================================
// SerialAdapter.ts — Web Serial API wrapper.
// Manages opening/closing the serial port and streaming text lines.
//
// Compatible with Chrome 89+ and Edge 89+.
// Falls back gracefully when Web Serial is unavailable.
// =============================================================================

export type SerialStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SerialAdapterOptions {
  baudRate?: number;
  onData: (line: string) => void;
  onStatusChange: (status: SerialStatus, message?: string) => void;
}

export class SerialAdapter {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private status: SerialStatus = 'disconnected';
  private readonly opts: SerialAdapterOptions;
  private abortController: AbortController | null = null;

  constructor(opts: SerialAdapterOptions) {
    this.opts = opts;
  }

  static isAvailable(): boolean {
    return 'serial' in navigator;
  }

  get currentStatus(): SerialStatus {
    return this.status;
  }

  /** Open a serial port (shows browser port picker). */
  async connect(baudRate = 9600): Promise<void> {
    if (!SerialAdapter.isAvailable()) {
      this.setStatus('error', 'Web Serial API is not available. Use Chrome or Edge.');
      return;
    }

    try {
      this.setStatus('connecting');

      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate });

      this.setStatus('connected');
      this.abortController = new AbortController();
      this.startReading();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('No port selected') || msg.includes('cancelled')) {
        this.setStatus('disconnected', 'Port selection cancelled.');
      } else {
        this.setStatus('error', `Connection failed: ${msg}`);
      }
    }
  }

  /** Close the serial port with fail-safe buzzer off. */
  async disconnect(): Promise<void> {
    // Fail-safe: ensure buzzer is commanded off before releasing port
    try {
      if (this.port?.writable) {
        const writer = this.port.writable.getWriter();
        const encoder = new TextEncoder();
        await writer.write(encoder.encode('BUZZ=0\n'));
        writer.releaseLock();
      }
    } catch { /* ignore */ }

    this.abortController?.abort();
    this.abortController = null;

    try {
      await this.reader?.cancel();
      this.reader?.releaseLock();
      this.reader = null;
    } catch { /* ignore */ }

    try {
      await this.port?.close();
      this.port = null;
    } catch { /* ignore */ }

    this.setStatus('disconnected');
  }

  /** Send a string to the Arduino (for test commands). */
  async sendCommand(command: string): Promise<void> {
    if (!this.port?.writable) return;
    const writer = this.port.writable.getWriter();
    try {
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(command + '\n'));
    } finally {
      writer.releaseLock();
    }
  }

  // -----------------------------------------------------------------------
  // Private — streaming reader
  // -----------------------------------------------------------------------

  private async startReading(): Promise<void> {
    if (!this.port?.readable) return;

    const textDecoder = new TextDecoderStream();
    const lineDecoder = new TransformStream<string, string>(new LineBreakTransformer());

    this.port.readable
      .pipeTo(textDecoder.writable)
      .catch(() => { /* port closed */ });

    const lineStream = textDecoder.readable.pipeThrough(lineDecoder);
    this.reader = lineStream.getReader();

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done || this.abortController?.signal.aborted) break;
        if (value) this.opts.onData(value);
      }
    } catch (err) {
      if (!this.abortController?.signal.aborted) {
        const msg = err instanceof Error ? err.message : 'Serial read error';
        this.setStatus('error', msg);
      }
    } finally {
      await this.disconnect();
    }
  }

  private setStatus(status: SerialStatus, message?: string): void {
    this.status = status;
    this.opts.onStatusChange(status, message);
  }
}

// ---------------------------------------------------------------------------
// TransformStream that splits chunks by newline
// ---------------------------------------------------------------------------

class LineBreakTransformer implements Transformer<string, string> {
  private buffer = '';
  // Skip the very first fragment — when connecting mid-stream the first
  // "line" is always a partial (e.g. "0,R=0,LC=0" instead of "L=0,R=0,LC=0").
  // Wait for the FIRST complete \n-terminated line before emitting anything.
  private seenFirstNewline = false;

  transform(chunk: string, controller: TransformStreamDefaultController<string>): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    // Last element is the incomplete fragment kept for next chunk
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      // Strip \r and all whitespace
      const clean = line.replace(/\r/g, '').trim();

      if (!this.seenFirstNewline) {
        // The very first complete line might be a clean start — use it.
        this.seenFirstNewline = true;
      }

      if (clean) controller.enqueue(clean);
    }
  }

  flush(controller: TransformStreamDefaultController<string>): void {
    const clean = this.buffer.replace(/\r/g, '').trim();
    if (clean) controller.enqueue(clean);
    this.buffer = '';
    this.seenFirstNewline = false;
  }
}
