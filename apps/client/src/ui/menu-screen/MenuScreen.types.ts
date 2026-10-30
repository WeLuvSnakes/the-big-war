import type { JSX } from 'solid-js';
import type { MatchSettings } from '../../session/flow';

export interface MenuScreenProps {
  readonly settings: MatchSettings;
  readonly faction: string;
  readonly playerName: string;
  readonly playerColorIndex?: number;
  readonly onChange: (patch: Partial<MatchSettings>) => void;
  readonly onNameChange: (name: string) => void;
  readonly onSelectFaction: (factionId: string) => void;
  readonly onSelectColor?: (colorIndex: number) => void;
  readonly onStart: () => void;
}

export interface MapPreviewProps {
  readonly settings: MatchSettings;
  readonly class: string;
}

export type MenuDropdown = 'nation' | 'rivals' | 'difficulty' | 'neutral';

export interface DropdownProps {
  readonly class: string;
  readonly open: boolean;
  readonly label: string;
  readonly trigger: JSX.Element;
  readonly onToggle: (open: boolean) => void;
  readonly children: JSX.Element;
}

export interface OptionListProps<T extends string | number> {
  readonly options: readonly T[];
  readonly value: T;
  readonly title: (option: T) => string;
  readonly hint: (option: T) => string;
  readonly onSelect: (option: T) => void;
}
