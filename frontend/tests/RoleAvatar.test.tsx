// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import RoleAvatar from '../src/components/RoleAvatar';

describe('RoleAvatar', () => {
  test('renders a known role with its semantic fallback icon', () => {
    const { container } = render(<RoleAvatar name="risk_manager" />);

    expect(screen.getByText('risk_manager')).toBeTruthy();
    expect(container.querySelector('.anticon-safety-certificate')).toBeTruthy();
  });

  test('uses a safe image URL and exposes the avatar as an image', () => {
    render(<RoleAvatar name="analyst" avatar="https://example.com/avatar.png" />);

    expect(screen.getByRole('img').getAttribute('src')).toBe('https://example.com/avatar.png');
  });
});
