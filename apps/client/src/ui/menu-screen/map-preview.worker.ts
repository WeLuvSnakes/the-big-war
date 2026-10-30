import { previewPixels } from './map-preview-pixels';
import type { MatchSettings } from '../../session/flow';

const scope = globalThis as unknown as {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent<{ key: string; settings: MatchSettings }>) => void) | null;
};

scope.onmessage = ({ data }) => {
  const preview = previewPixels(data.settings);
  scope.postMessage({ key: data.key, ...preview }, [preview.pixels.buffer]);
};
