export {};

declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: {
        workerSrc: string;
      };
      getDocument: (source: string | { data: Uint8Array }) => {
        promise: Promise<{
          numPages: number;
          getPage: (pageNumber: number) => Promise<{
            getViewport: (options: { scale: number }) => { width: number; height: number };
            render: (options: {
              canvasContext: CanvasRenderingContext2D | null;
              viewport: { width: number; height: number };
            }) => { promise: Promise<void> };
            getTextContent: () => Promise<{
              items: Array<{ str?: string }>;
            }>;
          }>;
        }>;
      };
    };
    SpeechRecognition?: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition?: {
      new (): SpeechRecognition;
    };
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
    onspeechstart: (() => void) | null;
    onaudiostart: (() => void) | null;
    onaudioend: (() => void) | null;
    abort(): void;
    start(audioTrack?: MediaStreamTrack): void;
    stop(): void;
  }

  interface SpeechRecognitionEvent {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionResultList {
    length: number;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionResult {
    isFinal: boolean;
    length: number;
    [index: number]: SpeechRecognitionAlternative;
  }

  interface SpeechRecognitionAlternative {
    transcript: string;
  }

  interface SpeechRecognitionErrorEvent {
    error: string;
  }
}
