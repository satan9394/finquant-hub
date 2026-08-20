// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatStarterDraft } from '../src/pages/Chat';

describe('ChatStarterDraft', () => {
  it('keeps a URL prompt editable without creating or sending anything', () => {
    const onChange = vi.fn();
    const onCreate = vi.fn();

    render(<ChatStarterDraft value="核验贵州茅台风险" onChange={onChange} onCreate={onCreate} />);

    expect(screen.getByDisplayValue('核验贵州茅台风险')).toBeTruthy();
    expect(screen.getByText(/URL 预填不会自动发送/)).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '核验现金流' } });
    expect(onChange).toHaveBeenCalledWith('核验现金流');
    expect(onCreate).not.toHaveBeenCalled();
  });
});
