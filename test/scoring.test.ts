import { describe, expect, it } from 'vitest'
import {
  earnsFiveKindBonus,
  jokerActive,
  legalCategories,
  ruleset,
  scoreValue,
  totalScore,
  upperBonusEarned,
} from '../src/engine'
import type { CategoryId, Scorecard } from '../src/engine'

const yacht = ruleset('yacht')
const yz = ruleset('yahtzee')

const card = (marks: Partial<Record<CategoryId, number>> = {}, bonuses = 0): Scorecard => ({
  marks,
  fiveKindBonuses: bonuses,
})

describe('classic Yacht scoring', () => {
  it('has 12 categories and no threeKind', () => {
    expect(yacht.categories).toHaveLength(12)
    expect(yacht.categories).not.toContain('threeKind')
  })

  const cases: Array<[CategoryId, number[], number]> = [
    ['ones', [1, 1, 3, 4, 1], 3],
    ['sixes', [6, 6, 1, 2, 3], 12],
    ['choice', [2, 3, 4, 5, 6], 20],
    // fourKind scores only the four matched dice
    ['fourKind', [3, 3, 3, 3, 6], 12],
    ['fourKind', [5, 5, 5, 5, 5], 20],
    ['fourKind', [2, 2, 2, 5, 6], 0],
    // fullHouse = sum of ALL dice, exactly 3+2
    ['fullHouse', [2, 2, 3, 3, 3], 13],
    ['fullHouse', [6, 6, 6, 5, 5], 28],
    ['fullHouse', [4, 4, 4, 4, 4], 0], // five of a kind is NOT a full house
    ['fullHouse', [2, 2, 3, 3, 6], 0],
    // exact straights, 30 each
    ['smallStraight', [1, 2, 3, 4, 5], 30],
    ['smallStraight', [5, 4, 3, 2, 1], 30],
    ['smallStraight', [2, 3, 4, 5, 6], 0],
    ['largeStraight', [2, 3, 4, 5, 6], 30],
    ['largeStraight', [1, 2, 3, 4, 5], 0],
    ['fiveKind', [4, 4, 4, 4, 4], 50],
    ['fiveKind', [4, 4, 4, 4, 5], 0],
  ]
  it.each(cases)('%s on %j scores %i', (cat, dice, expected) => {
    expect(scoreValue(yacht, cat, dice, card())).toBe(expected)
  })

  it('has no upper bonus and no five-kind bonus', () => {
    const c = card({ ones: 3, twos: 8, threes: 12, fours: 16, fives: 20, sixes: 24 })
    expect(upperBonusEarned(yacht, c)).toBe(0)
    expect(earnsFiveKindBonus(yacht, [3, 3, 3, 3, 3], card({ fiveKind: 50 }))).toBe(false)
  })
})

describe('Yahtzee-style scoring', () => {
  it('has 13 categories including threeKind', () => {
    expect(yz.categories).toHaveLength(13)
    expect(yz.categories).toContain('threeKind')
  })

  const cases: Array<[CategoryId, number[], number]> = [
    ['threeKind', [3, 3, 3, 2, 6], 17], // sum of ALL dice
    ['threeKind', [3, 3, 2, 2, 6], 0],
    ['fourKind', [3, 3, 3, 3, 6], 18], // sum of ALL dice
    ['fourKind', [5, 5, 5, 5, 5], 25],
    ['fullHouse', [2, 2, 3, 3, 3], 25],
    ['fullHouse', [2, 2, 3, 3, 6], 0],
    // runs of 4 / 5
    ['smallStraight', [1, 2, 3, 4, 6], 30],
    ['smallStraight', [3, 4, 5, 6, 6], 30],
    ['smallStraight', [1, 2, 3, 5, 6], 0],
    ['largeStraight', [2, 3, 4, 5, 6], 40],
    ['largeStraight', [1, 2, 3, 4, 5], 40],
    ['largeStraight', [1, 2, 3, 4, 6], 0],
    ['fiveKind', [6, 6, 6, 6, 6], 50],
    ['choice', [1, 1, 2, 6, 6], 16],
  ]
  it.each(cases)('%s on %j scores %i', (cat, dice, expected) => {
    expect(scoreValue(yz, cat, dice, card())).toBe(expected)
  })

  it('awards the upper bonus at exactly 63', () => {
    const at62 = card({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 17 })
    const at63 = card({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 })
    expect(upperBonusEarned(yz, at62)).toBe(0)
    expect(upperBonusEarned(yz, at63)).toBe(35)
  })

  it('totals marks + upper bonus + 100 per extra five-kind', () => {
    const c = card(
      { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, fiveKind: 50 },
      2,
    )
    expect(totalScore(yz, c)).toBe(63 + 35 + 50 + 200)
  })
})

describe('the Joker rule (Yahtzee-style only)', () => {
  const fives = [5, 5, 5, 5, 5]

  it('is inactive while the fiveKind box is open', () => {
    expect(jokerActive(yz, fives, card())).toBe(false)
    expect(legalCategories(yz, fives, card()).length).toBe(13)
  })

  it('forces the matching upper box first', () => {
    const c = card({ fiveKind: 50 })
    expect(jokerActive(yz, fives, c)).toBe(true)
    expect(legalCategories(yz, fives, c)).toEqual(['fives'])
  })

  it('then allows any lower box at its fixed value', () => {
    const c = card({ fiveKind: 50, fives: 15 })
    const legal = legalCategories(yz, fives, c)
    expect(legal).toContain('fullHouse')
    expect(legal).toContain('smallStraight')
    expect(legal).toContain('largeStraight')
    expect(legal).not.toContain('ones')
    // Joker fixed values despite the dice being five of a kind
    expect(scoreValue(yz, 'fullHouse', fives, c)).toBe(25)
    expect(scoreValue(yz, 'smallStraight', fives, c)).toBe(30)
    expect(scoreValue(yz, 'largeStraight', fives, c)).toBe(40)
    expect(scoreValue(yz, 'fourKind', fives, c)).toBe(25) // sum of dice as usual
  })

  it('finally forces zeroing an upper box when the lower section is full', () => {
    const lowerFull: Partial<Record<CategoryId, number>> = {
      fiveKind: 50,
      fives: 15,
      threeKind: 20,
      fourKind: 22,
      fullHouse: 25,
      smallStraight: 30,
      largeStraight: 40,
      choice: 21,
    }
    const legal = legalCategories(yz, fives, card(lowerFull))
    expect(legal.every((c) => ['ones', 'twos', 'threes', 'fours', 'sixes'].includes(c))).toBe(
      true,
    )
    expect(scoreValue(yz, 'twos', fives, card(lowerFull))).toBe(0)
  })

  it('pays the 100 bonus only when fiveKind holds a 50', () => {
    expect(earnsFiveKindBonus(yz, fives, card({ fiveKind: 50 }))).toBe(true)
    expect(earnsFiveKindBonus(yz, fives, card({ fiveKind: 0 }))).toBe(false)
    expect(earnsFiveKindBonus(yz, [5, 5, 5, 5, 4], card({ fiveKind: 50 }))).toBe(false)
  })

  it('never applies in classic Yacht', () => {
    const c = card({ fiveKind: 50 })
    expect(jokerActive(yacht, fives, c)).toBe(false)
    // full house still requires 3+2 — five fives scores 0 there
    expect(scoreValue(yacht, 'fullHouse', fives, c)).toBe(0)
  })
})
