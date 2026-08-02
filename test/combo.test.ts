import { describe, expect, it } from 'vitest'
import { comboOf } from '../src/ui/combo'

describe('comboOf — the celebration ladder', () => {
  it('tier 3: five of a kind', () => {
    expect(comboOf([6, 6, 6, 6, 6], 'yacht')).toEqual({ tier: 3, title: 'YACHT' })
    expect(comboOf([2, 2, 2, 2, 2], 'yahtzee')).toEqual({ tier: 3, title: 'FIVE OF A KIND' })
  })

  it('tier 2: straights per ruleset', () => {
    expect(comboOf([1, 2, 3, 4, 5], 'yacht')).toEqual({ tier: 2, title: 'LITTLE STRAIGHT' })
    expect(comboOf([6, 5, 4, 3, 2], 'yacht')).toEqual({ tier: 2, title: 'BIG STRAIGHT' })
    expect(comboOf([1, 2, 3, 4, 6], 'yacht')).toBeNull() // 4-run means nothing in yacht
    expect(comboOf([1, 2, 3, 4, 6], 'yahtzee')).toEqual({ tier: 2, title: 'SMALL STRAIGHT' })
    expect(comboOf([2, 3, 4, 5, 6], 'yahtzee')).toEqual({ tier: 2, title: 'LARGE STRAIGHT' })
  })

  it('tier 1: four of a kind and full house', () => {
    expect(comboOf([3, 3, 3, 3, 1], 'yacht')).toEqual({ tier: 1, title: 'FOUR OF A KIND' })
    expect(comboOf([2, 2, 3, 3, 3], 'yahtzee')).toEqual({ tier: 1, title: 'FULL HOUSE' })
  })

  it('nothing for plain hands or unrolled dice', () => {
    expect(comboOf([1, 2, 2, 4, 6], 'yacht')).toBeNull()
    expect(comboOf([0, 0, 0, 0, 0], 'yacht')).toBeNull()
  })
})
