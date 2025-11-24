export interface TranscriptItem {
  id: string;
  sender: 'user' | 'model';
  text: string;
  isComplete: boolean;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface VolumeLevel {
  input: number;
  output: number;
}