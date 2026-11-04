import React from 'react';
import { render } from '@testing-library/react';
import { expect, it } from 'vitest';

import { DoorRefusalCard } from './DoorRefusalCard.js';

it('renders the door and its three refusal sentences in the documented order', () => {
  const { getByRole } = render(
    <DoorRefusalCard
      door="Inspection"
      reads="an agent recording"
      received="an empty list"
      goTo="Record the run first."
    />,
  );
  const card = getByRole('note');
  expect(card.firstElementChild?.textContent).toBe('Inspection · not the input this lens reads');
  expect(Array.from(card.querySelectorAll('p'), (paragraph) => paragraph.textContent)).toEqual([
    'This lens reads an agent recording.',
    'What you passed looks like an empty list.',
    'Record the run first.',
  ]);
});
