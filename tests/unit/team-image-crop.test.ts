import { describe, expect, it } from 'vitest'
import { TEAM_IMAGE_ASPECT, fitCrop } from '@/lib/team-images'

describe('fitCrop', () => {
  it('takes the middle at the right shape when nothing was chosen', () => {
    expect(fitCrop(null, 3000, 2000, TEAM_IMAGE_ASPECT.banner)).toEqual({ x: 0, y: 750, width: 3000, height: 500 })
    expect(fitCrop(null, 3000, 2000, TEAM_IMAGE_ASPECT.logo)).toEqual({ x: 500, y: 0, width: 2000, height: 2000 })
  })

  it('keeps the part the owner picked', () => {
    const picked = { x: 120, y: 900, width: 1800, height: 300 }
    expect(fitCrop(picked, 3000, 2000, 6)).toEqual(picked)
  })

  it('fixes rounding drift in the shape around the same middle', () => {
    expect(fitCrop({ x: 100, y: 100, width: 1200, height: 201 }, 3000, 2000, 6)).toEqual({
      x: 100,
      y: 101,
      width: 1200,
      height: 200,
    })
  })

  it('never reaches past the edges of the picture', () => {
    const c = fitCrop({ x: 2900, y: 1950, width: 600, height: 100 }, 3000, 2000, 6)
    expect(c.x + c.width).toBeLessThanOrEqual(3000)
    expect(c.y + c.height).toBeLessThanOrEqual(2000)
    expect(c.x).toBeGreaterThanOrEqual(0)
    expect(c.width / c.height).toBeCloseTo(6, 1)
  })

  it('shrinks a crop bigger than the picture and keeps it inside', () => {
    expect(fitCrop({ x: -50, y: -50, width: 9000, height: 1500 }, 1200, 800, 6)).toEqual({
      x: 0,
      y: 600,
      width: 1200,
      height: 200,
    })
  })
})
