/** Which Health Report visuals can be downloaded as images now. */
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'
import type { ImagePackListing } from '@/lib/imagePack'

export function useImagePack(orgId: string) {
  return useQuery({
    queryKey: ['image-pack', orgId],
    queryFn: () => apiClient.get<ImagePackListing>(endpoints.imagePack(orgId)),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}
