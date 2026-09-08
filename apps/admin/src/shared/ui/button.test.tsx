import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './primitives';

afterEach(cleanup);

describe('Button pending state', () => {
  it('keeps the action name, blocks repeat clicks and restores the action after completion', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>حفظ البرنامج</Button>);
    const button = screen.getByRole('button', { name: 'حفظ البرنامج' });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Button onClick={onClick} aria-busy>
        حفظ البرنامج
      </Button>,
    );
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleName('حفظ البرنامج');
    expect(button.querySelector('.button__spinner')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Button onClick={onClick} aria-busy={false}>
        حفظ البرنامج
      </Button>,
    );
    expect(button).toBeEnabled();
    expect(button.querySelector('.button__spinner')).toBeNull();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not show a spinner for an independently disabled neighboring action', () => {
    render(<Button disabled>نشر المقال</Button>);
    const button = screen.getByRole('button', { name: 'نشر المقال' });
    expect(button).toBeDisabled();
    expect(button.querySelector('.button__spinner')).toBeNull();
  });

  it('supports string-valued aria-busy and retains caller-disabled state after completion', () => {
    const { rerender } = render(
      <Button disabled aria-busy="true">
        إضافة الحساب
      </Button>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button').querySelector('.button__spinner')).not.toBeNull();
    rerender(
      <Button disabled aria-busy={false}>
        إضافة الحساب
      </Button>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button').querySelector('.button__spinner')).toBeNull();
  });
});
