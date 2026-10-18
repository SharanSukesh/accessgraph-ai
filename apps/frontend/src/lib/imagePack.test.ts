import { describe, expect, it } from 'vitest'
import { IMAGE_CHOICES, packProblem, packSummary, visualQuery, type PackRequest } from './imagePack'

const req: PackRequest = {
  visuals: ['health_score', 'api_usage'],
  format: 'png',
  transparent: false,
  layouts: ['slide', 'crop'],
  images: true,
  pptx: false,
  firm_logo: true,
  client_logo: false,
}

describe('image pack', () => {
  it('never asks for a transparent JPEG', () => {
    expect(visualQuery({ format: 'jpeg', transparent: true, layout: 'crop' })).toContain('transparent=false')
    expect(visualQuery({ format: 'png', transparent: true, layout: 'slide' }, { firm_logo: false, client_logo: true })).toBe(
      'format=png&transparent=true&layout=slide&firm_logo=false&client_logo=true',
    )
    expect(IMAGE_CHOICES.filter((c) => c.choice.format === 'jpeg').every((c) => !c.choice.transparent)).toBe(true)
  })

  it('says what the dialog will download, or why it cannot', () => {
    expect(packSummary(req)).toBe('ZIP of 4 images')
    expect(packSummary({ ...req, pptx: true })).toBe('ZIP of 4 images and a PowerPoint file')
    expect(packSummary({ ...req, images: false, pptx: true })).toBe('PowerPoint, 2 slides')
    expect(packProblem(req)).toBeNull()
    expect(packProblem({ ...req, visuals: [] })).toBe('Tick at least one visual.')
    expect(packProblem({ ...req, images: false })).toBe('Choose images, a PowerPoint file, or both.')
    expect(packProblem({ ...req, layouts: [] })).toBe('Choose at least one layout.')
    expect(packProblem({ ...req, layouts: [], images: false, pptx: true })).toBeNull()
  })
})
