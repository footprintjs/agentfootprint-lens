/** Real dependency/default wiring; deliberately no module or humanizer mock. */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { defaultHumanizer, makeTeachingHumanizer } from '../../src/core/humanizer.js';
import { observeRecording } from '../../src/core/observeRecording.js';
import { Lens } from '../../src/react/index.js';
import { load } from '../served/helpers.js';

describe('<Lens view="analyst"> real default narration wiring', () => {
  it('shows the recorded proposal and hidden names in both analyst voices', () => {
    const { recording } = load('flat-dynamic-tools');
    const events = recording.events!.map(event => event.type === 'agentfootprint.stream.tool_start'
      ? { ...event, payload: { ...event.payload, args: { credential: 'PRIVATE-VALUE' },
        shownArgs: { region: 'west' }, hiddenArgs: ['credential'] } }
      : event);
    const { recorder } = observeRecording({ ...recording, events });
    const { container, rerender } = render(<Lens recorder={recorder} view="analyst" />);
    for (const voice of [undefined, defaultHumanizer]) {
      if (voice) rerender(<Lens recorder={recorder} view="analyst" humanizer={voice} />);
      expect(container.textContent).toContain('Shown arguments: {"region":"west"}. Hidden arguments: credential.');
      expect(container.textContent).not.toContain('PRIVATE-VALUE');
    }
  });

  it('renders installed teaching-humanizer lines for configuration, integrity, LLM and tool events', () => {
    const fixture = load('flat-dynamic-tools');
    const humanize = makeTeachingHumanizer({
      getToolDescription: (name) => name === 'alpha_tool' ? 'the alpha_tool tool' : undefined,
    });
    render(<Lens recorder={fixture.recorder} view="analyst" />);
    const identities = [
      ['agentfootprint.agent.run_configured', 'run-configured#0'],
      ['agentfootprint.stream.llm_start', 'call-llm#18'],
      ['agentfootprint.stream.tool_start', 'tool-calls#22'],
      ['agentfootprint.stream.llm_end', 'call-llm#40'],
      ['agentfootprint.integrity.disposition', 'integrity-disposition#0'],
    ] as const;
    for (const [type, runtimeStageId] of identities) {
      const event = fixture.recording.events!.find((entry) => entry.type === type && entry.meta.runtimeStageId === runtimeStageId);
      expect(event, `${type} fixture event`).toBeDefined();
      const caption = humanize(event!);
      expect(caption, `${type} selected line`).not.toBeNull();
      expect(caption?.length).toBeGreaterThan(0);
      expect(screen.getByText(caption!)).toBeInTheDocument();
    }
  });

  it('passes consumer app name and partial commentary templates into the default humanizer', () => {
    const fixture = load('flat-dynamic-tools');
    render(<Lens recorder={fixture.recorder} view="analyst" appName="Workspace"
      commentaryTemplates={{ 'agent.turn_start': '{{appName}} heard "{{userPrompt}}" via the consumer template.' }} />);
    expect(screen.getByText('Workspace heard "go" via the consumer template.')).toBeInTheDocument();
    const event = fixture.recording.events!.find((entry) => entry.type === 'agentfootprint.stream.llm_start')!;
    const caption = makeTeachingHumanizer({ appName: 'Workspace' })(event);
    expect(caption).not.toBeNull();
    expect(screen.getByText(caption!)).toBeInTheDocument();
  });
});
