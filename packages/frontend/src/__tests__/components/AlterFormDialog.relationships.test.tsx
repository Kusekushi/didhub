import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alter } from '@didhub/api-client';

vi.mock('../GroupPicker', () => ({
  __esModule: true,
  default: () => <div data-testid="group-picker" />,
}));

vi.mock('../SubsystemPicker', () => ({
  __esModule: true,
  default: () => <div data-testid="subsystem-picker" />,
}));

import AlterForm from '../../components/forms/AlterForm';

describe('useAlterRelationshipOptions', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const mod = await import('@didhub/api-client');
    (mod as any).apiClient.groups.list = vi.fn().mockResolvedValue({ items: [] });
    (mod as any).apiClient.subsystems.list = vi.fn().mockResolvedValue({ items: [] });
  });

  it('falls back to alters.list when names endpoint returns empty results', async () => {
    const mod = await import('@didhub/api-client');
    const mockNames = vi.fn().mockResolvedValue([]);
    const mockList = vi.fn().mockResolvedValue({
      items: [
        {
          id: 7,
          name: 'Alpha',
          username: 'alpha',
        },
      ],
    });
    const mockGet = vi.fn();
    (mod as any).apiClient.alters.names = mockNames;
    (mod as any).apiClient.alters.list = mockList;
    (mod as any).apiClient.alters.get = mockGet;

    const { useAlterRelationshipOptions } = await import('../../components/forms/AlterFormDialog');
    const { result } = renderHook(() => useAlterRelationshipOptions({}));

    await act(async () => {
      await result.current.refreshPartnerOptions();
    });

    expect(mockNames).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledWith({ perPage: 1000 });
    expect(mockGet).not.toHaveBeenCalled();

    const option = result.current.partnerOptions[0];
    expect(result.current.partnerOptions).toHaveLength(1);
    expect(option.id).toBe(7);
    expect(option.label).toBe('Alpha (@alpha) #7');

    expect(result.current.partnerMap['Alpha (@alpha) #7']).toBe(7);
    expect(result.current.partnerMap['alpha']).toBe(7);
    expect(result.current.alterIdNameMap['7']).toBe('Alpha (@alpha) #7');
  });

  it('updates chips when selecting and removing relationships', async () => {
    const partnerOptions = [
      {
        id: 7,
        label: 'Alpha (@alpha) #7',
        aliases: ['alpha (@alpha) #7', 'alpha', '#7'],
      },
    ];
    const partnerMap = {
      'Alpha (@alpha) #7': 7,
      'alpha (@alpha) #7': 7,
      alpha: 7,
      '#7': 7,
      '7': 7,
    } as Record<string, number | string>;
    const alterIdNameMap = { '7': 'Alpha (@alpha) #7' };

    function Wrapper() {
      const [values, setValues] = React.useState<Partial<Alter>>({
        partners: [],
        parents: [],
        children: [],
        user_partners: [],
        user_parents: [],
        user_children: [],
      });

      return (
        <div>
          <AlterForm
            values={values}
            errors={{}}
            partnerOptions={partnerOptions}
            partnerMap={partnerMap}
            parentOptions={partnerOptions}
            parentMap={partnerMap}
            childOptions={partnerOptions}
            childMap={partnerMap}
            alterIdNameMap={alterIdNameMap}
            userPartnerOptions={[]}
            userPartnerMap={{}}
            userParentOptions={[]}
            userParentMap={{}}
            userChildOptions={[]}
            userChildMap={{}}
            onChange={(key, val) => setValues((prev) => ({ ...prev, [key]: val }))}
            onFile={() => {}}
            progressMap={{}}
            partnerLabel="Partner(s)"
          />
          <div data-testid="partner-count">{Array.isArray(values.partners) ? values.partners.length : 0}</div>
        </div>
      );
    }

    const user = userEvent.setup();
    render(<Wrapper />);

    const partnerInput = screen.getByLabelText('Partner(s)');
    await user.click(partnerInput);
    await user.keyboard('Alpha{Enter}');

    expect(await screen.findByText('Alpha (@alpha)')).toBeInTheDocument();
    expect(screen.getByTestId('partner-count')).toHaveTextContent('1');

    await user.keyboard('{Backspace}');

    expect(screen.queryByText('Alpha (@alpha)')).not.toBeInTheDocument();
    expect(screen.getByTestId('partner-count')).toHaveTextContent('0');
  });
});
