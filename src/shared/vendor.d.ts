declare module 'electron-window-state' {
  import type { BrowserWindow } from 'electron';
  export default function windowStateKeeper(options: {
    defaultWidth: number;
    defaultHeight: number;
  }): {
    x?: number;
    y?: number;
    width: number;
    height: number;
    manage(window: BrowserWindow): void;
  };
}

declare module 'auto-launch' {
  export default class AutoLaunch {
    constructor(options: { name: string; path?: string; isHidden?: boolean });
    enable(): Promise<void>;
    disable(): Promise<void>;
    isEnabled(): Promise<boolean>;
  }
}

declare module 'howler' {
  export class Howl {
    constructor(options: { src: string[]; loop?: boolean; volume?: number; html5?: boolean });
    play(): number;
    pause(): void;
    stop(): void;
    volume(value?: number): number | this;
    playing(): boolean;
  }
}
