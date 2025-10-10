import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alter } from '@didhub/api-client';

vi.mock('../../components/common/GroupPicker', () => ({
  __esModule: true,
  default: () => <div data-testid="group-picker" />,
}));

vi.mock('../../components/common/SubsystemPicker', () => ({
  __esModule: true,
  default: () => <div data-testid="subsystem-picker" />,
}));

import AlterForm from '../../components/forms/AlterForm';

describe('useAlterRelationshipOptions', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const mod = await import('@didhub/api-client');
    (mod as any).apiClient.group.get_groups = vi.fn().mockResolvedValue({ data: { items: [], total: 0 } });
    (mod as any).apiClient.subsystem.get_subsystems = vi.fn().mockResolvedValue({
      data: { items: [], total: 0 },
    });
  });

  it('falls back to alters.list when names endpoint returns empty results', async () => {
    const mod = await import('@didhub/api-client');
    const mockNames = vi.fn().mockResolvedValue({ data: [] });
    const mockList = vi.fn().mockResolvedValue({
      data: {
        items: [
        {
          id: 7,
          name: 'Alpha',
          username: 'alpha',
        },
      ],
        total: 1,
      },
    });
    const mockGet = vi.fn();
    (mod as any).apiClient.alter.get_alters_names = mockNames;
    (mod as any).apiClient.alter.get_alters = mockList;
    (mod as any).apiClient.alter.get_alters_by_id = mockGet;

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
