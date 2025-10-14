import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlterModel as Alter } from '../../../types/ui';

vi.mock('../../components/common/GroupPicker', () => ({
  __esModule: true,
  default: () => <div data-testid="group-picker" />,
}));

vi.mock('../../components/common/SubsystemPicker', () => ({
  __esModule: true,
  default: () => <div data-testid="subsystem-picker" />,
}));

// Mock the service adapters instead of the generated api client
const groupGetMock = vi.fn().mockResolvedValue({ items: [], total: 0 });
const subsystemListMock = vi.fn().mockResolvedValue({ items: [], total: 0 });
const alterNamesMock = vi.fn();
const alterListMock = vi.fn();
const alterGetMock = vi.fn();

vi.mock('../../../src/services/groupService', () => ({
  listGroups: () => groupGetMock(),
  getGroupById: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../src/services/subsystemService', () => ({
  listSubsystems: () => subsystemListMock(),
  getSubsystemById: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../src/services/alterService', () => ({
  get_alters_names: (...args: any[]) => alterNamesMock(...args),
  get_alters: (...args: any[]) => alterListMock(...args),
  get_alters_by_id: (...args: any[]) => alterGetMock(...args),
  // provide aliases used by the module under test
  getAlterNames: (...args: any[]) => alterNamesMock(...args),
  listAlters: (...args: any[]) => alterListMock(...args),
  getAlterById: (...args: any[]) => alterGetMock(...args),
  // the helper used by useAlterRelationships
  getAlterNamesFallback: (...args: any[]) => alterNamesMock(...args),
} as any));

import AlterForm from '../../components/forms/AlterForm';

describe('useAlterRelationshipOptions', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // ensure default mocks return empty lists
    groupGetMock.mockResolvedValue({ items: [], total: 0 });
    subsystemListMock.mockResolvedValue({ items: [], total: 0 });
  });

  it('falls back to alters.list when names endpoint returns empty results', async () => {
    // getAlterNamesFallback should return an array of items (not wrapped in {data:...})
    alterNamesMock.mockResolvedValue([]);
    // listAlters is expected to return an object with an `items` array
    alterListMock.mockResolvedValue({
      items: [
        {
          id: '7',
          name: 'Alpha',
          username: 'alpha',
        },
      ],
      total: 1,
    });

    const { useAlterRelationshipOptions } = await import('../../components/forms/AlterFormDialog');
    const { result } = renderHook(() => useAlterRelationshipOptions({}));

    await act(async () => {
      await result.current.refreshPartnerOptions();
    });

    expect(alterNamesMock).toHaveBeenCalledTimes(1);
    expect(alterListMock).toHaveBeenCalledWith({ perPage: 1000 });
    expect(alterGetMock).not.toHaveBeenCalled();

    const option = result.current.partnerOptions[0];
    expect(result.current.partnerOptions).toHaveLength(1);
    expect(option.id).toBe('7');
    expect(option.label).toBe('Alpha (@alpha) #7');

    expect(result.current.partnerMap['Alpha (@alpha) #7']).toBe('7');
    expect(result.current.partnerMap['alpha']).toBe('7');
    expect(result.current.alterIdNameMap['7']).toBe('Alpha (@alpha) #7');
  });

  it('updates chips when selecting and removing relationships', async () => {
    const partnerOptions = [
      {
        id: '7',
        label: 'Alpha (@alpha) #7',
        aliases: ['alpha (@alpha) #7', 'alpha', '#7'],
      },
    ];
    const partnerMap = {
      'Alpha (@alpha) #7': '7',
      'alpha (@alpha) #7': '7',
      alpha: '7',
      '#7': '7',
      '7': '7',
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
