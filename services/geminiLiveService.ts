import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../utils/audioUtils';
import { TranscriptItem } from '../types';

interface LiveServiceConfig {
  apiKey: string;
  onTranscriptUpdate: (transcript: TranscriptItem) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;
  onVolumeChange: (inputVol: number, outputVol: number) => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private config: LiveServiceConfig;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private stream: MediaStream | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private sessionPromise: Promise<any> | null = null;
  private currentInputTranscript = '';
  private currentOutputTranscript = '';
  private analyzerInput: AnalyserNode | null = null;
  private analyzerOutput: AnalyserNode | null = null;
  private animationFrameId: number | null = null;

  constructor(config: LiveServiceConfig) {
    this.config = config;
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
  }

  public async connect() {
    try {
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      this.analyzerInput = this.inputAudioContext.createAnalyser();
      this.analyzerOutput = this.outputAudioContext.createAnalyser();
      this.analyzerInput.fftSize = 256;
      this.analyzerOutput.fftSize = 256;

      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.analyzerOutput);
      this.analyzerOutput.connect(this.outputAudioContext.destination);

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this.startVolumeMonitoring();

      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: this.handleOpen.bind(this),
          onmessage: this.handleMessage.bind(this),
          onerror: (e) => {
             console.error('Session error', e);
             this.config.onError(new Error("Session connection error"));
          },
          onclose: (e) => {
             console.log('Session closed', e);
             this.disconnect();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            // Kore is a good female voice base. We use system instructions for the accent.
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `
            You are Sarah, a warm, professional, and knowledgeable hotel receptionist at the prestigious 'Harbour View Hotel' in Sydney, Australia.
            
            Key traits:
            1.  **Voice**: You have an Australian accent. Use phrases like "G'day", "No worries", "How can I help you today?", "Cheers".
            2.  **Role**: You help guests with check-in, check-out, local recommendations (Opera House, Bondi Beach, The Rocks), and room service.
            3.  **Tone**: Friendly, upscale, helpful, and concise. Do not speak in long paragraphs. Keep it conversational.
            
            Current Scenario: You are at the front desk. A guest (the user) has just approached the counter.
          `,
        },
      });

      this.config.onConnect();
    } catch (err) {
      this.config.onError(err as Error);
    }
  }

  private handleOpen() {
    if (!this.inputAudioContext || !this.stream || !this.analyzerInput) return;

    this.inputSource = this.inputAudioContext.createMediaStreamSource(this.stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.inputSource.connect(this.analyzerInput);
    this.analyzerInput.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = createBlob(inputData, 16000);
      
      this.sessionPromise?.then((session) => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };
  }

  private async handleMessage(message: LiveServerMessage) {
    // 1. Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext && this.outputNode) {
        this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
        
        try {
            const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                this.outputAudioContext,
                24000,
                1
            );
            
            const source = this.outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.outputNode);
            
            source.addEventListener('ended', () => {
                this.sources.delete(source);
            });
            
            source.start(this.nextStartTime);
            this.nextStartTime += audioBuffer.duration;
            this.sources.add(source);
        } catch (e) {
            console.error("Error decoding audio", e);
        }
    }

    // 2. Handle Interruption
    if (message.serverContent?.interrupted) {
      this.sources.forEach(source => {
          try { source.stop(); } catch (e) {}
      });
      this.sources.clear();
      this.nextStartTime = 0;
      this.currentOutputTranscript = '';
    }

    // 3. Handle Transcription
    // Input (User)
    if (message.serverContent?.inputTranscription) {
        this.currentInputTranscript += message.serverContent.inputTranscription.text;
    }
    // Output (Model)
    if (message.serverContent?.outputTranscription) {
        this.currentOutputTranscript += message.serverContent.outputTranscription.text;
    }

    // Turn complete? Push final text
    if (message.serverContent?.turnComplete) {
        if (this.currentInputTranscript.trim()) {
            this.config.onTranscriptUpdate({
                id: Date.now().toString() + '-user',
                sender: 'user',
                text: this.currentInputTranscript.trim(),
                isComplete: true
            });
            this.currentInputTranscript = '';
        }
        if (this.currentOutputTranscript.trim()) {
            this.config.onTranscriptUpdate({
                id: Date.now().toString() + '-model',
                sender: 'model',
                text: this.currentOutputTranscript.trim(),
                isComplete: true
            });
            this.currentOutputTranscript = '';
        }
    } else {
        // Real-time updates for UI feedback (optional, handled by checking non-empty)
        if (this.currentInputTranscript.trim()) {
             this.config.onTranscriptUpdate({
                id: 'current-user',
                sender: 'user',
                text: this.currentInputTranscript,
                isComplete: false
            });
        }
        if (this.currentOutputTranscript.trim()) {
            this.config.onTranscriptUpdate({
               id: 'current-model',
               sender: 'model',
               text: this.currentOutputTranscript,
               isComplete: false
           });
       }
    }
  }

  private startVolumeMonitoring() {
    const updateVolume = () => {
      let inputVol = 0;
      let outputVol = 0;

      if (this.analyzerInput) {
        const dataArray = new Uint8Array(this.analyzerInput.frequencyBinCount);
        this.analyzerInput.getByteFrequencyData(dataArray);
        inputVol = dataArray.reduce((a, b) => a + b) / dataArray.length;
      }

      if (this.analyzerOutput) {
        const dataArray = new Uint8Array(this.analyzerOutput.frequencyBinCount);
        this.analyzerOutput.getByteFrequencyData(dataArray);
        outputVol = dataArray.reduce((a, b) => a + b) / dataArray.length;
      }

      this.config.onVolumeChange(inputVol, outputVol);
      this.animationFrameId = requestAnimationFrame(updateVolume);
    };
    updateVolume();
  }

  public async disconnect() {
    if (this.sessionPromise) {
        const session = await this.sessionPromise;
        // There isn't a strict 'close' on the session object in the provided snippet, 
        // but we clean up our side.
        // Assuming session.close() exists or we just drop connection by stopping processing.
        // In the provided snippet, session.close() is mentioned in text, so we try calling it if available.
        if (typeof session.close === 'function') {
            session.close();
        }
    }

    if (this.processor) {
        this.processor.disconnect();
        this.processor.onaudioprocess = null;
    }
    if (this.inputSource) this.inputSource.disconnect();
    if (this.outputNode) this.outputNode.disconnect();
    
    this.stream?.getTracks().forEach(t => t.stop());
    
    if (this.inputAudioContext) await this.inputAudioContext.close();
    if (this.outputAudioContext) await this.outputAudioContext.close();

    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

    this.sources.clear();
    this.config.onDisconnect();
  }
}