import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  decideAdminOffer,
  decideAdminSwap,
  deleteAdminSwapOffers,
  deleteAdminSwaps,
  fetchAdminSwapsData,
  type AdminSwapOffer,
  type AdminSwapRequest,
} from '@/services/adminSwaps';

interface UseAdminSwapsOptions {
  tenantId?: string | null;
  reviewerId?: string;
}

export function useAdminSwaps({ tenantId, reviewerId }: UseAdminSwapsOptions) {
  const queryClient = useQueryClient();
  const queryKey = ['admin-swaps', tenantId ?? 'none'];

  const query = useQuery({
    queryKey,
    enabled: Boolean(tenantId),
    queryFn: async () => fetchAdminSwapsData(tenantId!),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const decideSwapMutation = useMutation({
    mutationFn: async (params: { swap: AdminSwapRequest; action: 'approved' | 'rejected'; adminNotes: string }) =>
      decideAdminSwap({
        tenantId: tenantId!,
        swap: params.swap,
        action: params.action,
        adminNotes: params.adminNotes,
      }),
    onSuccess: invalidate,
  });

  const decideOfferMutation = useMutation({
    mutationFn: async (params: { offer: AdminSwapOffer; action: 'accepted' | 'rejected' }) =>
      decideAdminOffer({
        tenantId: tenantId!,
        reviewerId,
        offer: params.offer,
        action: params.action,
      }),
    onSuccess: invalidate,
  });

  const deleteSwapsMutation = useMutation({
    mutationFn: deleteAdminSwaps,
    onSuccess: invalidate,
  });

  const deleteOffersMutation = useMutation({
    mutationFn: deleteAdminSwapOffers,
    onSuccess: invalidate,
  });

  return {
    ...query,
    swaps: query.data?.swaps ?? [],
    offers: query.data?.offers ?? [],
    decideSwap: decideSwapMutation.mutateAsync,
    decideOffer: decideOfferMutation.mutateAsync,
    deleteSwaps: deleteSwapsMutation.mutateAsync,
    deleteOffers: deleteOffersMutation.mutateAsync,
    isProcessingAdminSwaps:
      decideSwapMutation.isPending ||
      decideOfferMutation.isPending ||
      deleteSwapsMutation.isPending ||
      deleteOffersMutation.isPending,
  };
}
