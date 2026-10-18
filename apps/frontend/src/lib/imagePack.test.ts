import { describe, expect, it } from 'vitest'
import { IMAGE_CHOICES, packProblem, packSummary, visualQuery, type PackRequest } from './imagePack'

const req: PackRequest = {
  visuals: ['health_score', 'api_usage'],
  format: 'png',
  transparent: false,
  layouts: ['slide', 'crop'],
  images: true,
  pptx: false,
}

describe('image pack', () => {
  it('never asks for a transparent JPEG', () => {
    expect(visualQuery({ format: 'jpeg', transparent: true, layout: 'crop' })).toContain('transparent=false')
    expect(visualQuery({ format: 'png', transparent: true, layout: 'slide' })).toBe('format=png&transparent=true&layout=slide')
    expect(IMAGE_CHOICES.filter((c) => c.choice.format === 'jpeg').every((c) => !c.choice.transparent)).toBe(true)
  })

  it('says what the dialog will download, or why it cannot', () => {
    expect(packSummary(req)).toBe('ZIP of 4 images')
    expect(packSummary({ ...req, pptx: true })).toBe('ZIP of 4 images and a PowerPoint file')
    expect(packSummary({ ...req, images: false, pptx: true })).toBe('PowerPoint, 2 slides')
    expect(packProblem(req)).toBeNull()
    expect(packProblem({ ...req, visuals: [] })).toBe('Tick the summary or at least one image.')
    expect(packSummary({ ...req, visuals: ['summary'], layouts: ['slide'] })).toBe('ZIP of 1 image')
    expect(packProblem({ ...req, images: false })).toBe('Choose images, a PowerPoint file, or both.')
    expect(packProblem({ ...req, layouts: [] })).toBe('Choose at least one layout.')
    expect(packProblem({ ...req, layouts: [], images: false, pptx: true })).toBeNull()
  })
})
