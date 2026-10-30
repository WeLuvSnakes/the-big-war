import './ResearchPanel.css';
import { createSignal, For, Show } from 'solid-js';
import { Panel } from '@the-big-war/frontend/ui/panel/Panel';
import type { ResearchPanelProps } from './ResearchPanel.types';
import { gameStore, live } from '../../game/store/store.service';
import { RESEARCH_NODES } from '../../game/research/research.constants';
import { signed, signedPercent } from '@the-big-war/frontend/ui/format/format';
import type { Modifier, ModifierKey } from '../../game/modifier/modifier.types';
import type { ResearchBranch, ResearchEffect, ResearchNode } from '../../game/research/research.types';
import { RESEARCH_BRANCHES, branchLabel, researchNodes, researchSecondsLeft, researchStatus } from './ResearchPanel.utility';
import { FaArrowUp, FaBolt, FaChevronRight, FaCheck, FaCrosshairs, FaFlag, FaHammer, FaHeart, FaAtom, FaShieldAlt, FaUnlock, FaUsers, FaVial, FaWallet } from '@the-big-war/frontend/ui/icons/icons';

export type { ResearchPanelProps };

const MODIFIER_META: Record<ModifierKey, { readonly icon: typeof FaWallet; readonly label: string }> = {
  goldIncome: { icon: FaWallet, label: 'Gold income' },
  scienceRate: { icon: FaAtom, label: 'Science rate' },
  growth: { icon: FaHeart, label: 'Growth' },
  buildCost: { icon: FaHammer, label: 'Build cost' },
  attack: { icon: FaCrosshairs, label: 'Attack' },
  defence: { icon: FaShieldAlt, label: 'Defence' },
  reserveCap: { icon: FaUsers, label: 'Reserve cap' },
  recruitSpeed: { icon: FaBolt, label: 'Recruit speed' },
  frontAttack: { icon: FaFlag, label: 'Wave attack' },
  frontDefence: { icon: FaShieldAlt, label: 'Wave defence' },
};

function modifierValue(modifier: Modifier): string {
  if (modifier.mul !== undefined) return signedPercent(Math.round((modifier.mul - 1) * 100));
  if (modifier.add !== undefined) return signed(modifier.add);
  return '';
}

const EffectChips = (props: { readonly effect: ResearchEffect }) => {
  const effect = props.effect;
  switch (effect.kind) {
    case 'modifier':
      return (
        <For each={effect.modifiers}>
          {modifier => {
            const meta = MODIFIER_META[modifier.key as ModifierKey];
            const Icon = meta?.icon ?? FaArrowUp;
            return (
              <span class="research-chip" title={meta?.label ?? modifier.key}>
                <Icon class="research-chip-icon" />
                <span class="kit-num">{modifierValue(modifier)}</span>
              </span>
            );
          }}
        </For>
      );
    case 'unlock':
      return (
        <span class="research-chip" title="Unlock">
          <FaUnlock class="research-chip-icon" />
          {effect.label}
        </span>
      );
    default:
      return <span class="research-chip">{(effect as { kind: string }).kind}</span>;
  }
};

const ScienceCost = (props: { readonly amount: number }) => (
  <span class="research-cost kit-num" title="Science">
    <FaVial class="research-cost-icon" />
    {props.amount}
  </span>
);

export const ResearchPanel = (props: ResearchPanelProps) => {
  const store = gameStore();
  const [open, setOpen] = createSignal<ReadonlySet<ResearchBranch>>(new Set(['economy']));
  const isOpen = (entry: ResearchBranch) => open().has(entry);
  const toggle = (entry: ResearchBranch) =>
    setOpen(prev => {
      const next = new Set(prev);
      if (!next.delete(entry)) next.add(entry);
      return next;
    });

  const me = live(() => store.state.empires[store.state.playerEmpire]!);
  const research = () => me().research;

  const status = (node: ResearchNode) => researchStatus(research(), node);
  const nodes = (branch: ResearchBranch) => researchNodes(branch, research());
  const secondsLeft = (node: ResearchNode) => researchSecondsLeft(research(), node);

  const start = (node: ResearchNode, optionId?: string) => {
    store.dispatch({
      type: 'StartResearch',
      empire: store.state.playerEmpire,
      nodeId: node.id,
      ...(optionId ? { optionId } : {}),
    });
  };

  return (
    <Panel title="Research" onClose={props.onClose}>
      <Show when={research().active}>
        {active => {
          const node = () => RESEARCH_NODES.find(entry => entry.id === active().nodeId);
          return (
            <Show when={node()}>
              {current => (
                <div class="kit-col">
                  <div class="kit-row">
                    <span class="hud-card-sub">In progress: {current().name}</span>
                    <span class="hud-bar-value kit-num">{Math.round(active().progress * 100)}%</span>
                  </div>
                  <div class="hud-bar hud-bar--info">
                    <div class="hud-bar-fill" style={{ width: `${active().progress * 100}%` }} />
                  </div>
                </div>
              )}
            </Show>
          );
        }}
      </Show>

      <For each={RESEARCH_BRANCHES}>
        {entry => (
          <div class={`research-branch${isOpen(entry) ? ' is-open' : ''}`}>
            <button
              type="button"
              class="research-branch-head"
              aria-expanded={isOpen(entry)}
              onClick={() => toggle(entry)}
            >
              <FaChevronRight class="research-branch-chevron" />
              {branchLabel(entry)}
            </button>
            <Show when={isOpen(entry)}>
              <div class="research-branch-body">
                <For each={nodes(entry)}>
                  {node => {
                    const state = () => status(node);
                    const affordable = () => me().science >= node.cost;
                    const clickable = () =>
                      state() === 'available' && affordable() && !research().active && (!node.options || node.options.length === 0);
                    return (
                      <div
                        class={`kit-col research-node is-${state()}${clickable() ? ' is-clickable' : ''}${state() === 'available' && !affordable() ? ' is-unaffordable' : ''}`}
                        onClick={() => clickable() && start(node)}
                      >
                        <div class="hud-card-head">
                          <strong class="hud-card-name">{node.name}</strong>
                          <span class="research-status">
                            {state() === 'done' ? (
                              <FaCheck class="research-status-icon" />
                            ) : state() === 'active' ? (
                              <span class="kit-num">{secondsLeft(node)}s</span>
                            ) : (
                              <ScienceCost amount={node.cost} />
                            )}
                          </span>
                        </div>
                        <span class="research-desc">{node.description}</span>

                        <div class="research-chips">
                          <For each={node.effects}>{effect => <EffectChips effect={effect} />}</For>
                        </div>

                        <Show when={node.options && node.options.length > 0}>
                          <div class="kit-col">
                            <For each={node.options}>
                              {option => (
                                <button
                                  type="button"
                                  class="kit-button"
                                  disabled={state() !== 'available' || !affordable()}
                                  onClick={() => start(node, option.id)}
                                >
                                  {option.name}
                                </button>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        )}
      </For>
    </Panel>
  );
};
