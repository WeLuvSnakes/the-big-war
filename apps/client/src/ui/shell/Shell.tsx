import './Shell.css';
import { Hud } from '../hud/Hud';
import { errorLabel } from '../text';
import { Hotbar } from '../hotbar/Hotbar';
import { AboutView } from '../about/AboutView';
import { VOID_COLOR } from '../../render/theme';
import { HexPanel } from '../hex-panel/HexPanel';
import { audio } from '../../audio/audio.service';
import { ArmyPanel } from '../army-panel/ArmyPanel';
import { EndScreen } from '../end-screen/EndScreen';
import { WikiPanel } from '../wiki-panel/WikiPanel';
import { aboutCard, openAbout } from '../about/about';
import { BuildPanel } from '../build-panel/BuildPanel';
import { MenuScreen } from '../menu-screen/MenuScreen';
import { SmallScreen } from '../small-screen/SmallScreen';
import type { NoticesProps, PanelId } from './Shell.types';
import { DeploySlider } from '../deploy-slider/DeploySlider';
import { assignNationColors } from '../../render/nation-colors';
import { ResearchPanel } from '../research-panel/ResearchPanel';
import { gameStore, live } from '../../game/store/store.service';
import { DiplomacyPanel } from '../diplomacy-panel/DiplomacyPanel';
import { createWorld, type WorldRenderer } from '../../render/world';
import { offensivesOf } from '../../game/offensive/offensive.service';
import { Rail, RailAction } from '@the-big-war/frontend/ui/rail/Rail';
import type { BuildingKind } from '../../game/building/building.types';
import { pendingOffersTo } from '../../game/diplomacy/diplomacy.service';
import { useEvent } from '@the-big-war/frontend/ui/hooks/event/Event.hook';
import { createAttractMode, type AttractMode } from '../../session/attract';
import { createMatchRuntime, type MatchRuntime } from '../../session/runtime';
import { gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { createEffect, createSignal, For, onCleanup, onMount, Show, untrack } from 'solid-js';
import { DEFAULT_PLAYER_NAME, configFromSettings, createMatchFlow } from '../../session/flow';
import { FaBook, FaFlag, FaHammer, FaCrosshairs, FaAtom, FaSignOutAlt, FaMusic, FaVolumeUp } from '@the-big-war/frontend/ui/icons/icons';

export type { NoticesProps, PanelId };

export const Shell = () => {
  const store = gameStore();
  const flow = createMatchFlow();

  const [panel, setPanel] = createSignal<PanelId>(null);
  const [wikiFocus, setWikiFocus] = createSignal<BuildingKind | null>(null);
  const [world, setWorld] = createSignal<WorldRenderer | null>(null);
  const [runtime, setRuntime] = createSignal<MatchRuntime | null>(null);
  const [attract, setAttract] = createSignal<AttractMode | null>(null);
  let host: HTMLDivElement | undefined;

  const ensureWorld = async (): Promise<WorldRenderer | null> => {
    const existing = world();
    if (existing || !host) return existing;
    const created = createWorld({ host, initialScale: 0.85, background: VOID_COLOR });
    await created.init();
    setWorld(created);
    return created;
  };

  onMount(() => {
    void ensureWorld().then(active => {
      if (active) setAttract(createAttractMode({ world: active }));
    });
  });

  createEffect(() => {
    const mode = attract();
    if (!mode) return;
    if (flow.screen() === 'menu') mode.start();
    else mode.stop();
  });

  onCleanup(() => attract()?.stop());

  useEvent(window, 'keydown', () => audio.unlock());
  useEvent(window, 'pointerdown', event => {
    audio.unlock();
    if ((event.target as Element | null)?.closest?.('button')) audio.play('click');
  });

  createEffect(() => audio.setDucked(aboutCard() !== null));

  createEffect(() => {
    const screen = flow.screen();
    if (screen === 'menu') audio.setMood('menu');
    if (screen === 'match') audio.setMood('peace');
    if (screen === 'end') {
      audio.setMood('aftermath');
      untrack(() => audio.play(flow.lastResult()?.playerWon ? 'victory' : 'defeat'));
    }
  });

  const [starting, setStarting] = createSignal(false);
  const startMatch = async () => {
    if (starting()) return;
    setStarting(true);
    try {
      await launchMatch();
    } finally {
      setStarting(false);
    }
  };

  const launchMatch = async () => {
    const settings = flow.settings();
    const config = configFromSettings(settings, flow.playerName().trim() || DEFAULT_PLAYER_NAME);
    await store.startMatch({ ...config, start: { ...config.start, pickSpawns: true } });
    assignNationColors(store.state);

    store.dispatch({
      type: 'SelectFaction',
      empire: store.state.playerEmpire,
      factionId: flow.playerFaction(),
    });
    const bots = settings.bots;
    for (let id = 0; id < bots.length; id++) {
      const factionId = bots[id];
      if (factionId) store.dispatch({ type: 'SelectFaction', empire: id + 1, factionId });
    }
    attract()?.stop();
    flow.enterMatch();
    setPanel(null);

    const activeWorld = await ensureWorld();
    if (!activeWorld || !host) return;

    runtime()?.stop();
    const next = createMatchRuntime({
      store,
      world: activeWorld,
      host,
      onEnded: winner => flow.showResult(winner, store.state.playerEmpire),
    });
    setRuntime(next);
    next.fillScreenFromLeft();
    next.beginSpawnChoice();
    next.start();
  };

  const backToMenu = () => {
    runtime()?.stop();
    setRuntime(null);
    store.returnToMenu();
    setPanel(null);
    flow.backToMenu();
  };

  const togglePanel = (id: Exclude<PanelId, null>) => {
    if (id === 'wiki') setWikiFocus(null);
    setPanel(current => (current === id ? null : id));
  };
  const closePanel = (id: Exclude<PanelId, null>) => () => setPanel(current => (current === id ? null : current));

  const activeWaves = live(() => offensivesOf(store.state, store.state.playerEmpire).length);
  const pendingOfferCount = live(() => pendingOffersTo(store.state, store.state.playerEmpire).length);

  const ownPortSelected = live(() => {
    const hex = runtime()?.controllers.selectedHex();
    const cell = hex ? gridAt(store.state.grid, hex) : null;
    return cell?.owner === store.state.playerEmpire && cell.building?.kind === 'port';
  });

  const showingMatch = () => flow.screen() === 'match' || flow.screen() === 'end';

  return (
    <>
      <div ref={el => (host = el)} class="world-host" />

      <Show when={flow.screen() === 'menu'}>
        <div class="audio-toggles">
          <button type="button" aria-label="Music" aria-pressed={audio.musicOn()} onClick={() => audio.toggleMusic()}>
            <FaMusic />
          </button>
          <button type="button" aria-label="Sound" aria-pressed={audio.sfxOn()} onClick={() => audio.toggleSfx()}>
            <FaVolumeUp />
          </button>
        </div>
        <MenuScreen
          settings={flow.settings()}
          faction={flow.playerFaction()}
          playerName={flow.playerName()}
          playerColorIndex={flow.playerColorIndex()}
          onChange={patch => flow.updateSettings(patch)}
          onNameChange={name => flow.setPlayerName(name)}
          onSelectFaction={factionId => flow.chooseFaction(factionId)}
          onSelectColor={colorIndex => flow.setPlayerColorIndex(colorIndex)}
          onStart={() => void startMatch()}
        />
      </Show>

      <Show when={starting()}>
        <div class="match-loading" role="status">
          <span class="match-loading-mark" />
          Charting the world
        </div>
      </Show>

      <Show when={showingMatch()}>
        <Hud controllers={runtime()?.controllers} />

        <Rail
          label="The Big War"
          brand={<img src="/images/swords.svg" alt="" draggable={false} />}
          onBrand={() => openAbout()}
        >
          <RailAction
            label="Diplomacy"
            icon={<FaFlag />}
            active={panel() === 'diplomacy'}
            badge={pendingOfferCount()}
            onClick={() => togglePanel('diplomacy')}
          />
          <RailAction
            label="Research"
            icon={<FaAtom />}
            active={panel() === 'research'}
            onClick={() => togglePanel('research')}
          />
          <RailAction
            label="Combat"
            icon={<FaCrosshairs />}
            active={panel() === 'army'}
            badge={activeWaves()}
            badgeAccent
            onClick={() => togglePanel('army')}
          />
          <RailAction
            label="Build"
            icon={<FaHammer />}
            active={panel() === 'build'}
            onClick={() => togglePanel('build')}
          />
          <RailAction
            label="Wiki"
            icon={<FaBook />}
            active={panel() === 'wiki'}
            onClick={() => togglePanel('wiki')}
          />
          <div class="rail-divider rail-bottom">
            <RailAction label="Menu" icon={<FaSignOutAlt />} danger onClick={() => backToMenu()} />
          </div>
        </Rail>

        <Show when={panel() === 'build' && runtime()}>
          {active => <BuildPanel controllers={active().controllers} onClose={closePanel('build')} />}
        </Show>
        <Show when={panel() === 'army' && runtime()}>
          {active => <ArmyPanel controllers={active().controllers} onClose={closePanel('army')} />}
        </Show>
        <Show when={panel() === 'research'}>
          <ResearchPanel onClose={closePanel('research')} />
        </Show>
        <Show when={panel() === 'diplomacy'}>
          <DiplomacyPanel
            controllers={runtime()?.controllers}
            onClose={closePanel('diplomacy')}
          />
        </Show>
        <Show when={panel() === 'wiki'}>
          <WikiPanel focus={wikiFocus()} onClose={closePanel('wiki')} />
        </Show>
        <Show when={ownPortSelected() && runtime()}>
          {active => <HexPanel controllers={active().controllers} onClose={() => active().controllers.selectHex(null)} />}
        </Show>
        <Show when={runtime()}>
          {active => (
            <>
              <div class="hud-bottom-row">
                <Hotbar
                  controllers={active().controllers}
                  onInfo={kind => {
                    setWikiFocus(kind);
                    setPanel('wiki');
                  }}
                />
                <Notices controllers={active().controllers} />
              </div>
              <DeploySlider
                controllers={active().controllers}
                cameraMoved={active().cameraMoved()}
                onReset={() => active().resetCamera()}
              />
            </>
          )}
        </Show>
      </Show>

      <Show when={flow.screen() === 'end'}>
        <EndScreen
          playerWon={flow.lastResult()?.playerWon ?? false}
          onAgain={() => void startMatch()}
          onMenu={() => backToMenu()}
        />
      </Show>

      <AboutView />
      <SmallScreen />
    </>
  );
};

const Notices = (props: NoticesProps) => (
  <div class="kit-toasts" aria-live="polite">
    <For each={props.controllers.notices()}>
      {notice => <div class="kit-toast">{errorLabel(notice.reason)}</div>}
    </For>
  </div>
);
