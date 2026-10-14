import { describe, expect, it } from 'vitest'
import {
  NODE_TYPE_STYLES,
  approximateMeasure,
  chipLayout,
  edgeColor,
  initials,
  legendFor,
  objectCardSize,
} from './graphStyle'

describe('graph style', () => {
  it('uses the agreed type colors', () => {
    expect(NODE_TYPE_STYLES.profile.color).toBe('#3987E5')
    expect(NODE_TYPE_STYLES.permission_set.color).toBe('#199E70')
    expect(NODE_TYPE_STYLES.permission_set_group.color).toBe('#D95926')
    expect(NODE_TYPE_STYLES.muting_permission_set).toMatchObject({ color: '#E66767', dashed: true, outline: true })
    expect(NODE_TYPE_STYLES.role.color).toBe('#94A3B8')
    expect(NODE_TYPE_STYLES.group).toMatchObject({ label: 'Public Group', outline: true })
  })

  it('sizes each chip to fit its name and caption', () => {
    const short = chipLayout('Sales Rep', 'profile')
    const long = chipLayout('Sales Manager Bundle Muting', 'muting_permission_set')
    expect(long.width).toBeGreaterThan(short.width)
    const textWidth = approximateMeasure(long.name, '600 12px x')
    expect(long.textX + textWidth).toBeLessThan(long.width)
    // Even the long caption fits on a short name.
    const caption = chipLayout('X', 'permission_set_group')
    expect(caption.textX + approximateMeasure('PERMISSION SET GROUP', '600 8.5px x')).toBeLessThan(caption.width)
  })

  it('truncates very long names instead of spilling', () => {
    const chip = chipLayout('A'.repeat(200), 'permission_set')
    expect(chip.name.endsWith('…')).toBe(true)
    expect(chip.width).toBeLessThan(300)
  })

  it('colors edges by their target, except includes and mutes', () => {
    expect(edgeColor('ASSIGNED_PERMISSION_SET', 'permission_set', 1)).toBe('rgba(25, 158, 112, 1)')
    expect(edgeColor('HAS_PROFILE', 'profile', 0.5)).toBe('rgba(57, 135, 229, 0.5)')
    expect(edgeColor('MUTES', 'muting_permission_set', 1)).toBe('rgba(230, 103, 103, 1)')
    expect(edgeColor('INCLUDES_PERMISSION_SET', 'permission_set', 1)).toBe('rgba(217, 89, 38, 1)')
  })

  it('makes initials', () => {
    expect(initials('Sales Agent1')).toBe('SA')
    expect(initials('Noor Whitlock')).toBe('NW')
    expect(initials('Cher')).toBe('C')
    expect(initials('')).toBe('?')
  })

  it('reserves room for an object card', () => {
    expect(objectCardSize(3).height).toBeLessThan(objectCardSize(20).height)
    expect(objectCardSize(200).height).toBe(objectCardSize(50).height)
  })

  it('shows only the types present, grouped Who / Grants / Removes / What', () => {
    const groups = legendFor({
      nodes: [{ type: 'user' }, { type: 'profile' }, { type: 'permission_set_group' }, { type: 'muting_permission_set' }],
      edges: [{ type: 'MUTES' }],
    })
    expect(groups.map((g) => g.title)).toEqual(['Who', 'Grants', 'Removes'])
    expect(groups[0].types).toEqual(['user', 'profile'])
    expect(groups[2]).toMatchObject({ types: ['muting_permission_set'], edges: ['MUTES'] })
  })
})
