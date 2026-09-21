export interface LatencyRecord {
  testNumber: number;
  prompt: string;
  t1SpeechEnded: number;
  t2AudioStarted: number;
  latencyMs: number;
}

export class LatencyTracker {
  private static speechEndTimestamp: number = 0;
  private static currentPrompt: string = '';
  private static testCount: number = 0;
  private static records: LatencyRecord[] = [];
  private static listeners: ((record: LatencyRecord) => void)[] = [];

  /**
   * T1: Exact moment the user's speech is detected as finished
   */
  public static markSpeechEnded(prompt?: string): void {
    this.speechEndTimestamp = performance.now();
    this.currentPrompt = prompt || '';
    console.log(`[POCKET AI LATENCY] T1: User speech ended at ${Math.round(this.speechEndTimestamp)} ms. Prompt: "${this.currentPrompt}"`);
  }

  /**
   * T2: Exact moment Pocket AI's response audio actually starts playing from device speaker
   */
  public static markAudioStarted(): LatencyRecord | null {
    if (this.speechEndTimestamp <= 0) return null;
    const now = performance.now();
    const latency = Math.round(now - this.speechEndTimestamp);
    this.testCount++;

    const record: LatencyRecord = {
      testNumber: this.testCount,
      prompt: this.currentPrompt,
      t1SpeechEnded: Math.round(this.speechEndTimestamp),
      t2AudioStarted: Math.round(now),
      latencyMs: latency
    };
    this.records.push(record);

    // Standard formatted log required by specification
    console.log(
      `[POCKET AI LATENCY]\n` +
      `Test #${record.testNumber}: "${record.prompt}"\n` +
      `User speech ended: ${record.t1SpeechEnded} ms\n` +
      `Response audio started: ${record.t2AudioStarted} ms\n` +
      `Voice response latency: ${record.latencyMs} ms (${(record.latencyMs / 1000).toFixed(2)} seconds)`
    );

    // Notify UI listeners for on-screen debug display
    this.listeners.forEach(fn => fn(record));

    // Reset speechEndTimestamp
    this.speechEndTimestamp = 0;
    return record;
  }

  public static onLatencyMeasured(fn: (record: LatencyRecord) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  public static getRecords(): LatencyRecord[] {
    return this.records;
  }

  public static clear(): void {
    this.records = [];
    this.testCount = 0;
    this.speechEndTimestamp = 0;
  }
}
