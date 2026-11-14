import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { buildLLMText } from '../../core/copyForLLM.js';
import { CopyForLLMButton } from './CopyForLLMButton.js';
import type { LensRecorder } from '../../core/LensRecorder.js';
import type { Humanizer } from '../../core/humanizer.js';
vi.mock('../../core/copyForLLM.js', () => ({ buildLLMText: vi.fn() }));
vi.mock('../recordedContext.js', () => ({ useRecordedContext: () => undefined }));
const mount = () => render(<CopyForLLMButton recorder={{} as LensRecorder} humanizer={{} as Humanizer} appName="test" />);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('copy adapter', () => {
  it('does not touch the clipboard when formatting refuses', async () => {
    const writeText = vi.fn(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    vi.mocked(buildLLMText).mockImplementation(() => { throw new Error('private value'); });
    mount(); fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('button', { name: 'Run could not be copied safely' });
    expect(writeText).not.toHaveBeenCalled(); expect(document.querySelector('textarea')).toBeNull();
    expect(document.body.textContent).not.toContain('private value');
  });
  it('copies the complete formatted text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    vi.mocked(buildLLMText).mockReturnValue('complete text'); mount(); fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('complete text'));
  });
  it('retains the textarea fallback and removes it afterwards', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const copy = vi.fn().mockReturnValue(true); Object.defineProperty(document, 'execCommand', { configurable: true, value: copy });
    vi.mocked(buildLLMText).mockReturnValue('fallback text'); mount(); fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(copy).toHaveBeenCalledWith('copy'));
    expect(document.querySelector('textarea')).toBeNull();
  });
});
