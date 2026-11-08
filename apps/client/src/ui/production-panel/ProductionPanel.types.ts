import type { Controllers } from '../../session/controllers';

export interface ProductionPanelProps {
  readonly controllers: Controllers;
  readonly onClose: () => void;
}
