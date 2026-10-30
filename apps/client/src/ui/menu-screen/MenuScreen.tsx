import './MenuScreen.css';
import { openAbout } from '../about/about';
import { paintPreview } from './map-preview';
import { FactionSprite } from './FactionSprite';
import type { MapPreset } from '../../game/map/map.types';
import { FACTIONS } from '../../game/faction/faction.constants';
import { isUnlimitedName } from '../../game/empire/empire.service';
import type { FactionDef } from '../../game/faction/faction.types';
import type { Modifier } from '../../game/modifier/modifier.types';
import { signed, signedPercent } from '@the-big-war/frontend/ui/format/format';
import { MAP_PRESET_LABELS, MAP_PRESET_ORDER } from '../../game/map/map.constants';
import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { CHEAT_UNLIMITED_PERK, CHEAT_UNLIMITED_TITLE } from '../../game/empire/empire.constants';
import type { DropdownProps, MapPreviewProps, MenuDropdown, MenuScreenProps, OptionListProps } from './MenuScreen.types';
import { DIFFICULTY_ORDER, NEUTRAL_STATES_ORDER, PRESET_MAP_SIZES, rivalFactions, type Difficulty, type MapSize, type NeutralStates } from '../../session/flow';

export type { DropdownProps, MapPreviewProps, MenuDropdown, MenuScreenProps, OptionListProps };

const difficultyLabel = (difficulty: Difficulty): string =>
  difficulty === 'easy' ? 'City Sim' : difficulty === 'normal' ? 'Nothing Personal' : 'Hurt Me';

const difficultyHint = (difficulty: Difficulty): string =>
  difficulty === 'easy' ? 'Rivals sit back' : difficulty === 'normal' ? 'A fair fight' : 'No mercy';

const neutralStatesLabel = (amount: NeutralStates): string =>
  amount === 'none' ? 'None' : amount === 'few' ? 'Few' : 'Many';

const neutralStatesHint = (amount: NeutralStates): string =>
  amount === 'none' ? 'Rivals only' : amount === 'few' ? 'Some to swallow' : 'A crowded world';

const WORLD_SIZE_LABELS: Readonly<Record<MapSize, string>> = {
  skirmish: 'Small',
  regional: 'Medium',
  continental: 'Large',
  world: 'Huge',
};

const WORLD_TRAITS: Readonly<Record<MapPreset, string>> = {
  continents: 'Mixed lands',
  pangaea: 'One landmass',
  twin_continents: 'Two shores',
  archipelago: 'Island hopping',
  inland_sea: 'Central sea',
  atoll_ring: 'Ring of islands',
  river_delta: 'Rivers and swamp',
  straits: 'Narrow crossings',
  skull: 'Silhouette',
  snake: 'Silhouette',
  crescent: 'Silhouette',
};

const RIVAL_COUNTS = [1, 3, 7, 15] as const;

const rivalsLabel = (count: number): string =>
  count === 1 ? 'Duel' : count === 3 ? 'Melee' : count === 7 ? 'Great War' : 'World War';

const rivalsHint = (count: number): string => (count === 1 ? '1 rival' : `${count} rivals`);

const factionById = (id: string): FactionDef => FACTIONS.find(faction => faction.id === id) ?? FACTIONS[0]!;

const MODIFIER_LABELS: Readonly<Record<string, string>> = {
  attack: 'attack',
  defence: 'defence',
  goldIncome: 'gold',
  buildCost: 'build cost',
  growth: 'growth',
  scienceRate: 'science',
  frontDefence: 'wave defence',
  reserveCap: 'reserve cap',
};

function bonusLine(modifier: Modifier): string {
  const name = MODIFIER_LABELS[modifier.key] ?? modifier.key;
  if (modifier.mul !== undefined) return `${signedPercent(Math.round((modifier.mul - 1) * 100))} ${name}`;
  if (modifier.add !== undefined) return `${signed(modifier.add)} ${name}`;
  return name;
}

const isBuff = (modifier: Modifier): boolean =>
  modifier.key === 'buildCost' ? (modifier.mul ?? 1) < 1 : (modifier.mul ?? 1) >= 1 && (modifier.add ?? 0) >= 0;

const Bonuses = (props: { faction: FactionDef }) => (
  <span class="setup-bonuses">
    <For each={props.faction.bonuses}>
      {modifier => (
        <span class={`setup-chip${isBuff(modifier) ? ' is-buff' : ' is-debuff'}`}>
          <span class="setup-chip-arrow">{isBuff(modifier) ? '▲' : '▼'}</span>
          {bonusLine(modifier)}
        </span>
      )}
    </For>
  </span>
);

const MapPreview = (props: MapPreviewProps) => {
  let canvas!: HTMLCanvasElement;
  createEffect(() => onCleanup(paintPreview(canvas, props.settings)));
  return <canvas ref={canvas} class={props.class} aria-hidden="true" />;
};

const CLOSE_DELAY_MS = 220;
const CONFIRM_MS = 3000;
const DRAG_STEP_PX = 60;
const WHEEL_GAP_MS = 220;

const hasHover = (): boolean => globalThis.matchMedia?.('(hover: hover)').matches ?? false;

const Dropdown = (props: DropdownProps) => {
  let closing: ReturnType<typeof setTimeout> | undefined;
  const stay = () => clearTimeout(closing);
  const leave = (event: MouseEvent) => {
    if (!hasHover()) return;
    const typing = (event.currentTarget as HTMLElement).contains(document.activeElement) && document.activeElement?.tagName === 'INPUT';
    if (!typing) closing = setTimeout(() => props.onToggle(false), CLOSE_DELAY_MS);
  };
  onCleanup(stay);
  return (
    <div
      class={`setup-dropdown ${props.class}`}
      onMouseEnter={() => {
        stay();
        if (hasHover()) props.onToggle(true);
      }}
      onMouseLeave={leave}
      onClick={event => event.stopPropagation()}
    >
      <button
        type="button"
        class="setup-trigger"
        aria-haspopup="true"
        aria-expanded={props.open}
        aria-label={props.label}
        onClick={() => props.onToggle(hasHover() || !props.open)}
      >
        {props.trigger}
        <span class="setup-chevron" aria-hidden="true">▾</span>
      </button>
      <Show when={props.open}>
        <div class="setup-panel">{props.children}</div>
      </Show>
    </div>
  );
};

function OptionList<T extends string | number>(props: OptionListProps<T>) {
  return (
    <div class="setup-list">
      <For each={props.options}>
        {option => (
          <button
            type="button"
            class={`setup-list-item${props.value === option ? ' is-active' : ''}`}
            aria-pressed={props.value === option}
            onClick={() => props.onSelect(option)}
          >
            <strong>{props.title(option)}</strong>
            <small>{props.hint(option)}</small>
          </button>
        )}
      </For>
    </div>
  );
}

const TileValue = (props: { icon: string; label: string; value: string }) => (
  <>
    <span class="setup-tile-icon" aria-hidden="true">{props.icon}</span>
    <span class="setup-tile-text">
      <small>{props.label}</small>
      <strong>{props.value}</strong>
    </span>
  </>
);

const COLOR_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export const MenuScreen = (props: MenuScreenProps) => {
  const [playerColor, setPlayerColor] = createSignal(props.playerColorIndex ?? 0);
  const [opened, setOpened] = createSignal<MenuDropdown | null>(null);
  const [confirming, setConfirming] = createSignal(false);

  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  let stage!: HTMLElement;
  let dragX: number | null = null;
  let dragged = false;
  let lastWheel = 0;

  const promised = () => isUnlimitedName(props.playerName);
  const faction = () => factionById(props.faction);
  const selected = () => Math.max(0, MAP_PRESET_ORDER.indexOf(props.settings.preset));
  const count = MAP_PRESET_ORDER.length;

  const worldSettings = (preset: MapPreset) => ({ ...props.settings, preset, mapSize: PRESET_MAP_SIZES[preset] });
  const go = (index: number) => {
    const preset = MAP_PRESET_ORDER[(index + count) % count]!;
    props.onChange({ preset, mapSize: PRESET_MAP_SIZES[preset] });
  };
  const offsetOf = (index: number): number => {
    const offset = (index - selected() + count) % count;
    return offset > count / 2 ? offset - count : offset;
  };

  const toggle = (id: MenuDropdown, open: boolean) =>
    setOpened(current => (open ? id : current === id ? null : current));
  const closeSoon = () => setOpened(null);

  const disarm = () => {
    clearTimeout(confirmTimer);
    setConfirming(false);
  };
  const begin = (event: MouseEvent) => {
    event.stopPropagation();
    setOpened(null);
    if (confirming()) {
      disarm();
      props.onStart();
      return;
    }
    setConfirming(true);
    confirmTimer = setTimeout(disarm, CONFIRM_MS);
  };

  const pickColor = (color: number) => {
    setPlayerColor(color);
    props.onSelectColor?.(color);
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpened(null);
      disarm();
    }
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    if (event.key === 'ArrowLeft') go(selected() - 1);
    if (event.key === 'ArrowRight') go(selected() + 1);
  };
  const onWheel = (event: WheelEvent) => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const now = Date.now();
    if (Math.abs(delta) < 8 || now - lastWheel < WHEEL_GAP_MS) return;
    lastWheel = now;
    event.preventDefault();
    go(selected() + Math.sign(delta));
  };
  const onDrag = (event: PointerEvent) => {
    if (dragX === null) return;
    const delta = event.clientX - dragX;
    if (Math.abs(delta) < DRAG_STEP_PX) return;
    dragged = true;
    dragX = event.clientX;
    go(selected() - Math.sign(delta));
  };

  onMount(() => {
    document.addEventListener('keydown', onKey);
    stage.addEventListener('wheel', onWheel, { passive: false });
  });
  onCleanup(() => {
    document.removeEventListener('keydown', onKey);
    clearTimeout(confirmTimer);
  });

  return (
    <div
      class="setup-screen"
      onClick={() => {
        setOpened(null);
        disarm();
      }}
    >
      <MapPreview class="setup-ambient" settings={props.settings} />

      <header class="setup-bar setup-header">
        <h1 class="setup-title">
          <img class="setup-title-logo" src="/images/swords.svg" alt="" draggable={false} />
          The <em>Big</em> War
        </h1>
        <Dropdown
          class="setup-nation"
          open={opened() === 'nation'}
          label="Change your nation"
          onToggle={open => toggle('nation', open)}
          trigger={
            <>
              <span class="setup-flag" style={{ '--tint': promised() ? 'var(--street-accent)' : `var(--faction-${playerColor()})` }}>
                <FactionSprite class="setup-flag-sprite" factionId={faction().id} />
              </span>
              <strong class="setup-nation-name">{props.playerName.trim() || faction().name}</strong>
            </>
          }
        >
          <input
            class="setup-name-input"
            type="text"
            maxlength={24}
            autocomplete="nickname"
            aria-label="Nation name"
            placeholder={faction().name}
            value={props.playerName}
            onInput={event => props.onNameChange(event.currentTarget.value)}
          />
          <Show when={promised()}>
            <p class="setup-promise">{CHEAT_UNLIMITED_TITLE}: {CHEAT_UNLIMITED_PERK}</p>
          </Show>
          <div class="setup-colors" role="radiogroup" aria-label="Color">
            <For each={COLOR_OPTIONS}>
              {color => (
                <button
                  type="button"
                  role="radio"
                  class={`setup-color-swatch${playerColor() === color ? ' is-selected' : ''}`}
                  style={{ background: `var(--faction-${color})` }}
                  aria-label={`Color ${color + 1}`}
                  aria-checked={playerColor() === color}
                  onClick={() => pickColor(color)}
                />
              )}
            </For>
          </div>
          <div class="setup-factions">
            <For each={FACTIONS}>
              {option => (
                <button
                  type="button"
                  class={`setup-option setup-option--${option.id}${props.faction === option.id ? ' is-selected' : ''}`}
                  aria-pressed={props.faction === option.id}
                  onClick={() => props.onSelectFaction(option.id)}
                >
                  <FactionSprite class="setup-option-sprite" factionId={option.id} />
                  <span class="setup-option-name">{option.name}</span>
                  <Bonuses faction={option} />
                </button>
              )}
            </For>
          </div>
        </Dropdown>
      </header>

      <section
        ref={stage}
        class="setup-stage"
        aria-label="Choose a world"
        onPointerDown={event => {
          dragX = event.clientX;
          dragged = false;
        }}
        onPointerMove={onDrag}
        onPointerUp={() => (dragX = null)}
        onPointerLeave={() => (dragX = null)}
      >
        <div class="setup-deck">
          <For each={MAP_PRESET_ORDER}>
            {(preset, index) => {
              const offset = () => offsetOf(index());
              const distance = () => Math.abs(offset());
              return (
                <button
                  type="button"
                  class={`setup-map${distance() === 0 ? ' is-active' : ''}`}
                  aria-current={distance() === 0}
                  tabindex={distance() > 1 ? -1 : 0}
                  style={{
                    transform: `translate(-50%, -50%) translateX(${offset() * 48}%) translateZ(${-distance() * 220}px) rotateY(${-Math.sign(offset()) * Math.min(distance(), 1) * 32}deg)`,
                    'z-index': 20 - distance(),
                    opacity: distance() > 2 ? 0 : 1,
                    filter: distance() > 0 ? 'brightness(0.55)' : 'none',
                    'pointer-events': distance() > 2 ? 'none' : 'auto',
                  }}
                  onClick={() => {
                    if (!dragged) go(index());
                  }}
                >
                  <MapPreview class="setup-map-image" settings={worldSettings(preset)} />
                  <span class="setup-map-caption">
                    {MAP_PRESET_LABELS[preset]}
                    <small>{WORLD_SIZE_LABELS[PRESET_MAP_SIZES[preset]]} · {WORLD_TRAITS[preset]}</small>
                  </span>
                </button>
              );
            }}
          </For>
        </div>
        <button type="button" class="setup-arrow is-left" aria-label="Previous world" onClick={() => go(selected() - 1)}>◀</button>
        <button type="button" class="setup-arrow is-right" aria-label="Next world" onClick={() => go(selected() + 1)}>▶</button>
      </section>

      <div class="setup-dots">
        <For each={MAP_PRESET_ORDER}>
          {(preset, index) => (
            <button
              type="button"
              class={index() === selected() ? 'is-active' : ''}
              aria-label={MAP_PRESET_LABELS[preset]}
              onClick={() => go(index())}
            >
              <i />
            </button>
          )}
        </For>
      </div>

      <div class="setup-bar setup-dock">
        <Dropdown
          class="setup-tile"
          open={opened() === 'rivals'}
          label="Rivals"
          onToggle={open => toggle('rivals', open)}
          trigger={<TileValue icon="⚑" label="Rivals" value={rivalsLabel(props.settings.bots.length)} />}
        >
          <OptionList
            options={RIVAL_COUNTS}
            value={props.settings.bots.length as (typeof RIVAL_COUNTS)[number]}
            title={rivalsLabel}
            hint={rivalsHint}
            onSelect={count => {
              props.onChange({ bots: rivalFactions(count) });
              closeSoon();
            }}
          />
        </Dropdown>
        <Dropdown
          class="setup-tile"
          open={opened() === 'difficulty'}
          label="Difficulty"
          onToggle={open => toggle('difficulty', open)}
          trigger={<TileValue icon="☠" label="Difficulty" value={difficultyLabel(props.settings.difficulty)} />}
        >
          <OptionList
            options={DIFFICULTY_ORDER}
            value={props.settings.difficulty}
            title={difficultyLabel}
            hint={difficultyHint}
            onSelect={difficulty => {
              props.onChange({ difficulty });
              closeSoon();
            }}
          />
        </Dropdown>
        <Dropdown
          class="setup-tile"
          open={opened() === 'neutral'}
          label="Neutral states"
          onToggle={open => toggle('neutral', open)}
          trigger={<TileValue icon="⛨" label="Neutral states" value={neutralStatesLabel(props.settings.neutralStates)} />}
        >
          <OptionList
            options={NEUTRAL_STATES_ORDER}
            value={props.settings.neutralStates}
            title={neutralStatesLabel}
            hint={neutralStatesHint}
            onSelect={neutralStates => {
              props.onChange({ neutralStates });
              closeSoon();
            }}
          />
        </Dropdown>
        <button type="button" class={`setup-begin${confirming() ? ' is-confirming' : ''}`} onClick={begin}>
          {confirming() ? 'Are you sure?' : 'Begin the war'}
        </button>
      </div>

      <footer class="setup-footer" onClick={() => openAbout()}>
        <img class="setup-footer-logo" src="/images/we-love-snakes-text-only.png" alt="We Love Snakes" draggable={false} />
      </footer>
    </div>
  );
};
